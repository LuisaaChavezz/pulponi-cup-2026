import { supabase } from './supabase';
import { buildRankedLeaderboard, snapshotMatchesHistory } from './rankingHistory';

async function fetchProfilesForRanking(client = supabase) {
  const { data, error } = await client
    .from('profiles')
    .select('id, username, name, photo_url, points, exacts, streak')
    .order('points', { ascending: false });
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

/**
 * Guarda una nueva jornada si el ranking cambió respecto al último snapshot.
 * @returns {{ captured: boolean, jornadaId?: number }}
 */
export async function maybeCaptureRankingSnapshot(client = supabase) {
  try {
    const profiles = await fetchProfilesForRanking(client);
    const ranked = buildRankedLeaderboard(profiles);
    if (!ranked.length) return { captured: false };

    const latest = await getLatestJornada(client);
    if (latest?.id) {
      const prevHistory = await getHistoryForJornada(client, latest.id);
      if (snapshotMatchesHistory(prevHistory, ranked)) {
        return { captured: false, jornadaId: latest.id };
      }
    }

    const jornadaNumber = (latest?.id ?? 0) + 1;
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
 * Última y penúltima jornada para comparar movimiento.
 */
export async function loadJornadaComparison(client = supabase) {
  try {
    const { data: jornadas, error } = await client
      .from('ranking_jornadas')
      .select('id, label, created_at')
      .order('id', { ascending: false })
      .limit(2);

    if (error) throw error;
    const list = jornadas ?? [];
    const latest = list[0] ?? null;
    const previous = list[1] ?? null;

    let previousHistory = [];
    if (previous?.id) {
      previousHistory = await getHistoryForJornada(client, previous.id);
    } else if (latest?.id) {
      previousHistory = await getHistoryForJornada(client, latest.id);
    }

    return {
      latestJornada: latest,
      previousJornada: previous,
      previousHistory,
      tablesMissing: false,
    };
  } catch (e) {
    const msg = String(e?.message ?? e);
    if (/relation|does not exist|42P01/i.test(msg)) {
      return {
        latestJornada: null,
        previousJornada: null,
        previousHistory: [],
        tablesMissing: true,
      };
    }
    console.warn('[loadJornadaComparison]', msg);
    return {
      latestJornada: null,
      previousJornada: null,
      previousHistory: [],
      tablesMissing: false,
    };
  }
}

export async function loadProfileHistoryRows(profileId, client = supabase) {
  if (!profileId) return [];
  try {
    const { data, error } = await client
      .from('ranking_history')
      .select('profile_id, rank_position, points, jornada_id')
      .eq('profile_id', profileId);
    if (error) throw error;
    return data ?? [];
  } catch (e) {
    console.warn('[loadProfileHistoryRows]', e?.message ?? e);
    return [];
  }
}
