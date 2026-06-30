import { parsePickScore, parsePenaltyPick, collectMatchPickScores } from './communityPicks';
import { buildRankedLeaderboard, getProfileRankingSummary } from './rankingHistory';
import { fetchProfileById, LEADERBOARD_SOURCE } from './leaderboardQuery';
import {
  formatKickoff,
  hasRecordedScores,
  isProfilePickRevealed,
  matchHasFinalScore,
  uiStatus,
} from './matchUtils';
import { formatActivityLogMessage } from './activityMessages';
import { filterUserBadgeRowsForProfile, resolveBadgePresentation } from '../data/achievements';
import { computePulpoDerivedStats } from './pulpoIndex';
import { aggregatePickScoreRowsForProfile, fetchDistinctPlayedMatchCount, getPerformanceStatsForProfile } from './pickScoreStats';
import { computeWinnerStreakFromPickScores } from './scoringEngine';

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

function lookupPickScore(matchId, match, scoreByMatch) {
  return (
    scoreByMatch.get(String(matchId)) ??
    (match?.id != null ? scoreByMatch.get(String(match.id)) : null) ??
    (match?.official_id ? scoreByMatch.get(String(match.official_id)) : null)
  );
}

const MATCH_HISTORY_COLUMNS =
  'id, official_id, home_team, away_team, kickoff, status, api_status, home_score, away_score, is_knockout, went_to_penalties, penalty_winner, penalty_home, penalty_away';

/**
 * Carga partidos para el historial SIEMPRE frescos desde Supabase.
 * La DB es la fuente autoritativa: el catálogo en memoria (cachedMatches) puede
 * estar desactualizado (p. ej. un partido recién puntuado que en cache sigue
 * como 'scheduled' sin marcador), así que solo se usa como fallback para ids
 * que la DB no devolvió. Así los marcadores/puntos recién registrados sí salen.
 */
async function loadMatchesForProfileHistory(client, profile, pickScoreRows, cachedMatches = []) {
  const wanted = new Set();
  for (const key of Object.keys(pickMap(profile))) {
    if (key) wanted.add(String(key));
  }
  for (const row of pickScoreRows ?? []) {
    if (row?.match_id != null) wanted.add(String(row.match_id));
  }

  const byKey = new Map();
  const allWanted = [...wanted];
  const CHUNK = 80;

  // 1) Consultar Supabase para TODOS los ids (datos frescos: status/score reales).
  for (let i = 0; i < allWanted.length; i += CHUNK) {
    const chunk = allWanted.slice(i, i + CHUNK);
    const byId = await safeQuery(
      client.from('matches').select(MATCH_HISTORY_COLUMNS).in('id', chunk),
      'matches.id for history',
      null
    );
    if (Array.isArray(byId)) {
      for (const m of byId) {
        byKey.set(String(m.id), m);
        if (m.official_id) byKey.set(String(m.official_id), m);
      }
    }

    const stillMissing = chunk.filter((id) => !byKey.has(id));
    if (!stillMissing.length) continue;

    const byOfficial = await safeQuery(
      client.from('matches').select(MATCH_HISTORY_COLUMNS).in('official_id', stillMissing),
      'matches.official_id for history',
      null
    );
    if (Array.isArray(byOfficial)) {
      for (const m of byOfficial) {
        byKey.set(String(m.id), m);
        if (m.official_id) byKey.set(String(m.official_id), m);
      }
    }
  }

  // 2) Fallback: solo para ids que la DB no devolvió, usar el catálogo en memoria.
  for (const m of cachedMatches ?? []) {
    if (m?.id != null && !byKey.has(String(m.id))) byKey.set(String(m.id), m);
    if (m?.official_id && !byKey.has(String(m.official_id))) byKey.set(String(m.official_id), m);
  }

  const unique = new Map();
  for (const m of byKey.values()) {
    if (m?.id != null) unique.set(String(m.id), m);
  }
  return [...unique.values()];
}

async function loadProfileRow(client, profileId) {
  const { data, error } = await fetchProfileById(client, profileId, { source: LEADERBOARD_SOURCE });
  if (error) {
    console.warn('[loadPublicProfile] profiles', error.message);
    return null;
  }
  return data ?? null;
}

