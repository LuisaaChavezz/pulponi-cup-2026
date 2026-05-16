export const achievements = [
  {
    id: 'exacto-perfecto',
    name: 'Exacto Perfecto',
    icon: '🎯',
    description: 'Ya mejor dinos los resultados de mañana.',
    requirement: 'Acierta 3 marcadores exactos.',
  },
  {
    id: 'cerebro-mundialista',
    name: 'Cerebro Mundialista',
    icon: '🧠',
    description: 'Tu IQ futbolero ya preocupa.',
    requirement: 'Consigue 25 predicciones correctas.',
  },
  {
    id: 'rey-del-marcador',
    name: 'Rey del Marcador',
    icon: '👑',
    description: 'La FIFA quiere hablar contigo.',
    requirement: 'Termina una jornada en primer lugar.',
  },
  {
    id: 'enrachado',
    name: 'Enrachado',
    icon: '🔥',
    description: 'Estás cocinando puro pick ganador.',
    requirement: 'Gana puntos en 5 partidos seguidos.',
  },
  {
    id: 'imparable',
    name: 'Imparable',
    icon: '⚡',
    description: 'Ni el VAR pudo detenerte.',
    requirement: 'Consigue más de 50 puntos.',
  },
  {
    id: 'sangre-fria',
    name: 'Sangre Fría',
    icon: '❄️',
    description: 'Ni en penales te tiembla la mano.',
    requirement: 'Acierta un marcador al minuto 89.',
  },
  {
    id: 'comentarista-oficial',
    name: 'Comentarista Oficial',
    icon: '💬',
    description: 'Ya nomás falta que te fiche ESPN.',
    requirement: 'Envía 100 mensajes en el chat.',
  },
  {
    id: 'favorito-del-chat',
    name: 'Favorito del Chat',
    icon: '❤️',
    description: 'El pueblo te ama.',
    requirement: 'Recibe 50 reacciones en comentarios.',
  },
  {
    id: 'pulpo-social',
    name: 'Pulpo Social',
    icon: '🫂',
    description: 'Conoces más gente aquí que en la vida real.',
    requirement: 'Interactúa con 25 usuarios distintos.',
  },
  {
    id: 'senor-mundial',
    name: 'Señor Mundial',
    icon: '🌍',
    description: 'Respiras fútbol internacional.',
    requirement: 'Predice partidos de todos los grupos.',
  },
  {
    id: 'campeon-del-mundo',
    name: 'Campeón del Mundo',
    icon: '🏆',
    description: 'Ya puedes besar la copa.',
    requirement: 'Gana la quiniela completa.',
  },
  {
    id: 'top-3-mundial',
    name: 'Top 3 Mundial',
    icon: '🥇',
    description: 'Presume tranquilo, sí te lo ganaste.',
    requirement: 'Termina entre los 3 mejores.',
  },
  {
    id: 'visionario',
    name: 'Visionario',
    icon: '👀',
    description: 'Eso no era suerte y lo sabes.',
    requirement: 'Acierta un resultado totalamente inesperado.',
  },
  {
    id: 'goat',
    name: 'GOAT',
    icon: '🐐',
    description: 'Cristiano y Messi discuten por ti.',
    requirement: 'Mantente top 1 durante 3 jornadas.',
  },
  {
    id: 'pulponi-supremo',
    name: 'Pulponi Supremo',
    icon: '🐙',
    description: 'El océano entero te teme.',
    requirement: 'Desbloquea TODOS los logros.',
  },
];

function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function findBadgeForAchievement(badges, achievement) {
  if (!badges?.length) return null;
  return badges.find((b) => {
    const badgeId = b.id ?? slugify(b.name);
    return badgeId === achievement.id || slugify(b.name) === achievement.id || b.name === achievement.name;
  });
}

export function isAchievementUnlocked(badges, achievement) {
  const badge = findBadgeForAchievement(badges, achievement);
  return (badge?.user_badges?.length ?? 0) > 0;
}
