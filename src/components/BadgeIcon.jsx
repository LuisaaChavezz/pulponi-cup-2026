function isRenderableImageIcon(value) {
  return (
    typeof value === 'string' &&
    (value.startsWith('http') || badge.icon?.startsWith('data:') || value.startsWith('/') || value.startsWith('data:'))
  );
}

function pickImageIcon(...values) {
  return values.find(isRenderableImageIcon) ?? null;
}

export default function BadgeIcon({
  badgeId = null,
  name = '',
  icon,
  iconSrc = null,
  alt = '',
  className = '',
  size = 40,
}) {
  const badgeName = name || alt;
  const badge = { icon: pickImageIcon(icon, iconSrc) ?? iconSrc ?? icon, name: badgeName };

  const content =
    badge.icon?.startsWith('http') || badge.icon?.startsWith('data:') || badge.icon?.startsWith('data:') || badge.icon?.startsWith('/') ? (
      <img
        src={badge.icon}
        alt={badge.name || 'Badge'}
        className="badge-icon-img"
        style={{ width: `${size}px`, height: `${size}px`, objectFit: 'contain' }}
        loading="lazy"
        decoding="async"
      />
    ) : (
      <span className="badge-emoji">{badge.icon}</span>
    );

  if (className) {
    return <span className={className}>{content}</span>;
  }

  return content;
}
