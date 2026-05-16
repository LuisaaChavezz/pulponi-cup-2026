import { flagEmojiForTeam } from '../lib/teamFlags';

/** Partidos demo del Mundial 2026 (fallback cuando API-Football no tiene fixtures). */
const flagLogo = (code) => `https://flagcdn.com/w80/${code}.png`;

function futureKickoff(daysFromNow, hourUtc = 20) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d.toISOString();
}

export const WORLD_CUP_DEMO_FIXTURES = [
  {
    api_fixture_id: -2026001,
    home_team: 'México',
    away_team: 'Sudáfrica',
    home_logo: flagLogo('mx'),
    away_logo: flagLogo('za'),
    kickoff: futureKickoff(14, 20),
    venue: 'Estadio Azteca',
    venue_city: 'Ciudad de México',
    group_name: 'Grupo A · DEMO',
    is_knockout: false,
  },
  {
    api_fixture_id: -2026002,
    home_team: 'Canadá',
    away_team: 'Francia',
    home_logo: flagLogo('ca'),
    away_logo: flagLogo('fr'),
    kickoff: futureKickoff(16, 23),
    venue: 'BC Place',
    venue_city: 'Vancouver',
    group_name: 'Grupo B · DEMO',
    is_knockout: false,
  },
  {
    api_fixture_id: -2026003,
    home_team: 'Estados Unidos',
    away_team: 'Brasil',
    home_logo: flagLogo('us'),
    away_logo: flagLogo('br'),
    kickoff: futureKickoff(18, 2),
    venue: 'MetLife Stadium',
    venue_city: 'East Rutherford',
    group_name: 'Grupo C · DEMO',
    is_knockout: false,
  },
  {
    api_fixture_id: -2026004,
    home_team: 'Argentina',
    away_team: 'Alemania',
    home_logo: flagLogo('ar'),
    away_logo: flagLogo('de'),
    kickoff: futureKickoff(21, 19),
    venue: 'Hard Rock Stadium',
    venue_city: 'Miami Gardens',
    group_name: 'Grupo D · DEMO',
    is_knockout: false,
  },
  {
    api_fixture_id: -2026005,
    home_team: 'España',
    away_team: 'Inglaterra',
    home_logo: flagLogo('es'),
    away_logo: flagLogo('gb-eng'),
    kickoff: futureKickoff(24, 17),
    venue: 'AT&T Stadium',
    venue_city: 'Arlington',
    group_name: 'Grupo E · DEMO',
    is_knockout: false,
  },
  {
    api_fixture_id: -2026006,
    home_team: 'Japón',
    away_team: 'Marruecos',
    home_logo: flagLogo('jp'),
    away_logo: flagLogo('ma'),
    kickoff: futureKickoff(26, 15),
    venue: 'SoFi Stadium',
    venue_city: 'Inglewood',
    group_name: 'Grupo F · DEMO',
    is_knockout: false,
  },
];

export function demoFixtureToMatchRow(fixture) {
  return {
    ...fixture,
    is_demo: true,
    league_id: 1,
    season: 2026,
    api_status: 'NS',
    status: 'scheduled',
    home_score: null,
    away_score: null,
    home_flag: flagEmojiForTeam(fixture.home_team),
    away_flag: flagEmojiForTeam(fixture.away_team),
    minute: null,
    events: [],
    goals: [],
    cards: [],
    penalties: null,
    winner: null,
  };
}
