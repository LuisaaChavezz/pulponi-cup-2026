function pickHttpIcon(...values) {
  return values.find((value) => typeof value === 'string' && value.startsWith('http')) ?? null;
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
  const resolvedIcon = pickHttpIcon(icon, iconSrc) ?? iconSrc ?? icon;

  const content = resolvedIcon?.startsWith('http') ? (
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
