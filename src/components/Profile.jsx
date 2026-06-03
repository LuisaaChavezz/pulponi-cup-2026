import { isLogoAvatar, resolveAvatarUrl } from '../lib/avatars';

/**
 * Cabecera de perfil — tarjeta de jugador (FUT / Discord / COD).
 * Avatar fijo 160px móvil / 220px desktop. Foto solo como fondo blur.
 */
export default function Profile({
  avatarUrl,
  photoUrl,
  username,
  displayName,
  rank,
  points = 0,
  exacts = 0,
  pulpoIndex = 0,
  streak = 0,
  verified = false,
  uploadLabel = null,
  onUpload,
}) {
  const src = avatarUrl ?? resolveAvatarUrl(photoUrl);
  const logo = isLogoAvatar(src);
  const handle = username?.startsWith('@') ? username : username ? `@${username}` : '@jugador';

  const stats = [
    { key: 'rank', value: rank != null ? `#${rank}` : '—', label: 'Ranking' },
    { key: 'pts', value: Number(points ?? 0), label: 'Puntos' },
    { key: 'ex', value: Number(exacts ?? 0), label: 'Exactos' },
    { key: 'pulpo', value: `${Number(pulpoIndex ?? 0)}%`, label: 'Índice Pulpo', highlight: true },
    { key: 'streak', value: Number(streak ?? 0), label: 'Racha' },
  ];

  const AvatarTag = onUpload ? 'label' : 'div';

  return (
    <header className="player-card-header" aria-label="Tarjeta de jugador">
      <div
        className="player-card-header__bg"
        style={src ? { backgroundImage: `url(${src})` } : undefined}
        aria-hidden
      />
      <div className="player-card-header__overlay" aria-hidden />

      <div className="player-card-header__content">
        <AvatarTag
          className={`player-card-header__avatar${onUpload ? ' player-card-header__avatar--upload' : ''}`}
        >
          <img
            src={src}
            alt=""
            className={`player-card-header__avatar-img${logo ? ' player-card-header__avatar-img--logo' : ''}`}
            width={160}
            height={160}
            loading="lazy"
            decoding="async"
          />
          {uploadLabel ? <span className="player-card-header__upload-hint">{uploadLabel}</span> : null}
          {onUpload ? <input type="file" accept="image/*" hidden onChange={onUpload} /> : null}
        </AvatarTag>

        <div className="player-card-header__info">
          <p className="player-card-header__handle">{handle}</p>
          {displayName ? <h2 className="player-card-header__name">{displayName}</h2> : null}
          {verified ? <span className="player-card-header__verified">Pulponi Verified ✓</span> : null}

          <div className="player-card-header__stats" aria-label="Estadísticas principales">
            {stats.map((s) => (
              <div
                key={s.key}
                className={`player-card-header__stat${s.highlight ? ' player-card-header__stat--pulpo' : ''}`}
              >
                <b>{s.value}</b>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
