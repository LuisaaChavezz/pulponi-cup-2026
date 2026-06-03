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
    icon: '🎯🎯',
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
    description: 'Tres aciertos seguidos. Te sientes imparable.',
    requirement: 'Acertar 3 resultados seguidos.',
    active: true,
  },
  {
    id: 'imparable',
    name: 'Imparable',
    icon: '🔥🔥',
    description: 'Cinco seguidos. Modo bestia.',
    requirement: 'Acertar 5 resultados seguidos.',
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

export function getAchievementById(id) {
  return ACHIEVEMENT_CATALOG.find((a) => a.id === id) ?? null;
}

export function countAchievementsTotal(catalog = ACHIEVEMENT_CATALOG) {
  return catalog.length;
}

export function countAchievementsUnlocked(unlockedIds, catalog = ACHIEVEMENT_CATALOG) {
  const set = unlockedIds instanceof Set ? unlockedIds : new Set(unlockedIds ?? []);
  return catalog.filter((a) => set.has(a.id)).length;
}

export function isAchievementUnlockedById(unlockedIds, achievementId) {
  const set = unlockedIds instanceof Set ? unlockedIds : new Set(unlockedIds ?? []);
  return set.has(achievementId);
}

/** Compatibilidad con badges antiguos de Supabase */
export function isAchievementUnlocked(badges, achievement) {
  if (!achievement?.id) return false;
  if (Array.isArray(badges) && badges.every((b) => typeof b === 'string')) {
    return badges.includes(achievement.id);
  }
  const badge = badges?.find?.((b) => {
    const badgeId = b.id ?? b.badge_id;
    return badgeId === achievement.id || b.name === achievement.name;
  });
  return (badge?.user_badges?.length ?? 0) > 0 || Boolean(badge?.earned_at);
}
