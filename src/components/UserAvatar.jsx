import { isLogoAvatar, resolveAvatarUrl } from '../lib/avatars';

export default function UserAvatar({
  photoUrl,
  avatarUrl,
  alt = '',
  className = '',
  size,
  profile = false,
}) {
  const src = avatarUrl ?? resolveAvatarUrl(photoUrl);
  const logo = isLogoAvatar(src);
  const classes = [
    'avatar-frame',
    className,
    profile && logo ? 'avatar-frame--logo-profile' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const style = size ? { width: size, height: size } : undefined;

  return (
    <span className={classes} style={style}>
      <img src={src} alt={alt} loading="lazy" />
    </span>
  );
}
