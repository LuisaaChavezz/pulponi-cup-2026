import { displayMatchStatus, isMatchFinished, isMatchLive } from './matchUtils';

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

export function filterMatchesForList(matches, { search = '', status = 'all', day = 'all' } = {}) {
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
