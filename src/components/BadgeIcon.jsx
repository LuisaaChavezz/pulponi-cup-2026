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
}) {
  const badgeName = name || alt;
  const resolvedIcon = pickImageIcon(icon, iconSrc) ?? iconSrc ?? icon;

  const content = isRenderableImageIcon(resolvedIcon) ? (
    <img
      src={resolvedIcon}
      alt={badgeName || 'Badge'}
      style={{ width: '40px', height: '40px', objectFit: 'contain' }}
    />
  ) : (
    <span>{resolvedIcon}</span>
  );

  if (className) {
    return <span className={className}>{content}</span>;
  }

  return content;
}
