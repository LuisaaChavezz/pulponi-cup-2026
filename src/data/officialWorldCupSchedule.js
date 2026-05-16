/**
 * Calendario oficial FIFA — Mundial 2026 (Canadá · México · USA)
 * Fuente: https://www.fifa.com/es/tournaments/mens/worldcup/canadamexicousa2026/articles/calendario-fixture-mundial-2026-partidos-fechas
 */
import { flagEmojiForTeam, flagLogoUrlForTeam } from '../lib/teamFlags.js';

/** 3:00 p.m. ET (EDT, junio 2026) → UTC */
export function kickoffEt(y, m, d, hourEt, minute = 0) {
  return new Date(Date.UTC(y, m - 1, d, hourEt + 4, minute)).toISOString();
}

export const OFFICIAL_SCHEDULE_SOURCE =
  'https://www.fifa.com/es/tournaments/mens/worldcup/canadamexicousa2026/articles/calendario-fixture-mundial-2026-partidos-fechas';

/** Partidos hardcoded para validar UI de inmediato. */
export const FIFA_FALLBACK_MATCHES = [
  {
    official_id: 'fifa-fallback-001',
    home_team: 'México',
    away_team: 'Argentina',
    home_flag: '🇲🇽',
    away_flag: '🇦🇷',
    home_logo: flagLogoUrlForTeam('México'),
    away_logo: flagLogoUrlForTeam('Argentina'),
    kickoff: kickoffEt(2026, 6, 11, 15),
    venue: 'Estadio Azteca',
    venue_city: 'Ciudad de México',
    group_name: 'Mundial 2026 — Prueba Pulponi',
    status: 'scheduled',
    provisional: true,
  },
  {
    official_id: 'fifa-fallback-002',
    home_team: 'Brasil',
    away_team: 'Francia',
    home_flag: '🇧🇷',
    away_flag: '🇫🇷',
    home_logo: flagLogoUrlForTeam('Brasil'),
    away_logo: flagLogoUrlForTeam('Francia'),
    kickoff: kickoffEt(2026, 6, 13, 18),
    venue: 'MetLife Stadium',
    venue_city: 'Nueva York / Nueva Jersey',
    group_name: 'Mundial 2026 — Prueba Pulponi',
    status: 'scheduled',
    provisional: true,
  },
];

