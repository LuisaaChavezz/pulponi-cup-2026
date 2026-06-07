import { displayMatchStatus, isMatchFinished, isMatchLive } from './matchUtils';

export function getMatchDayKey(match) {
  if (!match?.kickoff) return 'sin-fecha';
  const d = new Date(match.kickoff);
  if (Number.isNaN(d.getTime())) return 'sin-fecha';
  return d.toISOString().slice(0, 10);
}

export function formatMatchDayHeading(dayKey) {
  if (dayKey === 'sin-fecha') return 'Sin fecha programada';
  const d = new Date(`${dayKey}T12:00:00`);
  return d.toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
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

export function groupMatchesByDay(matches) {
  const map = new Map();
  for (const m of matches ?? []) {
    const key = getMatchDayKey(m);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(m);
  }

  const keys = [...map.keys()].sort((a, b) => {
    if (a === 'sin-fecha') return 1;
    if (b === 'sin-fecha') return -1;
    return a.localeCompare(b);
  });

  return keys.map((dayKey) => ({
    dayKey,
    heading: formatMatchDayHeading(dayKey),
    matches: map.get(dayKey),
  }));
}
