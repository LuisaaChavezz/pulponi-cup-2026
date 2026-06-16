import { getBadgeIconImage } from '../data/badgeAssets';

export default function BadgeIcon({ badgeId = null, icon, iconSrc = null, alt = '', className = '' }) {
  const src = iconSrc ?? getBadgeIconImage(badgeId);
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={['badge-icon-img', className].filter(Boolean).join(' ')}
        loading="lazy"
        decoding="async"
      />
    );
  }
  return icon ?? null;
}
