import { resolveAvatarUrl } from '../lib/avatars';

const VARIANT_CLASS = {
  chat: 'avatar-frame--chat',
  ranking: 'avatar-frame--ranking',
  community: 'avatar-frame--community',
  profile: 'avatar-frame--profile',
  xs: 'avatar-frame--xs',
  sm: 'avatar-frame--sm',
};

export default function UserAvatar({
  photoUrl,
  avatarUrl,
  alt = '',
  className = '',
  size,
  variant,
}) {
  const src = avatarUrl ?? resolveAvatarUrl(photoUrl);
  const classes = [
    'avatar-frame',
    variant ? VARIANT_CLASS[variant] : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const style = size ? { width: size, height: size, minWidth: size, minHeight: size } : undefined;

  return (
    <span className={classes} style={style}>
      <img src={src} alt={alt} loading="lazy" decoding="async" />
    </span>
  );
}
