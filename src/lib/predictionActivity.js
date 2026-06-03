import { parsePickScore } from './communityPicks';
import { pickInicioMatch, formatKickoff } from './matchUtils';

const PREDICTION_ACTIONS = new Set([
  'prediction_created',
  'prediction_updated',
  'prediction_made',
  'prediction_changed',
]);

export function isPredictionActivityAction(action) {
  return PREDICTION_ACTIONS.has(String(action || '').trim());
}

function trimStr(s) {
  return typeof s === 'string' ? s.trim() : '';
}

/** Nombre visible sin @ ni marcador. */
export function formatActivityDisplayName(profile) {
  if (!profile) return 'Alguien';
  const name = trimStr(profile.name);
  if (name) return name;
  const user = trimStr(profile.username);
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
  const p = row.payload && typeof row.payload === 'object' ? row.payload : {};
  const safe = trimStr(p.public_message);
  if (safe) return safe;

  const usuario = formatActivityDisplayName(row.profiles);
  const fixture = matchLabelFromPayload(p, matchById);
  const action = String(row.action || '').trim();
  const pickAction =
    p.pick_action === 'updated' ||
    action === 'prediction_updated' ||
    action === 'prediction_changed'
      ? 'updated'
      : 'created';

  if (pickAction === 'updated') {
    if (action === 'prediction_changed') {
      return `${usuario} cambió su predicción para ${fixture}`;
    }
    return `${usuario} actualizó su predicción para ${fixture}`;
  }
  return `${usuario} envió una predicción para ${fixture}`;
}

/** Partido para exportar: en vivo → próximo → último finalizado. */
export function pickExportMatch(matches) {
  return pickInicioMatch(matches)?.match ?? null;
}

/**
 * @param {Array<{ id: string, username?: string, name?: string, photo_url?: string, picks?: object }>} profileRows
 * @param {string} matchId
 * @param {Array<object>} [activityRows] - filas activity_log del partido (opcional)
 */
export function buildMatchExportRows(profileRows, matchId, activityRows = []) {
  const mid = String(matchId);
  const actionByProfile = new Map();

  for (const row of activityRows) {
    const p = row.payload && typeof row.payload === 'object' ? row.payload : {};
    if (p.match_id == null || String(p.match_id) !== mid) continue;
    const pid = row.profile_id;
    if (!pid) continue;
    const action = String(row.action || '').trim();
    const isUpdate =
      p.pick_action === 'updated' ||
      action === 'prediction_updated' ||
      action === 'prediction_changed';
    if (!actionByProfile.has(pid)) {
      actionByProfile.set(pid, isUpdate ? 'updated' : 'created');
    }
  }

  const rows = [];
  for (const prof of profileRows ?? []) {
    const pick = prof.picks?.[mid] ?? prof.picks?.[matchId];
    const parsed = parsePickScore(pick);
    if (!parsed) continue;

    const whenRaw = pick?.updated_at || pick?.created_at;
    const at = whenRaw ? new Date(whenRaw) : null;
    const pickAction = actionByProfile.get(prof.id) ?? 'created';

    rows.push({
      profile_id: prof.id,
      username: prof.username ?? null,
      name: prof.name ?? null,
      displayName: formatActivityDisplayName(prof),
      scoreLabel: `${parsed.home}-${parsed.away}`,
      actionLabel: pickAction === 'updated' ? 'actualizado' : 'enviado',
      at: at && !Number.isNaN(at.getTime()) ? at : null,
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

export function formatExportLine(row) {
  const who = row.displayName || row.username || '—';
  const time = formatExportTime(row.at);
  return `${who} — ${row.scoreLabel} — ${row.actionLabel} ${time}`;
}
