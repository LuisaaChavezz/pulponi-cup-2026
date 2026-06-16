import { isBadgeImageIcon } from '../data/achievements';

function resolveBadgeImageSrc(icon, iconSrc) {
  if (iconSrc) return iconSrc;
  if (typeof icon !== 'string' || !icon) return null;
  if (icon.startsWith('http') || isBadgeImageIcon(icon)) return icon;
  return null;
}

export default function BadgeIcon({
  badgeId = null,
  name = '',
  icon,
  iconSrc = null,
  alt = '',
  className = '',
}) {
  const lookupName = name || alt;
  const src = resolveBadgeImageSrc(icon, iconSrc);

  if (src) {
    return (
      <img
        src={src}
        alt={lookupName || 'Badge'}
        className={['badge-icon-img', className].filter(Boolean).join(' ')}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <span className={['badge-emoji', className].filter(Boolean).join(' ')} aria-hidden>
      {icon ?? null}
    </span>
  );
}
