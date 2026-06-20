import { EL_ELEGIDO_BADGE_ID } from '../data/achievements';
import { supabase } from './supabase';

export const KRAKEN_LAST_ELEGIDO_KEY = 'kraken_last_elegido';

export function getLastElegidoId() {
  try {
    return localStorage.getItem(KRAKEN_LAST_ELEGIDO_KEY);
  } catch {
    return null;
  }
}

export function setLastElegidoId(profileId) {
  if (!profileId) return;
  try {
    localStorage.setItem(KRAKEN_LAST_ELEGIDO_KEY, String(profileId));
  } catch (e) {
    console.warn('[krakenThroneState] write failed', e?.message ?? e);
  }
}

/** Perfil con badge el-elegido (dueño actual del trono). */
export async function fetchCurrentElegidoProfile() {
  const { data: badgeRow, error: badgeErr } = await supabase
    .from('user_badges')
    .select('profile_id')
    .eq('badge_id', EL_ELEGIDO_BADGE_ID)
    .limit(1)
    .maybeSingle();

  if (badgeErr) {
    console.warn('[krakenThroneState] elegido badge', badgeErr.message ?? badgeErr);
    return null;
  }

  if (!badgeRow?.profile_id) return null;

  const profile = await fetchProfileById(badgeRow.profile_id);
  return {
    id: String(badgeRow.profile_id),
    profile: profile ?? { id: badgeRow.profile_id },
  };
}

export async function fetchProfileById(profileId) {
  if (!profileId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, name, points')
    .eq('id', profileId)
    .maybeSingle();

  if (error) {
    console.warn('[krakenThroneState] profile', error.message ?? error);
    return null;
  }

  return data;
}

export async function fetchUserProfile(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('username, name')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[krakenThroneState] user profile', error.message ?? error);
    return null;
  }

  return data;
}

/**
 * @returns {{ changed: boolean, type: 'new_king'|'lost_throne'|'transfer'|null, previousId: string|null, currentId: string|null }}
 */
export function detectThroneChange(currentElegidoId, userId) {
  const currentId = currentElegidoId ? String(currentElegidoId) : null;
  const previousId = getLastElegidoId();
  const uid = userId ? String(userId) : null;

  if (!currentId) {
    return { changed: false, type: null, previousId, currentId: null };
  }

  if (!previousId) {
    return { changed: false, type: null, previousId: null, currentId, seed: true };
  }

  if (previousId === currentId) {
    return { changed: false, type: null, previousId, currentId };
  }

  if (uid === currentId) {
    return { changed: true, type: 'new_king', previousId, currentId };
  }

  if (uid === previousId) {
    return { changed: true, type: 'lost_throne', previousId, currentId };
  }

  return { changed: true, type: 'transfer', previousId, currentId };
}

export async function fetchTopTwoProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, name, points')
    .order('points', { ascending: false })
    .limit(2);

  if (error) {
    console.warn('[krakenThroneState] top2', error.message ?? error);
    return null;
  }

  if (!data?.[0] || !data?.[1]) return null;

  return {
    top1: data[0],
    top2: data[1],
    diferencia: Number(data[0].points ?? 0) - Number(data[1].points ?? 0),
  };
}

/**
 * Disputa del trono: elegido = badge el-elegido; retador = más puntos sin el badge.
 */
export async function fetchKrakenThroneDispute() {
  const [currentElegido, topProfilesResult] = await Promise.all([
    fetchCurrentElegidoProfile(),
    supabase
      .from('profiles')
      .select('id, username, name, points')
      .order('points', { ascending: false })
      .limit(2),
  ]);

  const { data: topProfiles, error: topErr } = topProfilesResult;

  if (topErr) {
    console.warn('[krakenThroneState] top profiles', topErr.message ?? topErr);
    return null;
  }

  if (!currentElegido?.id || !topProfiles?.length) return null;

  const elegidoId = String(currentElegido.id);
  let elegidoProfile = topProfiles.find((row) => String(row.id) === elegidoId);

  if (!elegidoProfile) {
    elegidoProfile = await fetchProfileById(currentElegido.id);
  }

  if (!elegidoProfile) return null;

  let retadorProfile = topProfiles.find((row) => String(row.id) !== elegidoId);

  if (!retadorProfile) {
    const { data: challenger, error: challengerErr } = await supabase
      .from('profiles')
      .select('id, username, name, points')
      .neq('id', elegidoId)
      .order('points', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (challengerErr) {
      console.warn('[krakenThroneState] retador', challengerErr.message ?? challengerErr);
      return null;
    }

    retadorProfile = challenger;
  }

  if (!retadorProfile) return null;

  const diferencia =
    Number(elegidoProfile.points ?? 0) - Number(retadorProfile.points ?? 0);

  return {
    currentElegido,
    elegidoProfile,
    retadorProfile,
    diferencia,
  };
}
