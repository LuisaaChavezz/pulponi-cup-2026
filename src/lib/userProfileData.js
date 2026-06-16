import { parsePickScore, collectMatchPickScores } from './communityPicks';
import { buildRankedLeaderboard, getProfileRankingSummary } from './rankingHistory';
import { LEADERBOARD_PUBLIC_COLUMNS, LEADERBOARD_SOURCE } from './leaderboardQuery';
import { formatKickoff, hasRecordedScores, isProfilePickRevealed, matchHasFinalScore, uiStatus } from './matchUtils';
import { formatActivityLogMessage } from './activityMessages';
import { filterUserBadgeRowsForProfile, resolveBadgePresentation } from '../data/achievements';
import { computePulpoDerivedStats } from './pulpoIndex';
import { aggregatePickScoreRowsForProfile, enrichProfilesWithPickScores, getPerformanceStatsForProfile } from './pickScoreStats';

function pickMap(profile) {
  const raw = profile?.picks;
  return raw && typeof raw === 'object' ? raw : {};
}

function matchesById(matches) {
  const map = new Map();
  for (const m of matches ?? []) {
    if (m?.id != null) map.set(String(m.id), m);
    if (m?.official_id) map.set(String(m.official_id), m);
  }
  return map;
}

function formatFinalScoreLabel(match) {
  if (!match || !hasRecordedScores(match)) return '—';
  const home = Math.round(Number(match.home_score));
  const away = Math.round(Number(match.away_score));
  if (!Number.isFinite(home) || !Number.isFinite(away)) return '—';
  return `${home}–${away}`;
}

function pickHistoryStatusFromScore(ps) {
  if (!ps) return null;
  if (ps.exact_hit) return { status: 'Acertó', statusClass: 'exact' };
  if (ps.winner_hit) return { status: 'Ganador', statusClass: 'winner' };
  return { status: 'Falló', statusClass: 'miss' };
}

async function ensureMatchesForPicks(client, profile, matches) {
  const picks = pickMap(profile);
  const keys = Object.keys(picks);
  if (!keys.length) return matches ?? [];

  const index = matchesById(matches);
  const missing = keys.filter((key) => !index.has(String(key)));
  if (!missing.length) return matches ?? [];

  const extra = [];
  const byId = await safeQuery(
    client.from('matches').select('*').in('id', missing),
    'matches by id for pick history'
  );
  if (Array.isArray(byId)) extra.push(...byId);

  const foundKeys = new Set(extra.flatMap((m) => [String(m.id), m.official_id ? String(m.official_id) : null].filter(Boolean)));
  const stillMissing = missing.filter((key) => !foundKeys.has(String(key)));
  if (stillMissing.length) {
    const byOfficial = await safeQuery(
      client.from('matches').select('*').in('official_id', stillMissing),
      'matches by official_id for pick history'
    );
    if (Array.isArray(byOfficial)) extra.push(...byOfficial);
  }

  if (!extra.length) return matches ?? [];
  const merged = new Map((matches ?? []).map((m) => [String(m.id), m]));
  for (const row of extra) merged.set(String(row.id), row);
  return [...merged.values()];
}

const EMPTY_STATS = {
  predicted: 0,
  correctResults: 0,
  exacts: 0,
  effectiveness: 0,
  riskyHits: 0,
  bestStreak: 0,
  currentStreak: 0,
  bestRank: null,
  currentRank: null,
  points: 0,
  pulpoIndex: 0,
};

async function safeQuery(clientPromise, label, fallback = []) {
  try {
    const res = await clientPromise;
    if (res?.error) {
      console.warn(`[loadPublicProfile] ${label}`, res.error.message);
      return fallback;
    }
    return res?.data ?? fallback;
  } catch (e) {
    console.warn(`[loadPublicProfile] ${label}`, e?.message ?? e);
    return fallback;
  }
}

async function loadUserBadges(client, profileId) {
  const withJoin = await safeQuery(
    client
      .from('user_badges')
      .select('profile_id, badge_id, earned_at, badges ( id, name, description, icon )')
      .eq('profile_id', profileId)
      .order('earned_at', { ascending: false }),
    'user_badges'
  );
  if (Array.isArray(withJoin)) {
    return withJoin.filter((row) => String(row.profile_id) === String(profileId));
  }
  const fallback = await safeQuery(
    client
      .from('user_badges')
      .select('profile_id, badge_id, earned_at')
      .eq('profile_id', profileId)
      .order('earned_at', { ascending: false }),
    'user_badges fallback'
  );
  return Array.isArray(fallback)
    ? fallback.filter((row) => String(row.profile_id) === String(profileId))
    : fallback;
}

