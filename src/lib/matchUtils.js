const FINISHED_RAW = new Set(['FT', 'AET', 'PEN']);
const LIVE_RAW = new Set(['LIVE', '1H', '2H']);
const HALFTIME_RAW = new Set(['HT']);
const SCHEDULED_RAW = new Set(['NS', 'TBD', 'SCHEDULED', 'PST', 'NOT_STARTED']);

const FINISHED_NORM = new Set(['finished', 'ft', 'aet', 'pen', 'terminado', 'final']);
const LIVE_NORM = new Set(['live', 'in_play', '1h', '2h']);
const HALFTIME_NORM = new Set(['ht', 'halftime', 'medio tiempo']);

export function uiStatus(status, apiStatus) {
  const raw = String(apiStatus ?? status ?? '').toUpperCase();
  if (FINISHED_RAW.has(raw)) return 'Final';
  if (HALFTIME_RAW.has(raw)) return 'Medio tiempo';
  if (LIVE_RAW.has(raw)) return 'En vivo';

  const norm = String(status ?? '').toLowerCase();
  if (FINISHED_NORM.has(norm)) return 'Final';
  if (HALFTIME_NORM.has(norm)) return 'Medio tiempo';
  if (LIVE_NORM.has(norm)) return 'En vivo';
  if (SCHEDULED_RAW.has(raw) || norm === 'scheduled') return 'Próximo';
  return 'Próximo';
}

export function isMatchLive(match) {
  const s = uiStatus(match?.status, match?.api_status);
  return s === 'En vivo' || s === 'Medio tiempo';
}

export function isMatchFinished(match) {
  return uiStatus(match?.status, match?.api_status) === 'Final';
}

/** Tendencias de comunidad visibles solo desde el kickoff (sin cambiar guardado de picks). */
export function areCommunityTrendsRevealed(match, now = new Date()) {
  return isProfilePickRevealed(match, now);
}

/** Perfiles: revelar pick solo cuando currentTime >= kickoff. */
export function isProfilePickRevealed(match, now = new Date()) {
  const kickoff = match?.kickoff;
  if (!kickoff) return false;
  const kickoffMs = new Date(kickoff).getTime();
  if (Number.isNaN(kickoffMs)) return false;
  return now.getTime() >= kickoffMs;
}

export function isPickLocked(match) {
  const raw = String(match?.api_status ?? '').toUpperCase();
  const norm = String(match?.status ?? '').toLowerCase();
  const label = uiStatus(match?.status, match?.api_status);

  if (FINISHED_RAW.has(raw) || LIVE_RAW.has(raw) || HALFTIME_RAW.has(raw)) return true;
  if (FINISHED_NORM.has(norm) || LIVE_NORM.has(norm) || HALFTIME_NORM.has(norm)) return true;
  if (label === 'En vivo' || label === 'Medio tiempo' || label === 'Final') return true;
  if (SCHEDULED_RAW.has(raw) || norm === 'scheduled') return false;

  if (match?.kickoff && new Date(match.kickoff) <= new Date()) return true;
  return false;
}

export function showLivePill(match) {
  return uiStatus(match?.status, match?.api_status) === 'En vivo';
}

function kickoffMs(m) {
  const k = m?.kickoff;
  if (!k) return null;
  const t = new Date(k).getTime();
  return Number.isNaN(t) ? null : t;
}

export function sortMatchesByKickoffAsc(matches) {
  return matches.slice().sort((a, b) => {
    const ta = kickoffMs(a);
    const tb = kickoffMs(b);
    if (ta == null && tb == null) return 0;
    if (ta == null) return 1;
    if (tb == null) return -1;
    return ta - tb;
  });
}

/** Partidos programados (NS / TBD / scheduled…), excluye finalizados y en vivo. */
export function isCarouselUpcomingMatch(match) {
  if (!match || isMatchFinished(match) || isMatchLive(match)) return false;
  const raw = String(match?.api_status ?? '').toUpperCase();
  const norm = String(match?.status ?? '').toLowerCase();
  if (SCHEDULED_RAW.has(raw)) return true;
  if (norm === 'scheduled') return true;
  return uiStatus(match?.status, match?.api_status) === 'Próximo';
}

/** Lista ordenada por kickoff para carrusel “Próximos partidos”. */
export function listCarouselUpcomingMatches(matches) {
  if (!Array.isArray(matches) || matches.length === 0) return [];
  return sortMatchesByKickoffAsc(matches.filter(isCarouselUpcomingMatch));
}

function sortMatchesByKickoffDesc(matches) {
  return matches.slice().sort((a, b) => {
    const ta = kickoffMs(a);
    const tb = kickoffMs(b);
    if (ta == null && tb == null) return 0;
    if (ta == null) return 1;
    if (tb == null) return -1;
    return tb - ta;
  });
}

/**
 * Partido único para la card INICIO (y bloque LIVE asociado): en vivo → próximo por kickoff →
 * último finalizado solo si no hay otro candidato.
 *
 * @returns {{ match: object, mode: 'live'|'upcoming'|'finished_fallback' } | null}
 */
export function pickInicioMatch(matches) {
  if (!Array.isArray(matches) || matches.length === 0) return null;

  const live = matches.find((m) => isMatchLive(m));
  if (live) return { match: live, mode: 'live' };

  const notFinished = matches.filter((m) => !isMatchFinished(m));
  const upcomingSorted = sortMatchesByKickoffAsc(notFinished);
  if (upcomingSorted.length > 0) return { match: upcomingSorted[0], mode: 'upcoming' };

  const finished = matches.filter((m) => isMatchFinished(m));
  const finishedSorted = sortMatchesByKickoffDesc(finished);
  if (finishedSorted.length > 0) return { match: finishedSorted[0], mode: 'finished_fallback' };

  return null;
}

