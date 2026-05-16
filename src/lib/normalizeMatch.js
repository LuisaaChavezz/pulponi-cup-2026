import { flagEmojiForTeam } from './teamFlags';

/** Asegura flags y nombres para UI (logos reales vienen de API-Football). */
export function normalizeMatchRow(match) {
  if (!match) return match;

  const homeTeam = String(match.home_team ?? '').trim() || 'Local';
  const awayTeam = String(match.away_team ?? '').trim() || 'Visitante';

  let home_score = match.home_score;
  let away_score = match.away_score;
  const apiStatus = String(match.api_status ?? 'NS').toUpperCase();
  const isUpcoming =
    ['NS', 'TBD', 'PST', 'SCHEDULED'].includes(apiStatus) ||
    String(match.status ?? '').toLowerCase() === 'scheduled';
  if (isUpcoming && home_score === 0 && away_score === 0) {
    home_score = null;
    away_score = null;
  }
  if (home_score == null || away_score == null) {
    home_score = home_score ?? null;
    away_score = away_score ?? null;
  }

  return {
    ...match,
    home_team: homeTeam,
    away_team: awayTeam,
    home_logo: cleanUrl(match.home_logo),
    away_logo: cleanUrl(match.away_logo),
    home_flag: match.home_flag ?? flagEmojiForTeam(homeTeam),
    away_flag: match.away_flag ?? flagEmojiForTeam(awayTeam),
    home_score,
    away_score,
    venue: String(match.venue ?? '').trim() || null,
    venue_city: String(match.venue_city ?? '').trim() || null,
    kickoff: match.kickoff ?? null,
    api_status: match.api_status ?? 'NS',
  };
}

function cleanUrl(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function normalizeMatches(rows) {
  return (rows ?? []).map(normalizeMatchRow);
}
