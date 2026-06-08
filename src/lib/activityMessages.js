/**
 * Plantillas de texto para "Actividad reciente" ({usuario} = @username o name).
 */

import { formatPredictionActivityMessage, normalizeActivityProfile } from './predictionActivity';

function trimStr(s) {
  return typeof s === 'string' ? s.trim() : '';
}

function formatActivityUsuario(profiles) {
  const profile = normalizeActivityProfile(profiles);
  if (!profile) return 'Alguien';
  const name = trimStr(profile.name);
  if (name) return name;
  const username = trimStr(profile.username);
  if (username) return `@${username.replace(/^@+/, '')}`;
  return 'Alguien';
}

/**
 * @param {object} row - fila de activity_log con profiles { username, name, photo_url }
 * @param {Map<string, object>} [matchById] - matches indexados por id (opcional)
 */
export function formatActivityLogMessage(row, matchById) {
  const usuario = formatActivityUsuario(row.profiles);
  const action = (row.action || '').trim();
  const p = row.payload && typeof row.payload === 'object' ? row.payload : {};

  const match = p.match_id != null && matchById?.get ? matchById.get(String(p.match_id)) : null;

  const home = trimStr(p.home_team) || trimStr(match?.home_team) || 'Local';
  const away = trimStr(p.away_team) || trimStr(match?.away_team) || 'Visitante';
  const team = trimStr(p.team) || trimStr(p.team_name) || 'Equipo';
  const pts = p.points ?? p.pts ?? '';

  switch (action) {
    /* PERFIL */
    case 'profile_photo_changed':
      return `${usuario} cambió su foto de perfil`;
    case 'avatar_changed':
    case 'avatar_selected':
      return `${usuario} eligió un nuevo avatar`;
    case 'profile_updated':
      return `${usuario} actualizó su perfil`;

    /* PREDICCIONES (sin revelar marcador) */
    case 'prediction_created':
    case 'prediction_updated':
    case 'prediction_made':
    case 'prediction_changed':
      return formatPredictionActivityMessage(row, matchById);
    case 'prediction_exact_score':
      return `${usuario} acertó el marcador`;
    case 'prediction_correct_winner':
      return `${usuario} acertó el ganador`;
    case 'prediction_wrong':
      return `${usuario} falló su predicción`;

    /* PUNTOS */
    case 'points_gained': {
      const n = pts !== '' && pts != null ? Number(pts) : NaN;
      const label = Number.isFinite(n) ? String(Math.round(n)) : trimStr(pts);
      return label ? `${usuario} ganó ${label} pts` : `${usuario} ganó pts`;
    }
    case 'ranking_up':
      return `${usuario} subió en el ranking`;
    case 'top5_entered':
      return `${usuario} entró al Top 5`;
    case 'first_place':
      return `${usuario} tomó el primer lugar`;

    /* PARTIDOS */
    case 'match_started':
      return `Empezó ${home} vs ${away}`;
    case 'match_ended':
      return `Terminó ${home} vs ${away}`;
    case 'match_goal':
      return `Gol de ${team}`;
    case 'match_card':
      return `Tarjeta para ${team}`;
    case 'match_penalty':
      return `Penal para ${team}`;

    /* CHAT */
    case 'comment':
      return `${usuario} envió un mensaje`;
    case 'chat_reaction':
      return `${usuario} reaccionó en el chat`;

    /* LOGROS */
    case 'badge_unlocked':
      return `${usuario} desbloqueó un logro`;
    case 'streak_milestone':
      return `${usuario} consiguió una racha`;

    /* SISTEMA */
    case 'matches_available':
    case 'new_matches':
    case 'system_matches_available':
      return 'Nuevos partidos disponibles';
    case 'ranking_updated':
    case 'system_ranking_updated':
      return 'Ranking actualizado';
    case 'highlights_updated':
    case 'system_highlights_updated':
      return 'Highlights actualizados';

    default:
      if (action.startsWith('system_')) {
        return action
          .replace(/^system_/, '')
          .replace(/_/g, ' ');
      }
      return `${usuario} · ${action || 'actividad'}`;
  }
}
