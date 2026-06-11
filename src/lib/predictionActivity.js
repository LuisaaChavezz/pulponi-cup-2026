import { parsePickScore } from './communityPicks';
import {
  formatKickoff,
  isMatchLive,
  isPickLocked,
  listCarouselUpcomingMatches,
} from './matchUtils';

const PREDICTION_ACTIONS = new Set([
  'prediction_created',
  'prediction_updated',
  'prediction_made',
  'prediction_changed',
]);

/** Admin temporal: exportar PDF con marcadores antes del cierre (no afecta picks normales). */
const PREDICTION_EXPORT_ADMIN_USERNAMES = new Set(['luisaachavezz']);

export function normalizeExportUsername(username) {
  return String(username ?? '')
    .replace(/^@+/, '')
    .trim()
    .toLowerCase();
}

export function canAdminExportPredictions(username) {
  return PREDICTION_EXPORT_ADMIN_USERNAMES.has(normalizeExportUsername(username));
}

export function isPredictionActivityAction(action) {
  return PREDICTION_ACTIONS.has(String(action || '').trim());
}

function trimStr(s) {
  return typeof s === 'string' ? s.trim() : '';
}

/** Busca pick en JSON (claves string/number). */
export function getProfilePickForMatch(picks, matchId) {
  if (!picks || typeof picks !== 'object') return null;
  const mid = String(matchId);
  if (picks[mid] != null) return picks[mid];
  if (matchId != null && picks[matchId] != null) return picks[matchId];
  for (const [key, val] of Object.entries(picks)) {
    if (String(key) === mid) return val;
  }
  return null;
}

/** Supabase puede devolver profiles como objeto o array en el join. */
export function normalizeActivityProfile(profiles) {
  if (!profiles) return null;
  if (Array.isArray(profiles)) return profiles[0] ?? null;
  return profiles;
}

/** Nombre visible sin @ ni marcador. */
export function formatActivityDisplayName(profile) {
  const row = normalizeActivityProfile(profile);
  if (!row) return 'Alguien';
  const name = trimStr(row.name);
  if (name) return name;
  const user = trimStr(row.username);
  if (user) return user.replace(/^@+/, '');
  return 'Alguien';
}

function matchLabelFromPayload(p, matchById) {
  const mid = p.match_id != null ? String(p.match_id) : null;
  const m = mid && matchById?.get ? matchById.get(mid) : null;
  const home = trimStr(p.home_team) || trimStr(m?.home_team) || 'Local';
  const away = trimStr(p.away_team) || trimStr(m?.away_team) || 'Visitante';
  return `${home} vs ${away}`;
}

/**
 * Texto público seguro (sin marcador) para activity_log y UI.
 * @param {'created'|'updated'} pickAction
 */
export function buildPredictionPublicMessage(displayName, pickAction, homeTeam, awayTeam) {
  const who = trimStr(displayName) || 'Alguien';
  const fixture = `${trimStr(homeTeam) || 'Local'} vs ${trimStr(awayTeam) || 'Visitante'}`;
  if (pickAction === 'updated') {
    return `${who} actualizó su predicción para ${fixture}`;
  }
  return `${who} envió una predicción para ${fixture}`;
}

/**
 * @param {object} row - activity_log + profiles
 * @param {Map<string, object>} matchById
 */
export function formatPredictionActivityMessage(row, matchById) {
  if (!row || typeof row !== 'object') return 'Actividad de predicción';
  const p = row.payload && typeof row.payload === 'object' ? row.payload : {};
  const usuario = formatActivityDisplayName(row.profiles);
  const fixture = matchLabelFromPayload(p, matchById);
  const action = String(row.action || '').trim();
  const pickAction =
    p.pick_action === 'updated' ||
    action === 'prediction_updated' ||
    action === 'prediction_changed'
      ? 'updated'
      : 'created';

  let built;
  if (pickAction === 'updated') {
    built =
      action === 'prediction_changed'
        ? `${usuario} cambió su predicción para ${fixture}`
        : `${usuario} actualizó su predicción para ${fixture}`;
  } else {
    built = `${usuario} envió una predicción para ${fixture}`;
  }
  return usuario !== 'Alguien' ? built : trimStr(p.public_message) || built;
}