export const OFFICIAL_WORLD_CUP_SCHEDULE = [
  {
    official_id: 'fifa-wc26-001',
    home_team: 'México',
    away_team: 'Sudáfrica',
    home_flag: '🇲🇽',
    away_flag: '🇿🇦',
    home_logo: flagLogoUrlForTeam('México'),
    away_logo: flagLogoUrlForTeam('Sudáfrica'),
    kickoff: kickoffEt(2026, 6, 11, 15),
    venue: 'Estadio Azteca',
    venue_city: 'Ciudad de México',
    group_name: 'Grupo A — Fase de grupos',
    status: 'scheduled',
    provisional: true,
  },
  {
    official_id: 'fifa-wc26-002',
    home_team: 'Canadá',
    away_team: 'Bosnia y Herzegovina',
    home_flag: '🇨🇦',
    away_flag: '🇧🇦',
    home_logo: flagLogoUrlForTeam('Canadá'),
    away_logo: flagLogoUrlForTeam('Bosnia y Herzegovina'),
    kickoff: kickoffEt(2026, 6, 12, 15),
    venue: 'BMO Field',
    venue_city: 'Toronto',
    group_name: 'Grupo B — Fase de grupos',
    status: 'scheduled',
    provisional: true,
  },
  {
    official_id: 'fifa-wc26-003',
    home_team: 'Estados Unidos',
    away_team: 'Paraguay',
    home_flag: '🇺🇸',
    away_flag: '🇵🇾',
    home_logo: flagLogoUrlForTeam('Estados Unidos'),
    away_logo: flagLogoUrlForTeam('Paraguay'),
    kickoff: kickoffEt(2026, 6, 12, 21),
    venue: 'SoFi Stadium',
    venue_city: 'Los Ángeles (Inglewood)',
    group_name: 'Grupo D — Fase de grupos',
    status: 'scheduled',
    provisional: true,
  },
  {
    official_id: 'fifa-wc26-004',
    home_team: 'Argentina',
    away_team: 'Argelia',
    home_flag: '🇦🇷',
    away_flag: '🇩🇿',
    home_logo: flagLogoUrlForTeam('Argentina'),
    away_logo: flagLogoUrlForTeam('Argelia'),
    kickoff: kickoffEt(2026, 6, 16, 21),
    venue: 'Arrowhead Stadium',
    venue_city: 'Kansas City',
    group_name: 'Grupo J — Fase de grupos',
    status: 'scheduled',
    provisional: true,
  },
  {
    official_id: 'fifa-wc26-005',
    home_team: 'Brasil',
    away_team: 'Marruecos',
    home_flag: '🇧🇷',
    away_flag: '🇲🇦',
    home_logo: flagLogoUrlForTeam('Brasil'),
    away_logo: flagLogoUrlForTeam('Marruecos'),
    kickoff: kickoffEt(2026, 6, 13, 18),
    venue: 'MetLife Stadium',
    venue_city: 'Nueva York / Nueva Jersey',
    group_name: 'Grupo C — Fase de grupos',
    status: 'scheduled',
    provisional: true,
  },
  {
    official_id: 'fifa-wc26-006',
    home_team: 'Francia',
    away_team: 'Irak',
    home_flag: '🇫🇷',
    away_flag: '🇮🇶',
    home_logo: flagLogoUrlForTeam('Francia'),
    away_logo: flagLogoUrlForTeam('Irak'),
    kickoff: kickoffEt(2026, 6, 22, 17),
    venue: 'Lincoln Financial Field',
    venue_city: 'Filadelfia',
    group_name: 'Grupo I — Fase de grupos',
    status: 'scheduled',
    provisional: true,
  },
  {
    official_id: 'fifa-wc26-007',
    home_team: 'Portugal',
    away_team: 'Uzbekistán',
    home_flag: '🇵🇹',
    away_flag: '🇺🇿',
    home_logo: flagLogoUrlForTeam('Portugal'),
    away_logo: flagLogoUrlForTeam('Uzbekistán'),
    kickoff: kickoffEt(2026, 6, 23, 13),
    venue: 'NRG Stadium',
    venue_city: 'Houston',
    group_name: 'Grupo K — Fase de grupos',
    status: 'scheduled',
    provisional: true,
  },
  {
    official_id: 'fifa-wc26-008',
    home_team: 'España',
    away_team: 'Inglaterra',
    home_flag: '🇪🇸',
    away_flag: '🏴',
    home_logo: flagLogoUrlForTeam('España'),
    away_logo: flagLogoUrlForTeam('Inglaterra'),
    kickoff: kickoffEt(2026, 6, 17, 16),
    venue: 'AT&T Stadium',
    venue_city: 'Dallas (Arlington)',
    group_name: 'Grupos H / L — Fecha 1',
    status: 'scheduled',
    provisional: true,
  },
  {
    official_id: 'fifa-wc26-009',
    home_team: 'Alemania',
    away_team: 'Curaçao',
    home_flag: '🇩🇪',
    away_flag: '🇨🇼',
    home_logo: flagLogoUrlForTeam('Alemania'),
    away_logo: null,
    kickoff: kickoffEt(2026, 6, 14, 13),
    venue: 'NRG Stadium',
    venue_city: 'Houston',
    group_name: 'Grupo E — Fase de grupos',
    status: 'scheduled',
    provisional: true,
  },
];

/** ID estable → api_fixture_id negativo (único en Supabase). */
export function officialIdToFixtureKey(officialId) {
  const n = Number(String(officialId).replace(/\D/g, '')) || 0;
  return -20261000 - n;
}

export function getAllOfficialScheduleEntries() {
  const merged = [...FIFA_FALLBACK_MATCHES, ...OFFICIAL_WORLD_CUP_SCHEDULE];
  const seen = new Set();
  return merged.filter((m) => {
    const id = m.official_id;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
