import { supabase } from './supabase';
import { computePulpoDerivedStats } from './pulpoIndex';
import { scoreAllFinishedMatches } from './scoringEngine';

function isRpcMissing(error) {
  const msg = String(error?.message ?? error ?? '');
  return /function.*does not exist|42883|PGRST202|not find/i.test(msg);
}

/**
 * Calcula índice Pulpo para todos los perfiles con picks y lo persiste (RPC batch).
 */
export async function syncAllPulpoIndexes(client, { matches, profiles }) {
  const updates = [];

  for (const prof of profiles ?? []) {
    if (!prof?.id) continue;
    const picks = prof.picks && typeof prof.picks === 'object' ? prof.picks : {};
    if (!Object.keys(picks).length) continue;

    const stats = computePulpoDerivedStats({
      profile: prof,
      picks,
      matches,
      communityPickProfiles: profiles,
      userId: prof.id,
    });

    updates.push({
      profile_id: prof.id,
      pulpo_index: stats.index,
      pulpo_stats: {
        level: stats.level.slug,
        title: stats.level.title,
        riskyHits: stats.riskyHits,
        consistencyPct: stats.consistencyPct,
        consistencyBonus: stats.consistencyBonus,
        gradedPicks: stats.gradedPicks,
        raw: stats.raw,
        computed_at: new Date().toISOString(),
      },
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

  const { data: refreshed } = await client.from('profiles').select(
    'id, username, name, photo_url, points, exacts, streak, picks, pulpo_index, pulpo_stats'
  );
  const afterScore = refreshed ?? [];

  const pulpoResult = await syncAllPulpoIndexes(client, {
    matches,
    profiles: afterScore,
  });

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
    profiles: afterScore,
  };
}
