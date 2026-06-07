import { supabase } from './supabase';

/** Vista public.ranking_leaderboard (profiles ⨝ auth.users). */
export const LEADERBOARD_SOURCE = 'ranking_leaderboard';

export const LEADERBOARD_COLUMNS = 'id, username, name, photo_url, points, exacts, streak';

export const LEADERBOARD_PUBLIC_COLUMNS =
  'id, username, name, photo_url, points, exacts, streak, pulpo_index, pulpo_stats, picks, created_at';

export const LEADERBOARD_ACHIEVEMENT_COLUMNS =
  'id, username, name, photo_url, points, exacts, streak, picks, pulpo_index, pulpo_stats';

function isMissingLeaderboardSource(error) {
  const msg = String(error?.message ?? error ?? '').toLowerCase();
  return (
    msg.includes('ranking_leaderboard') ||
    msg.includes('does not exist') ||
    msg.includes('42p01') ||
    msg.includes('pgrst205') ||
    msg.includes('pgrst204')
  );
}

/**
 * Perfiles válidos para ranking / leaderboard (excluye huérfanos sin auth.users).
 * Intenta vista ranking_leaderboard; si no existe, RPC get_ranking_leaderboard().
 */
export async function fetchLeaderboardProfiles(
  client = supabase,
  columns = LEADERBOARD_COLUMNS
) {
  const viewResult = await client
    .from(LEADERBOARD_SOURCE)
    .select(columns)
    .order('points', { ascending: false });

  if (!viewResult.error) return viewResult;

  if (!isMissingLeaderboardSource(viewResult.error)) {
    return viewResult;
  }

  console.warn(
    '[leaderboard] Vista ranking_leaderboard no disponible; usando RPC get_ranking_leaderboard. Ejecuta supabase/ranking_leaderboard.sql'
  );

  const rpcResult = await client.rpc('get_ranking_leaderboard');
  if (!rpcResult.error) {
    const rows = (rpcResult.data ?? []).map((row) => {
      const out = { ...row };
      if (columns !== LEADERBOARD_COLUMNS && columns !== '*') {
        for (const key of Object.keys(out)) {
          if (!columns.includes(key)) delete out[key];
        }
      }
      return out;
    });
    return { data: rows, error: null };
  }

  console.warn(
    '[leaderboard] RPC get_ranking_leaderboard no disponible; usando public.profiles. Ejecuta supabase/ranking_leaderboard.sql'
  );

  return client.from('profiles').select(columns).order('points', { ascending: false });
}

/** @deprecated Usar fetchLeaderboardProfiles (async). */
export function queryLeaderboardProfiles(client = supabase, columns = LEADERBOARD_COLUMNS) {
  return client.from(LEADERBOARD_SOURCE).select(columns).order('points', { ascending: false });
}