export function computeBestStreak(pickScoreRows, matchIndex) {
  const sorted = [...(pickScoreRows ?? [])].sort((a, b) => {
    const ma = matchIndex.get(String(a.match_id));
    const mb = matchIndex.get(String(b.match_id));
    const ta = ma?.kickoff ? new Date(ma.kickoff).getTime() : 0;
    const tb = mb?.kickoff ? new Date(mb.kickoff).getTime() : 0;
    if (ta !== tb) return ta - tb;
    return String(a.match_id).localeCompare(String(b.match_id));
  });

  let best = 0;
  let run = 0;
  for (const row of sorted) {
    if (row.exact_hit || row.winner_hit) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best;
}

export function countRiskyExactHits(profileId, pickScoreRows, communityProfiles, profile) {
  const exactRows = (pickScoreRows ?? []).filter((r) => r.exact_hit);
  let count = 0;
  for (const row of exactRows) {
    const mid = String(row.match_id);
    const pick = parsePickScore(pickMap(profile)[mid]);
    if (!pick) continue;
    const scores = collectMatchPickScores(communityProfiles, mid);
    if (scores.length < 3) continue;
    const exactCount = scores.filter((s) => s.home === pick.home && s.away === pick.away).length;
    const pct = Math.round((exactCount / scores.length) * 100);
    if (exactCount <= 1 || pct < 5) count += 1;
  }
  return count;
}

export function buildPickHistoryRows(profile, pickScoreRows, matches, communityProfiles) {
  try {
    const picks = pickMap(profile);
    const scoreByMatch = new Map((pickScoreRows ?? []).map((r) => [String(r.match_id), r]));
    const matchIndex = matchesById(matches);
    const rows = [];

    for (const [matchId, rawPick] of Object.entries(picks)) {
      const pick = parsePickScore(rawPick);
      if (!pick) continue;

      const match = matchIndex.get(String(matchId));
      if (!match) continue;

      const ps =
        scoreByMatch.get(String(matchId)) ??
        scoreByMatch.get(String(match.id)) ??
        (match.official_id ? scoreByMatch.get(String(match.official_id)) : null);
      const hasResult = matchHasFinalScore(match);
      const revealed = isProfilePickRevealed(match);
      const matchStatus = uiStatus(match.status, match.api_status);
      const scored = pickHistoryStatusFromScore(ps);

      let status = matchStatus;
      let statusClass = 'pending';
      let points = null;

      if (hasResult) {
        if (scored) {
          status = scored.status;
          statusClass = scored.statusClass;
          points = Number(ps.points_awarded ?? 0);
        } else {
          status = 'Final';
          statusClass = 'finished';
        }
      } else if (revealed) {
        status = matchStatus;
        statusClass = 'pending';
      } else {
        status = 'Próximo';
        statusClass = 'locked';
      }

      rows.push({
        matchId,
        matchLabel: `${match.home_team ?? 'Local'} vs ${match.away_team ?? 'Visitante'}`,
        kickoff: match.kickoff,
        kickoffLabel: formatKickoff(match.kickoff) || '—',
        matchRawStatus: match.status,
        matchApiStatus: match.api_status,
        matchStatus,
        pickRevealed: revealed,
        hasResult,
        prediction: `${pick.home}–${pick.away}`,
        finalResult: formatFinalScoreLabel(match),
        points,
        status: revealed || hasResult ? status : 'Próximo',
        statusClass: revealed || hasResult ? statusClass : 'locked',
      });
    }

    return rows.sort((a, b) => {
      const ta = a.kickoff ? new Date(a.kickoff).getTime() : 0;
      const tb = b.kickoff ? new Date(b.kickoff).getTime() : 0;
      return tb - ta;
    });
  } catch (e) {
    console.warn('[buildPickHistoryRows]', e?.message ?? e);
    return [];
  }
}

export function buildUserStats(profile, pickScoreRows, matches, communityProfiles, rankingSummary) {
  try {
    const scored = aggregatePickScoreRowsForProfile(pickScoreRows ?? []);
    const matchIndex = matchesById(matches);

    return {
      predicted: scored.predicted,
      correctResults: scored.correctResults,
      exacts: scored.exacts,
      effectiveness: scored.effectiveness,
      riskyHits: countRiskyExactHits(profile?.id, pickScoreRows, communityProfiles, profile),
      bestStreak: computeBestStreak(pickScoreRows, matchIndex),
      currentStreak: Number(profile?.streak ?? 0),
      bestRank: rankingSummary?.currentRank ?? null,
      currentRank: rankingSummary?.currentRank ?? null,
      points: scored.points,
      pulpoIndex: Number(profile?.pulpo_index ?? 0),
    };
  } catch (e) {
    console.warn('[buildUserStats]', e?.message ?? e);
    return { ...EMPTY_STATS };
  }
}

export function mapUserActivityRows(rows, profile, matchIndex) {
  const username = profile?.username;
  const out = [];

  if (profile?.created_at) {
    out.push({
      id: 'joined',
      text: `@${username ?? 'jugador'} se registró en Pulponi Cup`,
      at: profile.created_at,
    });
  }

  for (const row of rows ?? []) {
    try {
      const formatted = formatActivityLogMessage(
        {
          action: row.action,
          payload: row.payload,
          profiles: { username, name: profile?.name, photo_url: profile?.photo_url },
        },
        matchIndex
      );
      out.push({
        id: `${row.created_at ?? 't'}-${row.action ?? 'act'}`,
        text: formatted || 'Actividad reciente',
        at: row.created_at,
      });
    } catch (e) {
      console.warn('[mapUserActivityRows]', e?.message ?? e);
    }
  }

  return out
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 12);
}

