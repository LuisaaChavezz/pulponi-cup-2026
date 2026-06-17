import { resolveAvatarUrl } from '../lib/avatars';

const AVATAR_SIZE = 96;

/**
 * Tarjeta de jugador Pulponi (FUT / Discord / COD).
 * Avatar fijo en px; la foto subida solo alimenta un halo blur pequeño, no pantalla completa.
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
  showPulpoIndex = false,
  streak = 0,
  verified = false,
  uploadLabel = null,
  onUpload,
}) {
  const src = avatarUrl ?? resolveAvatarUrl(photoUrl);
  const handle = username?.startsWith('@')
    ? username
    : username
      ? `@${username}`
      : displayName
        ? `@${String(displayName).split(/\s+/)[0]}`
        : '@miembro';

  const stats = [
    { key: 'rank', value: rank != null ? `#${rank}` : '—', label: 'Ranking' },
    { key: 'pts', value: Number(points ?? 0), label: 'Puntos' },
    { key: 'ex', value: Number(exacts ?? 0), label: 'Exactos' },
    ...(showPulpoIndex
      ? [{ key: 'pulpo', value: `${Number(pulpoIndex ?? 0)}%`, label: 'Índice Pulpo', accent: true }]
      : []),
    { key: 'streak', value: Number(streak ?? 0), label: 'Racha acumulada' },
  ];

  const avatarStyle = {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    minWidth: AVATAR_SIZE,
    minHeight: AVATAR_SIZE,
    maxWidth: AVATAR_SIZE,
    maxHeight: AVATAR_SIZE,
    objectFit: 'cover',
    objectPosition: 'center',
    borderRadius: '9999px',
    display: 'block',
    flexShrink: 0,
    boxSizing: 'border-box',
    background: '#08080a',
  };

  return (
    <section className="pulponi-player-card" aria-label="Tarjeta de jugador" data-profile-card>
      {src ? (
        <>
          <div
            className="pulponi-player-card__bg"
            style={{ backgroundImage: `url(${src})` }}
            aria-hidden
          />
          <div className="pulponi-player-card__bg-overlay" aria-hidden />
          <div
            className="pulponi-player-card__halo"
            style={{ backgroundImage: `url(${src})` }}
            aria-hidden
          />
        </>
      ) : (
        <div className="pulponi-player-card__shade" aria-hidden />
      )}

      <div className="pulponi-player-card__body">
        <div className="pulponi-player-card__top">
          <div
            className={`pulponi-player-card__avatar-slot${onUpload ? ' pulponi-player-card__avatar-slot--upload' : ''}`}
            role={onUpload ? 'button' : undefined}
            tabIndex={onUpload ? 0 : undefined}
            onClick={onUpload ? () => document.getElementById('pulponi-avatar-upload')?.click() : undefined}
            onKeyDown={
              onUpload
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      document.getElementById('pulponi-avatar-upload')?.click();
                    }
                  }
                : undefined
            }
          >
            <div className="pulponi-player-card__ring">
              <img
                src={src}
                alt=""
                className="pulponi-player-card__photo"
                width={AVATAR_SIZE}
                height={AVATAR_SIZE}
                style={avatarStyle}
                loading="lazy"
                decoding="async"
              />
            </div>
            {uploadLabel ? <span className="pulponi-player-card__upload">{uploadLabel}</span> : null}
            {onUpload ? (
              <input id="pulponi-avatar-upload" type="file" accept="image/*" hidden onChange={onUpload} />
            ) : null}
          </div>

          <div className="pulponi-player-card__identity">
            <p className="pulponi-player-card__handle">{handle}</p>
            {displayName ? <h2 className="pulponi-player-card__name">{displayName}</h2> : null}
            {verified ? <span className="pulponi-player-card__badge-verified">Pulponi Verified ✓</span> : null}
          </div>
        </div>

        <div className="pulponi-player-card__stats" aria-label="Estadísticas principales">
          {stats.map((s) => (
            <div
              key={s.key}
              className={`pulponi-player-card__stat${s.accent ? ' pulponi-player-card__stat--accent' : ''}`}
            >
              <b>{s.value}</b>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
