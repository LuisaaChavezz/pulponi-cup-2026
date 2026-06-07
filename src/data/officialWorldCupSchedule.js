/**
 * Calendario oficial FIFA — Mundial 2026 (Canadá · México · USA)
 * Fuente: https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/match-schedule-fixtures-results-teams-stadiums
 *
 * 104 partidos — fuente primaria de Pulponi Cup (no API-Football para calendario).
 */
import { flagLogoUrlForTeam } from '../lib/teamFlags.js';
import { WORLD_CUP_2026_RAW_FIXTURES } from './worldCup2026FixturesRaw.js';

/** 3:00 p.m. ET (EDT, junio 2026) → UTC */
export function kickoffEt(y, m, d, hourEt, minute = 0) {
  return new Date(Date.UTC(y, m - 1, d, hourEt + 4, minute)).toISOString();
}

export const OFFICIAL_SCHEDULE_SOURCE =
  'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/match-schedule-fixtures-results-teams-stadiums';

function phaseLabel(raw) {
  const n = raw.n;
  if (!raw.knockout) return `Grupo ${raw.group} — Fase de grupos`;
  if (n === 104) return 'Final';
  if (n === 103) return 'Tercer puesto';
  if (n >= 101) return `Semifinal — Partido ${n}`;
  if (n >= 97) return `Cuartos de final — Partido ${n}`;
  if (n >= 89) return `Octavos de final — Partido ${n}`;
  return `Dieciseisavos de final — Partido ${n}`;
}

function rawToScheduleEntry(raw) {
  const official_id = `fifa-wc26-${String(raw.n).padStart(3, '0')}`;
  return {
    official_id,
    match_number: raw.n,
    home_team: raw.home,
    away_team: raw.away,
    home_logo: flagLogoUrlForTeam(raw.home),
    away_logo: flagLogoUrlForTeam(raw.away),
    kickoff: kickoffEt(raw.y, raw.m, raw.d, raw.hourEt, raw.minute ?? 0),
    venue: raw.venue,
    venue_city: raw.city,
    group_name: phaseLabel(raw),
    is_knockout: Boolean(raw.knockout),
    status: 'scheduled',
    provisional: true,
  };
}

/** Calendario completo oficial (104 partidos), ordenado por fecha. */
export const OFFICIAL_WORLD_CUP_SCHEDULE = WORLD_CUP_2026_RAW_FIXTURES.map(rawToScheduleEntry).sort(
  (a, b) => new Date(a.kickoff ?? 0) - new Date(b.kickoff ?? 0)
);

/** ID estable → api_fixture_id negativo (único en Supabase). */
export function officialIdToFixtureKey(officialId) {
  const n = Number(String(officialId).replace(/\D/g, '')) || 0;
  return -20261000 - n;
}

export function getAllOfficialScheduleEntries() {
  const seen = new Set();
  return OFFICIAL_WORLD_CUP_SCHEDULE.filter((m) => {
    const id = m.official_id;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
