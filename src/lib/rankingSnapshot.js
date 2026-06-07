import { supabase } from './supabase';
import { fetchLeaderboardProfiles } from './leaderboardQuery';
import {
  buildRankedLeaderboard,
  historySnapshotHasScoredPoints,
  leaderboardHasScoredPoints,
  snapshotMatchesHistory,
} from './rankingHistory';

async function fetchProfilesForRanking(client = supabase) {
  const { data, error } = await fetchLeaderboardProfiles(client);
  if (error) throw error;
  return data ?? [];
}

async function getLatestJornada(client) {
  const { data, error } = await client
    .from('ranking_jornadas')
    .select('id, label, created_at')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getHistoryForJornada(client, jornadaId) {
  if (!jornadaId) return [];
  const { data, error } = await client
    .from('ranking_history')
    .select('profile_id, rank_position, points, exacts, streak')
    .eq('jornada_id', jornadaId);
  if (error) throw error;
  return data ?? [];
}

/** IDs de jornadas donde al menos un jugador tiene points > 0. */
async function getValidJornadaIds(client = supabase) {
  const { data, error } = await client.from('ranking_history').select('jornada_id, points');
  if (error) throw error;

  const maxPointsByJornada = new Map();
  for (const row of data ?? []) {
    const id = row.jornada_id;
    const pts = Number(row.points ?? 0);
    maxPointsByJornada.set(id, Math.max(maxPointsByJornada.get(id) ?? 0, pts));
  }

  return [...maxPointsByJornada.entries()]
    .filter(([, maxPts]) => maxPts > 0)
    .map(([id]) => id)
    .sort((a, b) => b - a);
}

/** Elimina jornadas cuyo snapshot tiene todos los puntos en 0. */
export async function cleanupZeroPointRankingSnapshots(client = supabase) {
  try {
    const { data, error } = await client.rpc('cleanup_zero_point_ranking_jornadas');
    if (error) {
      if (!/does not exist|42883|PGRST202/i.test(String(error.message ?? error))) {
        console.warn('[rankingSnapshot] cleanup zero jornadas', error.message);
      }
      return 0;
    }
    return Number(data ?? 0);
  } catch (e) {
    console.warn('[rankingSnapshot] cleanup zero jornadas', e?.message ?? e);
    return 0;
  }
}

/**
 * Guarda una nueva jornada si el ranking cambió respecto al último snapshot válido.
 * No registra historial mientras todos los usuarios tengan 0 puntos.
 * @returns {{ captured: boolean, jornadaId?: number }}
 */
export async function maybeCaptureRankingSnapshot(client = supabase) {
  try {
    await cleanupZeroPointRankingSnapshots(client);

    const profiles = await fetchProfilesForRanking(client);
    const ranked = buildRankedLeaderboard(profiles);
    if (!ranked.length) return { captured: false };

    if (!leaderboardHasScoredPoints(ranked)) {
      return { captured: false, reason: 'no_points' };
    }

    const validIds = await getValidJornadaIds(client);
    let latestValidHistory = [];
    if (validIds.length > 0) {
      latestValidHistory = await getHistoryForJornada(client, validIds[0]);
      if (snapshotMatchesHistory(latestValidHistory, ranked)) {
        return { captured: false, jornadaId: validIds[0] };
      }
    }

    const latestAny = await getLatestJornada(client);
    const jornadaNumber = (latestAny?.id ?? 0) + 1;
    const label = `Jornada ${jornadaNumber}`;

    const { data: jornadaRow, error: jErr } = await client
      .from('ranking_jornadas')
      .insert({ label })
      .select('id')
      .single();

    if (jErr) {
      console.warn('[rankingSnapshot] insert jornada', jErr.message);
      return { captured: false };
    }

    const rows = ranked.map((r) => ({
      jornada_id: jornadaRow.id,
      profile_id: r.id,
      rank_position: r.rank_position,
      points: r.points,
      exacts: r.exacts,
      streak: r.streak,
    }));

    const { error: hErr } = await client.from('ranking_history').insert(rows);
    if (hErr) {
      console.warn('[rankingSnapshot] insert history', hErr.message);
      return { captured: false };
    }

    console.info('[rankingSnapshot] Jornada guardada', jornadaRow.id, label);
    return { captured: true, jornadaId: jornadaRow.id };
  } catch (e) {
    console.warn('[rankingSnapshot]', e?.message ?? e);
    return { captured: false };
  }
}

/**
 * Última y penúltima jornada válida (con puntos reales) para comparar movimiento.
 */
export async function loadJornadaComparison(client = supabase) {
  try {
    await cleanupZeroPointRankingSnapshots(client);

    const validIds = await getValidJornadaIds(client);
    if (!validIds.length) {
      return {
        latestJornada: null,
        previousJornada: null,
        previousHistory: [],
        tablesMissing: false,
        movementActive: false,
      };
    }

    const [latestId, previousId] = validIds;
    const idList = [latestId, previousId].filter(Boolean);

    const { data: jornadas, error } = await client
      .from('ranking_jornadas')
      .select('id, label, created_at')
      .in('id', idList);

    if (error) throw error;

    const byId = new Map((jornadas ?? []).map((j) => [j.id, j]));
    const latestJornada = byId.get(latestId) ?? null;
    const previousJornada = previousId != null ? byId.get(previousId) ?? null : null;

    let previousHistory = [];
    if (previousJornada?.id) {
      previousHistory = await getHistoryForJornada(client, previousJornada.id);
    }

    return {
      latestJornada,
      previousJornada,
      previousHistory: historySnapshotHasScoredPoints(previousHistory) ? previousHistory : [],
      tablesMissing: false,
      movementActive: true,
    };
  } catch (e) {
    const msg = String(e?.message ?? e);
    if (/relation|does not exist|42P01/i.test(msg)) {
      return {
        latestJornada: null,
        previousJornada: null,
        previousHistory: [],
        tablesMissing: true,
        movementActive: false,
      };
    }
    console.warn('[loadJornadaComparison]', msg);
    return {
      latestJornada: null,
      previousJornada: null,
      previousHistory: [],
      tablesMissing: false,
      movementActive: false,
    };
  }
}

export async function loadProfileHistoryRows(profileId, client = supabase) {
  if (!profileId) return [];
  try {
    const validIds = await getValidJornadaIds(client);
    if (!validIds.length) return [];

    const { data, error } = await client
      .from('ranking_history')
      .select('profile_id, rank_position, points, jornada_id')
      .eq('profile_id', profileId)
      .in('jornada_id', validIds);
    if (error) throw error;
    return data ?? [];
  } catch (e) {
    console.warn('[loadProfileHistoryRows]', e?.message ?? e);
    return [];
  }
}
