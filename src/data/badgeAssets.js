import tronoKrakenImage from '../assets/badges/trono-kraken.png';

const TRONO_KRAKEN_BADGE_IDS = new Set([
  'el-elegido',
  'el_elegido',
  'tron-kraken',
  'trono-kraken',
]);

const TRONO_KRAKEN_BADGE_NAMES = new Set(['trono kraken', 'el elegido']);

/** Imágenes locales para badges cuyo ícono no es emoji. */
export const BADGE_ICON_IMAGES = {
  'el-elegido': tronoKrakenImage,
};

function normalizeBadgeKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export function isTronoKrakenBadge(badgeId, name = '') {
  const id = normalizeBadgeKey(badgeId);
  const label = normalizeBadgeKey(name);
  return TRONO_KRAKEN_BADGE_IDS.has(id) || TRONO_KRAKEN_BADGE_NAMES.has(label);
}

export function getBadgeIconImage(badgeId, { name } = {}) {
  if (isTronoKrakenBadge(badgeId, name)) return tronoKrakenImage;
  const id = normalizeBadgeKey(badgeId);
  return BADGE_ICON_IMAGES[id] ?? null;
}