export function pickFeaturedMatch(matches) {
  return pickInicioMatch(matches)?.match ?? null;
}

export function formatMatchMinute(match) {
  const minute = match?.minute ?? match?.elapsed;
  if (minute == null || minute === '') return null;
  return `${minute}'`;
}

/** Etiqueta amigable (sin códigos crudos NS/FT en UI principal). */
export function displayMatchStatus(match) {
  return uiStatus(match?.status, match?.api_status);
}

export function hasRecordedScores(match) {
  return match?.home_score != null && match?.away_score != null;
}

export function formatScoreLine(match) {
  if (!hasRecordedScores(match)) return 'VS';
  return `${match.home_score} - ${match.away_score}`;
}

export function formatKickoff(kickoff) {
  if (!kickoff) return null;
  return new Date(kickoff).toLocaleString('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatMatchDate(kickoff) {
  if (!kickoff) return null;
  return new Date(kickoff).toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatMatchDateShort(kickoff) {
  if (!kickoff) return null;
  return new Date(kickoff).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatMatchTime(kickoff) {
  if (!kickoff) return null;
  return new Date(kickoff).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatVenue(match) {
  const venue = String(match?.venue ?? '').trim();
  if (!venue) return null;
  return venue;
}

export function formatVenueCity(match) {
  const city = String(match?.venue_city ?? '').trim();
  if (!city) return null;
  return city;
}

export function formatVenueLine(match) {
  const venue = formatVenue(match);
  const city = formatVenueCity(match);
  if (venue && city) return `${venue} · ${city}`;
  return venue || city || null;
}

export function formatGroupLabel(match) {
  const g = String(match?.group_name ?? '').trim();
  return g || null;
}

export function displayTeamName(name) {
  const n = String(name ?? '').trim();
  return n || null;
}

export function finalScoreLabel(match) {
  if (!isMatchFinished(match) || !hasRecordedScores(match)) return null;
  return `Final: ${match.home_score} - ${match.away_score}`;
}

export function formatTimelineEvents(events) {
  if (!Array.isArray(events) || !events.length) return [];
  return [...events]
    .sort((a, b) => Number(b.minute ?? 0) - Number(a.minute ?? 0))
    .map((ev, i) => ({
      id: ev.id ?? `${ev.minute}-${ev.variant ?? ev.type}-${i}`,
      minute: ev.minute != null && ev.minute !== '' && ev.minute !== '—' ? ev.minute : null,
      label: ev.label ?? ev.description ?? formatEventLabel(ev),
    }));
}

function formatEventLabel(ev) {
  if (typeof ev.description === 'string' && ev.description.trim()) return ev.description.trim();

  const variant = String(ev.variant ?? '').toLowerCase();
  const legacyType = String(ev.type ?? '').toLowerCase();

  const icon =
    variant === 'goal' || legacyType === 'goal'
      ? '⚽'
      : variant === 'penalty'
        ? '🥅'
        : variant === 'yellow' || (legacyType === 'card' && !String(ev.detail ?? '').toLowerCase().includes('red'))
          ? '🟨'
          : variant === 'red' ||
              (legacyType === 'card' && String(ev.detail ?? '').toLowerCase().includes('red'))
            ? '🟥'
            : variant === 'var' || legacyType === 'var'
              ? '📺'
              : variant === 'sub'
                ? '🔁'
                : '•';
  const who = ev.player ? `${ev.player}` : ev.team ?? '';
  const detail = ev.detail ? ` · ${ev.detail}` : '';
  return `${icon} ${who}${detail}`.trim();
}

function formatMatchVersusShort(match) {
  const home = match?.home_team ?? 'Local';
  const away = match?.away_team ?? 'Visitante';
  return `${home} vs ${away}`;
}

/** Countdown legible hasta kickoff: 02h 14m 35s */
export function formatCountdownToKickoff(targetMs, now = new Date()) {
  const diff = Math.max(0, targetMs - now.getTime());
  const totalSec = Math.floor(diff / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
}

/**
 * Próximo cierre de predicciones (kickoff del partido más próximo no iniciado).
 * @returns {{ status: 'countdown'|'closed'|'none', matchLabel?: string, countdown?: string, match?: object }}
 */
export function resolvePredictionCloseCountdown(matches, now = new Date()) {
  const nowMs = now.getTime();
  const withKickoff = (matches ?? [])
    .filter((m) => m?.kickoff && !isMatchFinished(m))
    .map((m) => ({ match: m, ms: new Date(m.kickoff).getTime() }))
    .filter((x) => !Number.isNaN(x.ms))
    .sort((a, b) => a.ms - b.ms);

  const next = withKickoff.find((x) => x.ms > nowMs);
  if (next) {
    return {
      status: 'countdown',
      match: next.match,
      matchLabel: formatMatchVersusShort(next.match),
      countdown: formatCountdownToKickoff(next.ms, now),
    };
  }

  const started = [...withKickoff].reverse().find((x) => x.ms <= nowMs);
  if (started) {
    return {
      status: 'closed',
      match: started.match,
      matchLabel: formatMatchVersusShort(started.match),
    };
  }

  return { status: 'none' };
}

// Compatibilidad con imports antiguos
export function displayApiStatus(match) {
  return displayMatchStatus(match);
}