export function mapUserBadges(userBadgeRows, achievementCatalog, profileId = null) {
  const rows = profileId
    ? filterUserBadgeRowsForProfile(userBadgeRows, profileId)
    : (userBadgeRows ?? []).filter((row) => row?.badge_id);

  return rows.map((row) => {
      const display = resolveBadgePresentation(row.badge_id, row.badges ?? null, achievementCatalog);
      return {
        id: row.badge_id,
        icon: display.icon,
        name: display.name,
        description: display.description,
        earnedAt: row.earned_at,
      };
    });
}

/**
 * Carga perfil público completo desde Supabase (sin email).
 * Nunca lanza: devuelve null solo si el perfil base no existe.
 */
export async function loadPublicProfile(
  client,
  profileId,
  { matches = [], communityProfiles = [], achievementCatalog = [] } = {}
) {
  if (!profileId || !client) return null;

  try {
    const profileRes = await client
      .from(LEADERBOARD_SOURCE)
      .select(LEADERBOARD_PUBLIC_COLUMNS)
      .eq('id', profileId)
      .maybeSingle();

    if (profileRes.error || !profileRes.data) {
      console.warn('[loadPublicProfile]', profileRes.error?.message ?? 'not found');
      return null;
    }

    const profile = profileRes.data;
    const matchesForHistory = await ensureMatchesForPicks(client, profile, matches);

    const [
      allProfilesRows,
      pickScoreRows,
      userBadgeRows,
      historyRows,
      activityRows,
    ] = await Promise.all([
      safeQuery(
        client
          .from(LEADERBOARD_SOURCE)
          .select('id, username, name, photo_url, points, exacts, streak')
          .order('points', { ascending: false }),
        'ranking_leaderboard'
      ),
      safeQuery(
        client
          .from('pick_scores')
          .select('match_id, points_awarded, exact_hit, winner_hit, scored_at')
          .eq('profile_id', profileId),
        'pick_scores'
      ),
      loadUserBadges(client, profileId),
      safeQuery(
        client
          .from('ranking_history')
          .select('rank_position, jornada_id')
          .eq('profile_id', profileId),
        'ranking_history'
      ),
      safeQuery(
        client
          .from('activity_log')
          .select('action, payload, created_at')
          .eq('profile_id', profileId)
          .order('created_at', { ascending: false })
          .limit(20),
        'activity_log'
      ),
    ]);

    let ranked = [];
    let rankingSummary = { currentRank: null, bestRank: null };
    try {
      const mergedProfiles = await enrichProfilesWithPickScores(client, allProfilesRows ?? []);
      ranked = buildRankedLeaderboard(mergedProfiles);
      rankingSummary = getProfileRankingSummary(profileId, ranked, historyRows ?? []) ?? rankingSummary;
    } catch (e) {
      console.warn('[loadPublicProfile] rankingSummary', e?.message ?? e);
    }

    const scoredProfile = aggregatePickScoreRowsForProfile(pickScoreRows ?? []);
    const profileWithScores = {
      ...profile,
      points: scoredProfile.points,
      exacts: scoredProfile.exacts,
    };
    const matchIndex = matchesById(matchesForHistory);
    const stats = buildUserStats(
      profileWithScores,
      pickScoreRows ?? [],
      matchesForHistory,
      communityProfiles,
      rankingSummary
    );
    const pickHistory = buildPickHistoryRows(
      profileWithScores,
      pickScoreRows ?? [],
      matchesForHistory,
      communityProfiles
    );
    const badges = mapUserBadges(userBadgeRows ?? [], achievementCatalog, profileId);
    const activity = mapUserActivityRows(activityRows ?? [], profile, matchIndex);

    let pulpoStats = null;
    try {
      const performanceStats = getPerformanceStatsForProfile(profileId, pickScoreRows ?? [], matches);
      pulpoStats = computePulpoDerivedStats({
        profile: profileWithScores,
        performanceStats,
      });
    } catch (e) {
      console.warn('[loadPublicProfile] pulpoStats', e?.message ?? e);
    }

    return {
      profile: profileWithScores,
      rankingSummary,
      stats: { ...stats, pulpoIndex: pulpoStats?.index ?? stats.pulpoIndex ?? 0 },
      pickHistory: pickHistory ?? [],
      badges: badges ?? [],
      activity: activity ?? [],
      pulpoStats,
    };
  } catch (e) {
    console.warn('[loadPublicProfile] fatal', e?.message ?? e);
    return null;
  }
}
