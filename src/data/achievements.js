import { getBadgeIconImage } from './badgeAssets';

/** Catálogo Pulponi — sincronizado con supabase/achievements.sql */

export const ACHIEVEMENT_CATALOG = [
  {
    id: 'francotirador',
    name: 'Francotirador',
    icon: '🎯',
    description: 'Primer marcador exacto. Ya diste en el blanco.',
    requirement: 'Acertar 1 marcador exacto.',
    active: true,
  },
  {
    id: 'francotirador-pro',
    name: 'Francotirador Pro',
    icon: '🎯',
    description: 'Tres exactos. Ojo de águila activado.',
    requirement: 'Acertar 3 marcadores exactos.',
    active: true,
  },
  {
    id: 'maestro-marcador',
    name: 'Maestro del Marcador',
    icon: '🎯🎯🎯',
    description: 'Cinco exactos. Eres una máquina.',
    requirement: 'Acertar 5 marcadores exactos.',
    active: true,
  },
  {
    id: 'enrachado',
    name: 'Enrachado',
    icon: '🔥',
    description: 'Tres ganadores seguidos. La racha empieza a sentirse real.',
    requirement: 'Acertar el ganador en 3 partidos consecutivos.',
    active: true,
  },
  {
    id: 'imparable',
    name: 'Imparable',
    icon: '🔥🔥',
    description: 'Cinco ganadores seguidos. Modo bestia.',
    requirement: 'Acertar el ganador en 5 partidos consecutivos.',
    active: true,
  },
  {
    id: 'analista',
    name: 'Analista',
    icon: '🧠',
    description: 'Top 5 estable. Lees la quiniela como pro.',
    requirement: 'Mantenerse en Top 5 durante 3 jornadas.',
    active: true,
  },
  {
    id: 'rey-del-pulpo',
    name: 'Rey del Pulpo',
    icon: '👑',
    description: 'Número uno del ranking. Coronan al pulpo.',
    requirement: 'Ser #1 del ranking.',
    active: true,
  },
  {
    id: 'el-elegido',
    name: 'Trono Kraken',
    icon: '🔱',
    description: 'El Kraken eligió al mejor. Defiéndelo o piérdelo.',
    requirement: 'Ser el #1 del ranking y recibir el trono del pulpo.',
    active: true,
    manualGrant: true,
  },
  {
    id: 'pick-salvaje',
    name: 'Pick Salvaje',
    icon: '⚡',
    description: 'Acertaste lo que casi nadie se atrevió a poner.',
    requirement: 'Acertar un marcador elegido por menos del 5% de usuarios.',
    active: true,
  },
  {
    id: 'pulpo-legendario',
    name: 'Pulpo Legendario',
    icon: '🐙',
    description: 'Índice Pulpo 90+. Nivel supremo.',
    requirement: 'Alcanzar Índice Pulpo 90+.',
    active: true,
  },
  {
    id: 'pulpo-futbolero-oficial',
    name: 'Pulpo Futbolero Oficial',
    icon: '🏃‍♂️',
    description: 'Participaste en Pulponi Cup 2026 desde el arranque del Mundial.',
    requirement: 'Entra a Pulponi Cup el 11 de junio de 2026 o después.',
    active: true,
  },
  {
    id: 'parlay-todo-o-nada',
    name: 'Todo o Nada',
    icon: '🏆',
    description: 'Te uniste al parlay Pulponi.',
    requirement: 'Inscríbete en el parlay Pulponi.',
    active: true,
  },
  {
    id: 'quiniela-aceptaste-el-reto',
    name: 'La Quiniela Llama',
    icon: '⚽',
    description: 'Aceptaste el reto y entraste a la competencia.',
    requirement: 'Inscríbete en la quiniela Pulponi.',
    active: true,
  },
  {
    id: 'comentarista-pulponi',
    name: 'Comentarista Pulponi',
    icon: '💬',
    description: 'Próximamente.',
    requirement: 'Envía 50 mensajes en el chat.',
    active: false,
  },
  {
    id: 'favorito-comunidad',
    name: 'Favorito de la Comunidad',
    icon: '❤️',
    description: 'Próximamente.',
    requirement: 'Recibe 30 reacciones en el chat.',
    active: false,
  },
  {
    id: 'pulpo-social',
    name: 'Pulpo Social',
    icon: '🫂',
    description: 'Próximamente.',
    requirement: 'Interactúa con 20 perfiles distintos.',
    active: false,
  },
  {
    id: 'senor-mundial',
    name: 'Señor Mundial',
    icon: '🌍',
    description: 'Próximamente.',
    requirement: 'Predice partidos de todos los grupos.',
    active: false,
  },
  {
    id: 'campeon-mundial',
    name: 'Campeón del Mundo',
    icon: '🏆',
    description: 'Próximamente.',
    requirement: 'Gana la quiniela completa.',
    active: false,
  },
  {
    id: 'top-3-pulponi',
    name: 'Top 3 Pulponi',
    icon: '🥇',
    description: 'Próximamente.',
    requirement: 'Termina entre los 3 mejores.',
    active: false,
  },
  {
    id: 'visionario-total',
    name: 'Visionario Total',
    icon: '👀',
    description: 'Próximamente.',
    requirement: 'Acierta 10 marcadores exactos.',
    active: false,
  },
  {
    id: 'goat-pulponi',
    name: 'GOAT Pulponi',
    icon: '🐐',
    description: 'Próximamente.',
    requirement: 'Mantente #1 durante 5 jornadas.',
    active: false,
  },
  {
    id: 'exacto-relampago',
    name: 'Exacto Relámpago',
    icon: '⚡',
    description: 'Próximamente.',
    requirement: 'Acierta un exacto en el último minuto.',
    active: false,
  },
  {
    id: 'rey-jornada',
    name: 'Rey de la Jornada',
    icon: '👑',
    description: 'Próximamente.',
    requirement: 'Lidera el ranking al cierre de una jornada.',
    active: false,
  },
  {
    id: 'pulponi-supremo',
    name: 'Pulponi Supremo',
    icon: '🐙',
    description: 'Próximamente.',
    requirement: 'Desbloquea todos los logros activos.',
    active: false,
  },
];

