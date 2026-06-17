/** Zona horaria de referencia para fechas/horas de partido en la UI. */
export const MATCH_DISPLAY_TIMEZONE = 'America/Mexico_City';

const FINISHED_RAW = new Set(['FT', 'AET', 'PEN']);
const LIVE_RAW = new Set(['LIVE', '1H', '2H']);
const HALFTIME_RAW = new Set(['HT']);
const SCHEDULED_RAW = new Set(['NS', 'TBD', 'SCHEDULED', 'PST', 'NOT_STARTED']);

const FINISHED_NORM = new Set(['finished', 'ft', 'aet', 'pen', 'terminado', 'final']);
const LIVE_NORM = new Set(['live', 'in_play', '1h', '2h']);
const HALFTIME_NORM = new Set(['ht', 'halftime', 'medio tiempo']);

/** Predicciones cierran 5 minutos antes del kickoff. */
const PICK_CLOSE_MS_BEFORE_KICKOFF = 5 * 60 * 1000;

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

/** ID estable de partido (uuid u official_id) para RPC / pick_scores. */
export function normalizeMatchId(matchId) {
  const id = String(matchId ?? '').trim();
  if (!id || id === 'undefined' || id === 'null') return '';
  return id;
}

/** Busca partido por `id` o `official_id` en memoria. */
export function findMatchByScoringId(matchId, matches = []) {
  const key = normalizeMatchId(matchId);
  if (!key) return null;

  return (
    (matches ?? []).find((m) => normalizeMatchId(m?.id) === key) ??
    (matches ?? []).find((m) => normalizeMatchId(m?.official_id) === key) ??
    null
  );
}

/** Resuelve id de fila en BD y claves posibles en profiles.picks. */
export function resolveMatchForScoring(matchId, matches = []) {
  const match = findMatchByScoringId(matchId, matches);
  const dbId = normalizeMatchId(match?.id) || normalizeMatchId(matchId);
  const pickKeys = [
    normalizeMatchId(match?.id),
    normalizeMatchId(match?.official_id),
    normalizeMatchId(matchId),
  ].filter((value, index, array) => value && array.indexOf(value) === index);

  return { match, dbId, pickKeys };
}

/** Marcador final disponible (FT o goles registrados en matches). */
export function matchHasFinalScore(match) {
  if (!match) return false;
  if (isMatchFinished(match)) return true;
  return hasRecordedScores(match);
}

/** Tendencias de comunidad visibles solo desde el kickoff (sin cambiar guardado de picks). */
export function areCommunityTrendsRevealed(match, now = new Date()) {
  return isProfilePickRevealed(match, now);
}

/** Partido ya comenzó (en vivo, finalizado o kickoff <= ahora). */
export function hasMatchStarted(match, now = new Date()) {
  if (!match) return false;
  if (isMatchLive(match) || isMatchFinished(match)) return true;

  const kickoff = match?.kickoff;
  if (!kickoff) return false;
  const kickoffMs = new Date(kickoff).getTime();
  if (Number.isNaN(kickoffMs)) return false;
  return now.getTime() >= kickoffMs;
}

/** Perfiles / historial: revelar pick cuando el partido ya empezó o terminó. */
export function isProfilePickRevealed(match, now = new Date()) {
  return hasMatchStarted(match, now);
}

export function isPickLocked(match, now = new Date()) {
  const raw = String(match?.api_status ?? '').toUpperCase();
  const norm = String(match?.status ?? '').toLowerCase();
  const label = uiStatus(match?.status, match?.api_status);

  if (FINISHED_RAW.has(raw) || LIVE_RAW.has(raw) || HALFTIME_RAW.has(raw)) return true;
  if (FINISHED_NORM.has(norm) || LIVE_NORM.has(norm) || HALFTIME_NORM.has(norm)) return true;
  if (label === 'En vivo' || label === 'Medio tiempo' || label === 'Final') return true;

  const kickoffMs = kickoffMsFromIso(match?.kickoff);
  if (kickoffMs != null && kickoffMs - PICK_CLOSE_MS_BEFORE_KICKOFF <= now.getTime()) {
    return true;
  }

  if (SCHEDULED_RAW.has(raw) || norm === 'scheduled') return false;
  return false;
}

export function showLivePill(match) {
  return uiStatus(match?.status, match?.api_status) === 'En vivo';
}

function kickoffMsFromIso(kickoff) {
  if (!kickoff) return null;
  const t = new Date(kickoff).getTime();
  return Number.isNaN(t) ? null : t;
}

function kickoffMs(m) {
  return kickoffMsFromIso(m?.kickoff);
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

/** Partido aún no iniciado: kickoff en el futuro y no finalizado ni en vivo. */
export function isMatchUpcoming(match, now = new Date()) {
  if (!match || isMatchFinished(match) || isMatchLive(match) || hasMatchStarted(match, now)) {
    return false;
  }
  const ms = kickoffMs(match);
  if (ms == null) return false;
  return ms > now.getTime();
}

/** Partido visible en lista principal: kickoff futuro y ventana de predicción abierta. */
export function isMatchWithOpenPicks(match, now = new Date()) {
  if (!match || isMatchFinished(match) || isMatchLive(match)) return false;
  const ms = kickoffMs(match);
  if (ms == null || ms <= now.getTime()) return false;
  return !isPickLocked(match, now);
}

/** Partidos programados (NS / scheduled) con kickoff futuro — excluye finalizados, en vivo e iniciados. */
export function isCarouselUpcomingMatch(match, now = new Date()) {
  return isMatchUpcoming(match, now);
}

/** Lista ordenada por kickoff para carrusel “Próximos partidos”. */
export function listCarouselUpcomingMatches(matches, now = new Date()) {
  if (!Array.isArray(matches) || matches.length === 0) return [];
  return sortMatchesByKickoffAsc(matches.filter((m) => isMatchUpcoming(m, now)));
}


/**
 * Partido único para la card INICIO: en vivo → próximo por kickoff (futuro) → null.
 *
 * @returns {{ match: object, mode: 'live'|'upcoming' } | null}
 */
export function pickInicioMatch(matches, now = new Date()) {
  if (!Array.isArray(matches) || matches.length === 0) return null;

  const live = matches.find((m) => isMatchLive(m));
  if (live) return { match: live, mode: 'live' };

  const upcoming = listCarouselUpcomingMatches(matches, now);
  if (upcoming.length > 0) return { match: upcoming[0], mode: 'upcoming' };

  return null;
}

export function pickFeaturedMatch(matches, now = new Date()) {
  return pickInicioMatch(matches, now)?.match ?? null;
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
  const home = Math.round(Number(match.home_score));
  const away = Math.round(Number(match.away_score));
  if (!Number.isFinite(home) || !Number.isFinite(away)) return 'VS';
  return `${home} - ${away}`;
}

export function formatKickoff(kickoff) {
  if (!kickoff) return null;
  return new Date(kickoff).toLocaleString('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: MATCH_DISPLAY_TIMEZONE,
  });
}

export function formatMatchDate(kickoff) {
  if (!kickoff) return null;
  return new Date(kickoff).toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: MATCH_DISPLAY_TIMEZONE,
  });
}

export function formatMatchDateShort(kickoff) {
  if (!kickoff) return null;
  return new Date(kickoff).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: MATCH_DISPLAY_TIMEZONE,
  });
}

export function formatMatchTime(kickoff) {
  if (!kickoff) return null;
  return new Date(kickoff).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: MATCH_DISPLAY_TIMEZONE,
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