function kickoffMs(match) {
  const k = match?.kickoff;
  if (!k) return 0;
  const t = new Date(k).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function sortMatchesByKickoffDesc(matches) {
  return [...(matches ?? [])].sort((a, b) => kickoffMs(b) - kickoffMs(a));
}

/** Tras cierre de predicciones (kickoff / en vivo / final): se puede exportar con marcadores. */
export function isMatchPredictionsExportable(match, _now = new Date(), username = null) {
  if (canAdminExportPredictions(username)) return Boolean(match);
  return isPickLocked(match);
}

/** Partido por defecto para exportar: en vivo → último partido ya cerrado. */
export function pickDefaultExportMatch(matches, now = new Date(), username = null) {
  const exportable = (matches ?? []).filter((m) => isMatchPredictionsExportable(m, now, username));
  if (!exportable.length) return null;
  const live = exportable.find((m) => isMatchLive(m));
  if (live) return live;
  return sortMatchesByKickoffDesc(exportable)[0] ?? null;
}

/** @deprecated Usar pickDefaultExportMatch */
export function pickExportMatch(matches, now = new Date(), username = null) {
  return pickDefaultExportMatch(matches, now, username);
}

export function listExportableMatches(matches, now = new Date(), username = null) {
  return sortMatchesByKickoffDesc(
    (matches ?? []).filter((m) => isMatchPredictionsExportable(m, now, username))
  );
}

export function formatMatchVersusLabel(match) {
  if (!match) return '';
  const home = trimStr(match.home_team) || 'Local';
  const away = trimStr(match.away_team) || 'Visitante';
  return `${home} vs ${away}`;
}

/** Etiqueta del botón según el partido mostrado (vivo → próximo → más reciente). */
export function getPredictionExportButtonLabel(match, matches, now = new Date()) {
  if (!match) return 'Descargar predicciones del partido más reciente';
  if (isMatchLive(match)) return 'Descargar predicciones del partido en vivo';
  const nextUpcoming = listCarouselUpcomingMatches(matches ?? [])[0];
  if (nextUpcoming && String(nextUpcoming.id) === String(match.id)) {
    return 'Descargar predicciones del próximo partido';
  }
  return 'Descargar predicciones del partido más reciente';
}

/**
 * Partido mostrado en UI y partido con datos exportables (puede diferir si el próximo aún no cerró).
 */
export function resolvePredictionExportContext(matches, now = new Date(), username = null) {
  const list = matches ?? [];
  const live = list.find((m) => isMatchLive(m));
  if (live) {
    return {
      displayMatch: live,
      exportMatch: isMatchPredictionsExportable(live, now, username)
        ? live
        : pickDefaultExportMatch(list, now, username),
      buttonLabel: getPredictionExportButtonLabel(live, list, now),
    };
  }
  const upcoming = listCarouselUpcomingMatches(list)[0];
  if (upcoming) {
    return {
      displayMatch: upcoming,
      exportMatch: isMatchPredictionsExportable(upcoming, now, username)
        ? upcoming
        : pickDefaultExportMatch(list, now, username),
      buttonLabel: getPredictionExportButtonLabel(upcoming, list, now),
    };
  }
  const recent = pickDefaultExportMatch(list, now, username);
  return {
    displayMatch: recent,
    exportMatch: recent,
    buttonLabel: getPredictionExportButtonLabel(recent, list, now),
  };
}

function isUpdateActivityAction(action, payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const act = String(action || '').trim();
  return (
    p.pick_action === 'updated' ||
    act === 'prediction_updated' ||
    act === 'prediction_changed'
  );
}

function profileMatchActivityTimes(activityRows, matchId, profileId) {
  const mid = String(matchId);
  const events = [];
  for (const row of activityRows ?? []) {
    if (!row || row.profile_id !== profileId) continue;
    const p = row.payload && typeof row.payload === 'object' ? row.payload : {};
    if (p.match_id == null || String(p.match_id) !== mid) continue;
    if (!isPredictionActivityAction(row.action)) continue;
    const at = row.created_at ? new Date(row.created_at) : null;
    if (!at || Number.isNaN(at.getTime())) continue;
    events.push({ at, isUpdate: isUpdateActivityAction(row.action, p) });
  }
  events.sort((a, b) => a.at.getTime() - b.at.getTime());

  let sentAt = null;
  let updatedAt = null;
  for (const ev of events) {
    if (ev.isUpdate) updatedAt = ev.at;
    else if (!sentAt) sentAt = ev.at;
  }
  const actionLabel = updatedAt ? 'actualizado' : 'enviado';
  const displayAt = updatedAt ?? sentAt;
  return { sentAt, updatedAt, actionLabel, displayAt };
}

/**
 * Filas para descarga PDF. Marcador oculto si el partido sigue abierto.
 */
export function buildMatchDownloadRows(
  profileRows,
  matchId,
  activityRows = [],
  match = null,
  now = new Date(),
  username = null
) {
  const mid = String(matchId);
  const revealScores = match ? isMatchPredictionsExportable(match, now, username) : false;
  const rows = [];
  for (const prof of profileRows ?? []) {
    const pick = getProfilePickForMatch(prof.picks, mid);
    const parsed = parsePickScore(pick);
    if (!parsed) continue;

    const times = profileMatchActivityTimes(activityRows, mid, prof.id);
    const pickCreated = pick?.created_at ? new Date(pick.created_at) : null;
    const pickUpdated = pick?.updated_at ? new Date(pick.updated_at) : null;
    const sentAt =
      times.sentAt ??
      (pickCreated && !Number.isNaN(pickCreated.getTime()) ? pickCreated : null);
    const updatedAt =
      times.updatedAt ??
      (pickUpdated && !Number.isNaN(pickUpdated.getTime()) ? pickUpdated : null);
    const actionLabel = times.actionLabel;
    const displayAt =
      times.displayAt ??
      updatedAt ??
      sentAt ??
      (pickUpdated && !Number.isNaN(pickUpdated.getTime()) ? pickUpdated : null);

    rows.push({
      profile_id: prof.id,
      username: prof.username ?? null,
      name: prof.name ?? null,
      displayName: formatActivityDisplayName(prof),
      scoreLabel: revealScores ? `${parsed.home}-${parsed.away}` : 'Oculto hasta cierre',
      actionLabel,
      sentAt: sentAt && !Number.isNaN(sentAt.getTime()) ? sentAt : null,
      updatedAt: updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : null,
      at: displayAt && !Number.isNaN(displayAt.getTime()) ? displayAt : null,
    });
  }

  rows.sort((a, b) => {
    const ta = a.at?.getTime?.() ?? 0;
    const tb = b.at?.getTime?.() ?? 0;
    if (ta !== tb) return ta - tb;
    return (a.displayName || '').localeCompare(b.displayName || '', 'es', { sensitivity: 'base' });
  });

  return rows;
}

/** @deprecated Usar buildMatchDownloadRows */
export function buildMatchExportRows(
  profileRows,
  matchId,
  activityRows = [],
  match = null,
  now = new Date(),
  username = null
) {
  return buildMatchDownloadRows(profileRows, matchId, activityRows, match, now, username);
}

/** Partidos que tienen al menos una predicción guardada. */
export function listMatchesWithPicks(profileRows, matches) {
  const list = Array.isArray(matches) ? matches : [];
  return list.filter((m) => {
    const mid = String(m.id);
    return (profileRows ?? []).some((p) => parsePickScore(getProfilePickForMatch(p.picks, mid)));
  });
}

/** Grupos por partido cerrado para «Descargar todas las predicciones». */
export function buildAllMatchesExportGroups(
  profileRows,
  matches,
  activityRows = [],
  now = new Date(),
  username = null
) {
  return listMatchesWithPicks(profileRows, matches)
    .map((match) => ({
      match,
      title: buildMatchExportTitle(match),
      kickoffLine: formatExportKickoffLine(match),
      rows: buildMatchDownloadRows(profileRows, match.id, activityRows, match, now, username),
    }))
    .filter((g) => g.rows.length > 0);
}

export function buildMatchExportTitle(match) {
  if (!match) return 'Últimas predicciones';
  const home = trimStr(match.home_team) || 'Local';
  const away = trimStr(match.away_team) || 'Visitante';
  return `Últimas predicciones — ${home} vs ${away}`;
}

export function formatExportKickoffLine(match) {
  const label = formatKickoff(match?.kickoff);
  return label ? `Inicio: ${label}` : null;
}

export function formatExportTime(at) {
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) return '—';
  return at.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatExportTimeShort(at) {
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) return '—';
  return at.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

export function formatExportLine(row) {
  if (!row || typeof row !== 'object') return '—';
  const who = row.displayName || row.username || '—';
  const time = formatExportTimeShort(row.at);
  const score = row.scoreLabel ?? '—';
  const action = row.actionLabel ?? 'enviado';
  return `${who} — ${score} — ${action} ${time}`;
}

export function formatMatchSectionHeading(match) {
  if (!match) return 'Partido';
  const home = trimStr(match.home_team) || 'Local';
  const away = trimStr(match.away_team) || 'Visitante';
  return `Partido: ${home} vs ${away}`;
}
