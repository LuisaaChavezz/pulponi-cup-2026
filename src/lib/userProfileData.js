import { parsePickScore, collectMatchPickScores } from './communityPicks';
import { buildRankedLeaderboard, getProfileRankingSummary } from './rankingHistory';
import { isMatchFinished } from './matchUtils';
import { formatActivityLogMessage } from './activityMessages';
import { getAchievementById } from '../data/achievements';
import { computePulpoDerivedStats } from './pulpoIndex';

function pickMap(profile) {
  const raw = profile?.picks;
  return raw && typeof raw === 'object' ? raw : {};
}

function matchesById(matches) {
  return new Map((matches ?? []).map((m) => [String(m.id), m]));
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
  const picks = pickMap(profile);
  const scoreByMatch = new Map((pickScoreRows ?? []).map((r) => [String(r.match_id), r]));
  const matchIndex = matchesById(matches);
  const rows = [];

  for (const [matchId, rawPick] of Object.entries(picks)) {
    const pick = parsePickScore(rawPick);
    if (!pick) continue;

    const match = matchIndex.get(String(matchId));
    if (!match) continue;

    const ps = scoreByMatch.get(String(matchId));
    const finished = isMatchFinished(match);

    let status = 'Pendiente';
    let points = 0;

    if (finished) {
      if (ps) {
        points = Number(ps.points_awarded ?? 0);
        if (ps.exact_hit) status = 'Marcador exacto';
        else if (ps.winner_hit) status = 'Acertó resultado';
        else status = 'Falló';
      } else {
        status = 'Falló';
      }
    }

    rows.push({
      matchId,
      matchLabel: `${match.home_team ?? 'Local'} vs ${match.away_team ?? 'Visitante'}`,
      kickoff: match.kickoff,
      prediction: `${pick.home}–${pick.away}`,
      finalResult:
        finished && match.home_score != null && match.away_score != null
          ? `${match.home_score}–${match.away_score}`
          : '—',
      points,
      status,
      statusClass:
        status === 'Marcador exacto'
          ? 'exact'
          : status === 'Acertó resultado'
            ? 'winner'
            : status === 'Falló'
              ? 'miss'
              : 'pending',
    });
  }

  return rows.sort((a, b) => {
    const ta = a.kickoff ? new Date(a.kickoff).getTime() : 0;
    const tb = b.kickoff ? new Date(b.kickoff).getTime() : 0;
    return tb - ta;
  });
}

export function buildUserStats(profile, pickScoreRows, matches, communityProfiles, rankingSummary) {
  const picks = pickMap(profile);
  const predicted = Object.keys(picks).filter((mid) => parsePickScore(picks[mid])).length;
  const graded = (pickScoreRows ?? []).length;
  const correctResults = (pickScoreRows ?? []).filter((r) => r.exact_hit || r.winner_hit).length;
  const exacts = (pickScoreRows ?? []).filter((r) => r.exact_hit).length;
  const effectiveness = graded > 0 ? Math.round((correctResults / graded) * 100) : 0;
  const matchIndex = matchesById(matches);

  return {
    predicted,
    correctResults,
    exacts,
    effectiveness,
    riskyHits: countRiskyExactHits(profile?.id, pickScoreRows, communityProfiles, profile),
    bestStreak: computeBestStreak(pickScoreRows, matchIndex),
    currentStreak: Number(profile?.streak ?? 0),
    bestRank: rankingSummary?.bestRank ?? rankingSummary?.currentRank ?? null,
    currentRank: rankingSummary?.currentRank ?? null,
    points: Number(profile?.points ?? 0),
    pulpoIndex: Number(profile?.pulpo_index ?? 0),
  };
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
    const formatted = formatActivityLogMessage(
      {
        action: row.action,
        payload: row.payload,
        profiles: { username, photo_url: profile?.photo_url },
      },
      matchIndex
    );
    out.push({
      id: row.created_at + row.action,
      text: formatted,
      at: row.created_at,
    });
  }

  return out
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 12);
}

export function mapUserBadges(userBadgeRows, achievementCatalog) {
  return (userBadgeRows ?? []).map((row) => {
    const badge = row.badges ?? getAchievementById(row.badge_id);
    const fromCatalog = achievementCatalog?.find((a) => a.id === row.badge_id);
    return {
      id: row.badge_id,
      icon: badge?.icon ?? fromCatalog?.icon ?? '🏆',
      name: badge?.name ?? fromCatalog?.name ?? row.badge_id,
      description: badge?.description ?? fromCatalog?.description ?? '',
      earnedAt: row.earned_at,
    };
  });
}

/**
 * Carga perfil público completo desde Supabase (sin email).
 */
export async function loadPublicProfile(client, profileId, { matches = [], communityProfiles = [], achievementCatalog = [] } = {}) {
  if (!profileId) return null;

  const profileRes = await client
    .from('profiles')
    .select(
      'id, username, name, photo_url, points, exacts, streak, pulpo_index, pulpo_stats, picks, created_at'
    )
    .eq('id', profileId)
    .maybeSingle();

  if (profileRes.error || !profileRes.data) {
    console.warn('[loadPublicProfile]', profileRes.error?.message ?? 'not found');
    return null;
  }

  const profile = profileRes.data;

  const [
    allProfilesRes,
    pickScoresRes,
    userBadgesRes,
    historyRes,
    activityRes,
  ] = await Promise.all([
    client.from('profiles').select('id, username, name, photo_url, points, exacts, streak').order('points', { ascending: false }),
    client.from('pick_scores').select('match_id, points_awarded, exact_hit, winner_hit, scored_at').eq('profile_id', profileId),
    client.from('user_badges').select('badge_id, earned_at, badges ( id, name, description, icon )').eq('profile_id', profileId).order('earned_at', { ascending: false }),
    client.from('ranking_history').select('rank_position, jornada_id').eq('profile_id', profileId),
    client.from('activity_log').select('action, payload, created_at').eq('profile_id', profileId).order('created_at', { ascending: false }).limit(20),
  ]);

  const ranked = buildRankedLeaderboard(allProfilesRes.data ?? []);
  const rankingSummary = getProfileRankingSummary(profileId, ranked, historyRes.data ?? []);

  const pickScoreRows = pickScoresRes.data ?? [];
  const matchIndex = matchesById(matches);
  const stats = buildUserStats(profile, pickScoreRows, matches, communityProfiles, rankingSummary);
  const pickHistory = buildPickHistoryRows(profile, pickScoreRows, matches, communityProfiles);
  const badges = mapUserBadges(userBadgesRes.data ?? [], achievementCatalog);
  const activity = mapUserActivityRows(activityRes.data ?? [], profile, matchIndex);

  const pulpoStats = computePulpoDerivedStats({
    profile,
    picks: pickMap(profile),
    matches,
    communityPickProfiles: communityProfiles,
    userId: profileId,
  });

  return {
    profile,
    rankingSummary,
    stats: { ...stats, pulpoIndex: pulpoStats.index },
    pickHistory,
    badges,
    activity,
    pulpoStats,
  };
}
