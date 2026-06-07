import { getAllOfficialScheduleEntries } from '../data/officialWorldCupSchedule.js';

/** IDs de competición API-Football para el Mundial (env o defaults). */
export function wcLeagueIdFromEnv() {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FOOTBALL_LEAGUE_ID) {
    return import.meta.env.VITE_FOOTBALL_LEAGUE_ID.trim() || '1';
  }
  if (typeof process !== 'undefined' && process.env?.VITE_FOOTBALL_LEAGUE_ID) {
    return process.env.VITE_FOOTBALL_LEAGUE_ID.trim() || '1';
  }
  return '1';
}

export function wcSeasonFromEnv() {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FOOTBALL_SEASON) {
    return import.meta.env.VITE_FOOTBALL_SEASON.trim() || '2026';
  }
  if (typeof process !== 'undefined' && process.env?.VITE_FOOTBALL_SEASON) {
    return process.env.VITE_FOOTBALL_SEASON.trim() || '2026';
  }
  return '2026';
}

/** official_id del calendario FIFA embebido (fifa-wc26-001 … fifa-wc26-104). */
export function isOfficialWorldCupScheduleId(officialId) {
  return /^fifa-wc26-\d{3}$/i.test(String(officialId ?? '').trim());
}

let seedOfficialIdsCache = null;

export function getOfficialWorldCupScheduleIds() {
  if (!seedOfficialIdsCache) {
    seedOfficialIdsCache = new Set(
      getAllOfficialScheduleEntries()
        .map((m) => String(m.official_id ?? '').trim())
        .filter(Boolean)
    );
  }
  return seedOfficialIdsCache;
}

/**
 * Fila en Supabase: solo Mundial FIFA 2026 (calendario oficial o enlazada API liga 1 / 2026).
 */
export function isWorldCupMatch(match) {
  if (!match) return false;

  const oid = String(match.official_id ?? '').trim();
  if (isOfficialWorldCupScheduleId(oid)) return true;

  const lid = match.league_id;
  const sea = match.season;
  if (lid != null && sea != null) {
    return (
      String(lid) === String(wcLeagueIdFromEnv()) && String(sea) === String(wcSeasonFromEnv())
    );
  }

  return false;
}

/**
 * Fixture API-Football: FIFA World Cup, liga 1, temporada 2026.
 * Ignora amistosos, clubes, otras ligas/temporadas.
 */
export function isApiWorldCup2026Fixture(fixture) {
  if (!fixture?.league) return false;

  const { id, season, name } = fixture.league;
  if (String(id) !== String(wcLeagueIdFromEnv())) return false;
  if (String(season) !== String(wcSeasonFromEnv())) return false;

  const label = String(name ?? '').toLowerCase();
  if (label && !/world\s*cup|worldcup|fifa/.test(label)) return false;

  return Boolean(fixture.fixture?.id);
}

export function filterApiWorldCup2026Fixtures(fixtures) {
  if (!Array.isArray(fixtures)) return [];
  return fixtures.filter(isApiWorldCup2026Fixture);
}

export function filterWorldCupMatches(matches) {
  if (!Array.isArray(matches)) return [];
  return matches.filter(isWorldCupMatch);
}
