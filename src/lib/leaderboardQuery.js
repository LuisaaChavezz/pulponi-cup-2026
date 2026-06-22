import { supabase } from './supabase';

/** Vista public.ranking_leaderboard (profiles ⨝ auth.users). */
export const LEADERBOARD_SOURCE = 'ranking_leaderboard';

export const LEADERBOARD_COLUMNS = 'id, username, name, photo_url, points, exacts, streak';

/** Columnas de perfil validadas en Supabase (sin total_winner_hits hasta migrar). */
export const PROFILE_SELECT_COLUMNS =
  'id, username, name, points, exacts, streak, pulpo_index, photo_url, picks, picks_updated_at';

export const PROFILE_SELECT_COLUMNS_FULL = `${PROFILE_SELECT_COLUMNS}, pulpo_stats, created_at`;

/** Solo cuando supabase/total_winner_hits.sql ya se ejecutó en producción. */
export const PROFILE_SELECT_COLUMNS_EXTENDED = `${PROFILE_SELECT_COLUMNS_FULL}, total_winner_hits`;

export const LEADERBOARD_PUBLIC_COLUMNS = PROFILE_SELECT_COLUMNS_FULL;

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

export function isMissingColumnError(error) {
  const msg = String(error?.message ?? error ?? '').toLowerCase();
  return (
    msg.includes('column') &&
    (msg.includes('does not exist') || msg.includes('42703') || msg.includes('could not find'))
  );
}

/** Intenta cargar un perfil con columnas extendidas y cae a las base si falta una columna nueva. */
export async function fetchProfileById(client, profileId, { source = LEADERBOARD_SOURCE } = {}) {
  if (!client || !profileId) return { data: null, error: null };

  const columnSets = [
    PROFILE_SELECT_COLUMNS_EXTENDED,
    PROFILE_SELECT_COLUMNS_FULL,
    PROFILE_SELECT_COLUMNS,
  ];

  for (const columns of columnSets) {
    const fromView = await client.from(source).select(columns).eq('id', profileId).maybeSingle();

    if (!fromView.error && fromView.data) {
      return { data: fromView.data, error: null };
    }

    if (
      fromView.error &&
      !isMissingLeaderboardSource(fromView.error) &&
      !isMissingColumnError(fromView.error)
    ) {
      console.warn('[fetchProfileById] ranking_leaderboard', fromView.error.message);
    }

    const fromProfiles = await client.from('profiles').select(columns).eq('id', profileId).maybeSingle();

    if (!fromProfiles.error && fromProfiles.data) {
      return { data: fromProfiles.data, error: null };
    }

    if (fromProfiles.error && !isMissingColumnError(fromProfiles.error)) {
      return { data: null, error: fromProfiles.error };
    }
  }

  return { data: null, error: null };
}

/**
 * Perfiles válidos para ranking / leaderboard (excluye huérfanos sin auth.users).
 * Intenta vista ranking_leaderboard; si no existe, RPC get_ranking_leaderboard().
 */
function orderLeaderboardByPoints(query) {
  return query
    .order('points', { ascending: false })
    .order('username', { ascending: true, nullsFirst: false });
}

export async function fetchLeaderboardProfiles(
  client = supabase,
  columns = LEADERBOARD_COLUMNS
) {
  const fetchedAt = Date.now();
  const viewResult = await orderLeaderboardByPoints(
    client.from(LEADERBOARD_SOURCE).select(columns)
  );

  if (!viewResult.error) {
    const rows = (viewResult.data ?? []).map((row) => ({ ...row, _leaderboardFetchedAt: fetchedAt }));
    return { data: rows, error: null };
  }

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
    return {
      data: rows.map((row) => ({ ...row, _leaderboardFetchedAt: fetchedAt })),
      error: null,
    };
  }

  console.warn(
    '[leaderboard] RPC get_ranking_leaderboard no disponible; usando public.profiles. Ejecuta supabase/ranking_leaderboard.sql'
  );

  const fallback = await orderLeaderboardByPoints(client.from('profiles').select(columns));
  if (fallback.error) return fallback;
  return {
    data: (fallback.data ?? []).map((row) => ({ ...row, _leaderboardFetchedAt: fetchedAt })),
    error: null,
  };
}

/** @deprecated Usar fetchLeaderboardProfiles (async). */
export function queryLeaderboardProfiles(client = supabase, columns = LEADERBOARD_COLUMNS) {
  return orderLeaderboardByPoints(client.from(LEADERBOARD_SOURCE).select(columns));
}