/** @deprecated usar ACHIEVEMENT_CATALOG */
export const achievements = ACHIEVEMENT_CATALOG;

export const EL_ELEGIDO_BADGE_ID = 'el-elegido';
/** @deprecated usar EL_ELEGIDO_BADGE_ID; nombre visible: Trono Kraken */
export const TRONO_KRAKEN_BADGE_ID = EL_ELEGIDO_BADGE_ID;

export function getAchievementById(id) {
  return ACHIEVEMENT_CATALOG.find((a) => a.id === id) ?? null;
}

/** Nombre, icono y descripción para UI: el catálogo estático gana sobre Supabase. */
function asBadgeLabel(value, fallback = '') {
  if (value == null) return fallback;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return fallback;
}

export function resolveBadgePresentation(badgeId, dbBadge = null, catalog = ACHIEVEMENT_CATALOG) {
  const staticDef = getAchievementById(badgeId);
  const fromCatalog = catalog?.find((a) => a.id === badgeId) ?? staticDef;
  const remote = dbBadge && typeof dbBadge === 'object' ? dbBadge : null;
  const name = asBadgeLabel(
    staticDef?.name ?? fromCatalog?.name ?? remote?.name,
    asBadgeLabel(badgeId, 'Logro')
  );
  return {
    name,
    icon: asBadgeLabel(staticDef?.icon ?? fromCatalog?.icon ?? remote?.icon, '🏆'),
    iconSrc: getBadgeIconImage(badgeId, { name }),
    description: asBadgeLabel(
      staticDef?.description ?? fromCatalog?.description ?? remote?.description,
      ''
    ),
  };
}

export function isManualAchievement(achievementOrId) {
  const id = typeof achievementOrId === 'string' ? achievementOrId : achievementOrId?.id;
  const def = getAchievementById(id);
  return Boolean(def?.manualGrant);
}

/** Logros que el motor puede otorgar automáticamente (excluye manualGrant). */
export function getAutoGrantAchievements(catalog = ACHIEVEMENT_CATALOG) {
  return catalog.filter((a) => a.active && !a.manualGrant);
}

function normalizeUnlockedIdSet(unlockedIds) {
  return unlockedIds instanceof Set ? unlockedIds : new Set(unlockedIds ?? []);
}

/** Filas de user_badges que pertenecen al perfil indicado. */
export function filterUserBadgeRowsForProfile(userBadgeRows, profileId) {
  if (!profileId) return [];
  const pid = String(profileId);
  return (userBadgeRows ?? []).filter(
    (row) => row?.badge_id && String(row.profile_id) === pid
  );
}

/** ¿El usuario tiene este badge en user_badges? Misma regla para todos los badges. */
export function userHasBadge(userBadgeRows, profileId, badgeId) {
  if (!profileId || !badgeId) return false;
  const targetId = String(badgeId);
  return filterUserBadgeRowsForProfile(userBadgeRows, profileId).some(
    (row) => String(row.badge_id) === targetId
  );
}

