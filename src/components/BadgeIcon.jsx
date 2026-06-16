function isRenderableImageIcon(value) {
  return typeof value === 'string' && (value.startsWith('http') || value.startsWith('/'));
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
  const resolvedIcon = pickImageIcon(icon, iconSrc) ?? iconSrc ?? icon;

  const content = isRenderableImageIcon(resolvedIcon) ? (
    <img
      src={resolvedIcon}
      alt={badgeName || 'Badge'}
      className="badge-icon-img"
      style={{ width: `${size}px`, height: `${size}px`, objectFit: 'contain' }}
      loading="lazy"
      decoding="async"
    />
  ) : (
    <span className="badge-emoji">{resolvedIcon}</span>
  );

  if (className) {
    return <span className={className}>{content}</span>;
  }

  return content;
}
