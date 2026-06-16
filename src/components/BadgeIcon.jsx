import { isBadgeImageIcon } from '../data/achievements';

export default function BadgeIcon({
  badgeId = null,
  name = '',
  icon,
  iconSrc = null,
  alt = '',
  className = '',
}) {
  const lookupName = name || alt;
  const src = iconSrc ?? (isBadgeImageIcon(icon) ? icon : null);

  if (src) {
    return (
      <img
        src={src}
        alt={alt || lookupName || 'Badge'}
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