const EMPTY_STATS = {
  predicted: 0,
  playedMatches: 0,
  exacts: 0,
  effectiveness: 0,
  riskyHits: 0,
  bestStreak: 0,
  accumulatedStreak: 0,
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

export function countAccumulatedWinnerHits(pickScoreRows) {
  return (pickScoreRows ?? []).filter((row) => row.winner_hit).length;
}

/** Mejor racha continua: máximo de partidos consecutivos con winner_hit. */
export function computeBestContinuousStreak(pickScoreRows, matches = []) {
  return computeWinnerStreakFromPickScores(pickScoreRows, matches);
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

      const ps = lookupPickScore(matchId, match, scoreByMatch);
      const hasScoring = Boolean(ps);
      const hasResult = matchHasFinalScore(match) || hasScoring;
      const revealed = isProfilePickRevealed(match);
      const matchStatus = uiStatus(match.status, match.api_status);
      const scored = pickHistoryStatusFromScore(ps);

      let status = matchStatus;
      let statusClass = 'pending';
      let points = null;

      if (hasScoring && scored) {
        status = scored.status;
        statusClass = scored.statusClass;
        points = Number(ps.points_awarded ?? 0);
      } else if (hasResult) {
        status = 'Final';
        statusClass = 'finished';
      } else if (revealed) {
        status = matchStatus;
        statusClass = 'pending';
      } else {
        status = 'Próximo';
        statusClass = 'locked';
      }

      const isKnockout = Boolean(match.is_knockout);
      const wentToPenalties = Boolean(match.went_to_penalties);
      const penaltyPick = isKnockout ? parsePenaltyPick(rawPick) : null;
      let penaltyPrediction = null;
      if (penaltyPick) {
        const scorePart =
          penaltyPick.home != null && penaltyPick.away != null
            ? `${penaltyPick.home}-${penaltyPick.away}`
            : '';
        penaltyPrediction = [penaltyPick.winner, scorePart].filter(Boolean).join(' ') || null;
      }

      let penaltyWinnerHit = null;
      let penaltyExactHit = null;
      if (wentToPenalties && penaltyPick && match.penalty_winner != null) {
        const pickWinner = String(penaltyPick.winner ?? '').trim().toLowerCase();
        const realWinner = String(match.penalty_winner ?? '').trim().toLowerCase();
        penaltyWinnerHit = Boolean(pickWinner) && pickWinner === realWinner;
        if (match.penalty_home != null && match.penalty_away != null) {
          penaltyExactHit =
            penaltyPick.home != null &&
            penaltyPick.away != null &&
            Number(penaltyPick.home) === Number(match.penalty_home) &&
            Number(penaltyPick.away) === Number(match.penalty_away);
        }
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
        hasScoring,
        prediction: `${pick.home}–${pick.away}`,
        finalResult: formatFinalScoreLabel(match),
        points,
        status,
        statusClass,
        isKnockout,
        wentToPenalties,
        penaltyPrediction,
        penaltyResultLabel:
          wentToPenalties && match.penalty_winner != null
            ? `${match.penalty_winner} ${match.penalty_home ?? '?'}-${match.penalty_away ?? '?'}`
            : null,
        penaltyWinnerHit,
        penaltyExactHit,
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

export function buildUserStats(
  profile,
  pickScoreRows,
  matches,
  communityProfiles,
  rankingSummary,
  playedMatches = 0
) {
  try {
    const scored = aggregatePickScoreRowsForProfile(pickScoreRows ?? []);

    return {
      predicted: scored.predicted,
      playedMatches: Number(playedMatches) || 0,
      exacts: scored.exacts,
      effectiveness: scored.effectiveness,
      riskyHits: countRiskyExactHits(profile?.id, pickScoreRows, communityProfiles, profile),
      bestStreak: computeBestContinuousStreak(pickScoreRows, matches),
      accumulatedStreak:
        profile?.total_winner_hits != null
          ? Number(profile.total_winner_hits)
          : countAccumulatedWinnerHits(pickScoreRows),
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
        iconSrc: display.iconSrc,
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
    const profile = await loadProfileRow(client, profileId);
    if (!profile) return null;

    const pickScoreRows = await safeQuery(
      client
        .from('pick_scores')
        .select('match_id, points_awarded, exact_hit, winner_hit, scored_at')
        .eq('profile_id', profileId),
      'pick_scores'
    );

    const matchesForHistory = await loadMatchesForProfileHistory(
      client,
      profile,
      pickScoreRows,
      matches
    );

    const [allProfilesRows, userBadgeRows, historyRows, activityRows, playedMatchCount] =
      await Promise.all([
      safeQuery(
        client
          .from(LEADERBOARD_SOURCE)
          .select('id, username, name, photo_url, points, exacts, streak')
          .order('points', { ascending: false }),
        'ranking_leaderboard'
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
      fetchDistinctPlayedMatchCount(client).then((res) => {
        if (res.error) {
          console.warn('[loadPublicProfile] playedMatches', res.error.message);
          return 0;
        }
        return res.count ?? 0;
      }),
    ]);

    let ranked = [];
    let rankingSummary = { currentRank: null, bestRank: null };
    try {
      ranked = buildRankedLeaderboard(allProfilesRows ?? []);
      rankingSummary = getProfileRankingSummary(profileId, ranked, historyRows ?? []) ?? rankingSummary;
    } catch (e) {
      console.warn('[loadPublicProfile] rankingSummary', e?.message ?? e);
    }

    const scoredProfile = aggregatePickScoreRowsForProfile(pickScoreRows ?? []);
    const profileWithScores = {
      ...profile,
      points: Number(profile?.points ?? scoredProfile.points ?? 0),
      exacts: Number(profile?.exacts ?? scoredProfile.exacts ?? 0),
    };
    const matchIndex = matchesById(matchesForHistory);
    const stats = buildUserStats(
      profileWithScores,
      pickScoreRows ?? [],
      matchesForHistory,
      communityProfiles,
      rankingSummary,
      playedMatchCount
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
      const performanceStats = getPerformanceStatsForProfile(
        profileId,
        pickScoreRows ?? [],
        matchesForHistory
      );
      pulpoStats = computePulpoDerivedStats({
        profile: profileWithScores,
        performanceStats,
      });
    } catch (e) {
      console.warn('[loadPublicProfile] pulpoStats', e?.message ?? e);
    }

    const dbPulpoIndex = Number(profile?.pulpo_index ?? 0);
    const resolvedPulpoIndex =
      dbPulpoIndex > 0
        ? dbPulpoIndex
        : Number(pulpoStats?.index ?? stats.pulpoIndex ?? 0);

    return {
      profile: { ...profileWithScores, pulpo_index: resolvedPulpoIndex },
      rankingSummary,
      stats: { ...stats, pulpoIndex: resolvedPulpoIndex },
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
