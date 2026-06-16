export default function BadgeIcon({
  badgeId = null,
  name = '',
  icon,
  iconSrc = null,
  alt = '',
  className = '',
}) {
  const badge = { icon: iconSrc ?? icon, name: name || alt };

  const content = badge.icon?.startsWith('http') ? (
    <img
      src={badge.icon}
      alt={badge.name}
      style={{ width: '40px', height: '40px', objectFit: 'contain' }}
    />
  ) : (
    <span>{badge.icon}</span>
  );

  if (className) {
    return <span className={className}>{content}</span>;
  }

  return content;
}
