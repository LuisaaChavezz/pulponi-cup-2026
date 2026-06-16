/** Imágenes locales para badges cuyo ícono no es emoji. */
export const BADGE_ICON_IMAGES = {
  'el-elegido': '/badges/trono-kraken.png',
};

export function getBadgeIconImage(badgeId) {
  if (!badgeId) return null;
  return BADGE_ICON_IMAGES[badgeId] ?? null;
}
