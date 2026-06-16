import { supabase } from './supabase';
import { computePulpoDerivedStats, getPulpoLevel } from './pulpoIndex';
import {
  applyPerformanceStatsToProfiles,
  buildPerformanceStatsByProfile,
} from './pickScoreStats';
import { scoreAllFinishedMatches } from './scoringEngine';

function isRpcMissing(error) {
  const msg = String(error?.message ?? error ?? '');
  return /function.*does not exist|42883|PGRST202|not find/i.test(msg);
}

async function loadPickScoresForPulpo(client) {
  const { data, error } = await client
    .from('pick_scores')
    .select('profile_id, match_id, points_awarded, exact_hit, winner_hit');
  if (error) {
    console.warn('[pulpoSync] pick_scores', error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Recalcula pulpo_index en Supabase (RPC batch). Fallback: syncAllPulpoIndexes en cliente.
 */
export async function recomputeAllPulpoIndexes(client) {
  const { data, error } = await client.rpc('recompute_all_pulpo_indexes');

  if (!error) {
    return { updated: Number(data ?? 0), fallback: false };
  }

  if (isRpcMissing(error)) {
    return null;
  }

  console.warn('[pulpoSync] RPC recompute_all_pulpo_indexes', error.message);
  return { updated: 0, error: error.message, fallback: false };
}

function buildPulpoStatsPayload(stats) {
  return {
    level: stats.level.slug,
    title: stats.level.title,
    exactTerm: stats.exactTerm,
    winnerTerm: stats.winnerTerm,
    streakTerm: stats.streakTerm,
    totalPicks: stats.totalPicks,
    exacts: stats.exacts,
    winners: stats.winners,
    streak: stats.streak,
    raw: stats.raw,
    computed_at: new Date().toISOString(),
  };
}

/**
 * Calcula índice Pulpo para perfiles con pick_scores y lo persiste (RPC batch).
 */
export async function syncAllPulpoIndexes(client, { matches, profiles, pickScoreRows: pickScoreRowsInput }) {
  const pickScoreRows = pickScoreRowsInput ?? (await loadPickScoresForPulpo(client));
  const statsByProfileId = buildPerformanceStatsByProfile(pickScoreRows, matches);
  const profileById = new Map((profiles ?? []).map((prof) => [String(prof.id), prof]));
  const updates = [];

  for (const [profileId, performanceStats] of statsByProfileId) {
    if (!performanceStats?.predicted) continue;

    const prof = profileById.get(profileId);
    if (!prof) continue;

    const stats = computePulpoDerivedStats({
      profile: prof,
      performanceStats,
    });

    updates.push({
      profile_id: prof.id,
      pulpo_index: stats.index,
      pulpo_stats: buildPulpoStatsPayload(stats),
    });
  }

  if (!updates.length) return { updated: 0 };

  const { data, error } = await client.rpc('sync_pulpo_indexes', { updates });

  if (!error) {
    return { updated: Number(data ?? updates.length), fallback: false };
  }

  if (!isRpcMissing(error)) {
    console.warn('[pulpoSync] RPC sync_pulpo_indexes', error.message);
    return { updated: 0, error: error.message };
  }

  let updated = 0;
  for (const row of updates) {
    const { error: uErr } = await client
      .from('profiles')
      .update({
        pulpo_index: row.pulpo_index,
        pulpo_stats: row.pulpo_stats,
      })
      .eq('id', row.profile_id);

    if (!uErr) updated += 1;
    else console.warn('[pulpoSync] profile', row.profile_id, uErr.message);
  }

  return { updated, fallback: true };
}

/**
 * Pipeline: puntuación → índice Pulpo → snapshot ranking (opcional).
 */
export async function runScoringAndPulpoPipeline(
  client = supabase,
  { matches, profiles, captureRanking = true } = {}
) {
  const scoreResult = await scoreAllFinishedMatches(client, { matches });

  const profileColumns =
    'id, username, name, photo_url, points, exacts, streak, picks, pulpo_index, pulpo_stats';

  const { data: afterScore } = await client.from('profiles').select(profileColumns);
  let profilesForReturn = afterScore ?? [];

  const pickScoreRows = await loadPickScoresForPulpo(client);

  let pulpoResult = await recomputeAllPulpoIndexes(client);
  if (pulpoResult == null) {
    pulpoResult = await syncAllPulpoIndexes(client, {
      matches,
      profiles: profilesForReturn,
      pickScoreRows,
    });
  }

  const { data: afterPulpo } = await client.from('profiles').select(profileColumns);
  if (afterPulpo?.length) {
    profilesForReturn = afterPulpo;
  }

  const statsByProfileId = buildPerformanceStatsByProfile(pickScoreRows, matches);
  profilesForReturn = applyPerformanceStatsToProfiles(profilesForReturn, statsByProfileId).map(
    (profile) => {
      const perf = statsByProfileId.get(String(profile.id));
      const pulpoStats = computePulpoDerivedStats({
        profile,
        performanceStats: perf,
      });
      const level = getPulpoLevel(profile.pulpo_index ?? pulpoStats.index);
      return {
        ...profile,
        pulpo_index: Number(profile.pulpo_index ?? pulpoStats.index),
        pulpo_stats: profile.pulpo_stats?.computed_at ? profile.pulpo_stats : buildPulpoStatsPayload(pulpoStats),
      };
    }
  );

  let rankingCaptured = false;
  if (captureRanking) {
    try {
      const { maybeCaptureRankingSnapshot } = await import('./rankingSnapshot');
      const snap = await maybeCaptureRankingSnapshot(client);
      rankingCaptured = Boolean(snap?.captured);
    } catch (e) {
      console.warn('[pulpoSync] ranking snapshot', e?.message ?? e);
    }
  }

  return {
    score: scoreResult,
    pulpo: pulpoResult,
    rankingCaptured,
    profiles: profilesForReturn,
  };
}

/**
 * Tras cambios en pick_scores (realtime): recalcula índices y devuelve perfiles actualizados.
 */
export async function refreshPulpoIndexesAfterPickScores(client = supabase, { matches } = {}) {
  const profileColumns =
    'id, username, name, photo_url, points, exacts, streak, picks, pulpo_index, pulpo_stats';

  let pulpoResult = await recomputeAllPulpoIndexes(client);
  if (pulpoResult == null) {
    const { data: profiles } = await client.from('profiles').select(profileColumns);
    const pickScoreRows = await loadPickScoresForPulpo(client);
    pulpoResult = await syncAllPulpoIndexes(client, {
      matches,
      profiles: profiles ?? [],
      pickScoreRows,
    });
  }

  const { data: profiles } = await client.from('profiles').select(profileColumns);
  return { pulpo: pulpoResult, profiles: profiles ?? [] };
}
