import { displayMatchStatus, isMatchFinished, isMatchLive, isPickLocked } from './matchUtils';
import { parsePickScore } from './communityPicks';

export function getMatchDayKey(match) {
  if (!match?.kickoff) return 'sin-fecha';
  const d = new Date(match.kickoff);
  if (Number.isNaN(d.getTime())) return 'sin-fecha';
  return d.toISOString().slice(0, 10);
}

export function listMatchDayFilterOptions(matches) {
  const keys = new Set();
  for (const m of matches ?? []) {
    keys.add(getMatchDayKey(m));
  }
  const dated = [...keys].filter((k) => k !== 'sin-fecha').sort();
  if (keys.has('sin-fecha')) dated.push('sin-fecha');
  return dated;
}

/** true si el usuario tiene pick válido guardado para el partido. */
export function hasUserMatchPick(picks, matchId) {
  if (!matchId) return false;
  return parsePickScore(picks?.[matchId]) != null;
}

/** Estado visual de predicción: closed | sent | pending */
export function getMatchPredictionUiState(match, picks) {
  if (isPickLocked(match)) return 'closed';
  if (hasUserMatchPick(picks, match?.id)) return 'sent';
  return 'pending';
}

export function countMatchPredictionStatuses(matches, picks) {
  let pending = 0;
  let sent = 0;
  let closed = 0;
  for (const m of matches ?? []) {
    if (isPickLocked(m)) closed += 1;
    if (hasUserMatchPick(picks, m.id)) sent += 1;
    if (!isPickLocked(m) && !hasUserMatchPick(picks, m.id)) pending += 1;
  }
  return { pending, sent, closed };
}

export function filterMatchesForList(
  matches,
  { search = '', status = 'all', day = 'all', predictionStatus = 'all', picks = {} } = {}
) {
  const q = search.trim().toLowerCase();

  return (matches ?? []).filter((m) => {
    if (status === 'upcoming') {
      if (isMatchLive(m) || isMatchFinished(m)) return false;
    } else if (status === 'live') {
      if (!isMatchLive(m)) return false;
    } else if (status === 'finished') {
      if (!isMatchFinished(m)) return false;
    }

    if (day !== 'all' && getMatchDayKey(m) !== day) return false;

    if (predictionStatus === 'pending') {
      if (getMatchPredictionUiState(m, picks) !== 'pending') return false;
    } else if (predictionStatus === 'sent') {
      if (!hasUserMatchPick(picks, m.id)) return false;
    } else if (predictionStatus === 'closed') {
      if (!isPickLocked(m)) return false;
    }

    if (!q) return true;

    const hay = [
      m.home_team,
      m.away_team,
      m.venue,
      m.venue_city,
      m.group_name,
      displayMatchStatus(m),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return hay.includes(q);
  });
}