/** Alias explícito: desbloqueado = fila en user_badges del perfil. */
export function isBadgeUnlockedForProfile(userBadgeRows, profileId, badgeId) {
  return userHasBadge(userBadgeRows, profileId, badgeId);
}

/** IDs desbloqueados: únicamente badge_id presentes en user_badges del perfil. */
export function getUnlockedBadgeIdsFromRows(userBadgeRows, profileId) {
  return filterUserBadgeRowsForProfile(userBadgeRows, profileId).map((row) => row.badge_id);
}

/**
 * Badges desbloqueados para UI: solo filas user_badges del perfil (fuente de verdad).
 */
export function buildUnlockedBadgesForProfile(
  userBadgeRows,
  profileId,
  catalog = ACHIEVEMENT_CATALOG
) {
  const rows = filterUserBadgeRowsForProfile(userBadgeRows, profileId);
  if (!rows.length) return [];

  return rows.map((row) => {
    const badgeId = row.badge_id;
    const remoteBadge = row.badges ?? null;
    const display = resolveBadgePresentation(badgeId, remoteBadge, catalog);
    return {
      id: badgeId,
      icon: display.icon,
      iconSrc: display.iconSrc,
      name: display.name,
      description: display.description,
      earnedAt: row.earned_at ?? row.earnedAt ?? null,
    };
  });
}

/**
 * Badges desbloqueados para UI: solo IDs presentes en user_badges del usuario.
 */
export function buildUnlockedBadgesForDisplay(
  unlockedIds,
  catalog = ACHIEVEMENT_CATALOG,
  { earnedRows = null, profileId = null } = {}
) {
  if (profileId && earnedRows?.length) {
    return buildUnlockedBadgesForProfile(earnedRows, profileId, catalog);
  }

  const unlockedSet = normalizeUnlockedIdSet(unlockedIds);
  if (!unlockedSet.size) return [];

  if (earnedRows?.length) {
    const rows = profileId
      ? filterUserBadgeRowsForProfile(earnedRows, profileId)
      : earnedRows;
    return rows
      .filter((row) => row.badge_id && unlockedSet.has(row.badge_id))
      .map((row) => {
        const badgeId = row.badge_id;
        const display = resolveBadgePresentation(badgeId, row.badges ?? null, catalog);
        return {
          id: badgeId,
          icon: display.icon,
          iconSrc: display.iconSrc,
          name: display.name,
          description: display.description,
          earnedAt: row.earned_at ?? row.earnedAt ?? null,
        };
      });
  }

  return catalog
    .filter((a) => unlockedSet.has(a.id))
    .map((a) => ({
      id: a.id,
      icon: a.icon,
      iconSrc: getBadgeIconImage(a.id, { name: a.name }),
      name: a.name,
      description: a.description,
      earnedAt: null,
    }));
}

export function countAchievementsTotal(catalog = ACHIEVEMENT_CATALOG) {
  return catalog.length;
}

export function countAchievementsUnlocked(unlockedIds, catalog = ACHIEVEMENT_CATALOG) {
  const set = unlockedIds instanceof Set ? unlockedIds : new Set(unlockedIds ?? []);
  return catalog.filter((a) => set.has(a.id)).length;
}

export function isAchievementUnlockedById(
  unlockedIds,
  achievementId,
  { userBadgeRows = null, profileId = null } = {}
) {
  if (profileId && Array.isArray(userBadgeRows)) {
    return userHasBadge(userBadgeRows, profileId, achievementId);
  }
  const set = unlockedIds instanceof Set ? unlockedIds : new Set(unlockedIds ?? []);
  return set.has(achievementId);
}

/** Compatibilidad con badges antiguos de Supabase */
export function isAchievementUnlocked(badges, achievement, profileId = null) {
  if (!achievement?.id) return false;
  if (Array.isArray(badges) && badges.every((b) => typeof b === 'string')) {
    return badges.includes(achievement.id);
  }
  const badge = badges?.find?.((b) => {
    const badgeId = b.id ?? b.badge_id;
    return badgeId === achievement.id;
  });
  if (!badge) return false;

  if (Array.isArray(badge.user_badges)) {
    if (!badge.user_badges.length) return false;
    if (profileId) {
      return badge.user_badges.some((row) => String(row.profile_id) === String(profileId));
    }
    return false;
  }

  return Boolean(badge.earned_at);
}
