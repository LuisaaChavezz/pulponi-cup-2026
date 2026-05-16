/** IDs de competición API-Football para el Mundial (env o defaults). */
export function wcLeagueIdFromEnv() {
  return import.meta.env.VITE_FOOTBALL_LEAGUE_ID?.trim() || '1';
}

export function wcSeasonFromEnv() {
  return import.meta.env.VITE_FOOTBALL_SEASON?.trim() || '2026';
}

/**
 * Partido perteneciente al Pulponi Cup / Mundial 2026 (no clubes ni otras ligas).
 * Usar para INICIO, próximos, quiniela y limpieza Supabase.
 */
export function isWorldCupMatch(match) {
  if (!match) return false;
  if (match.provisional === true) return true;
  if (match.source === 'fifa') return true;

  const oid = String(match.official_id ?? '').trim();
  if (/^fifa-wc-?26-/i.test(oid)) return true;
  if (oid.startsWith('fifa-fallback-')) return true;

  if (match.is_demo === true && Number(match.api_fixture_id) < 0) return true;

  const lid = match.league_id;
  const sea = match.season;
  const el = wcLeagueIdFromEnv();
  const es = wcSeasonFromEnv();
  if (lid != null && sea != null && String(lid) === String(el) && String(sea) === String(es)) return true;
  if (String(lid) === '1' && String(sea) === '2026') return true;

  return false;
}

export function filterWorldCupMatches(matches) {
  if (!Array.isArray(matches)) return [];
  return matches.filter(isWorldCupMatch);
}
