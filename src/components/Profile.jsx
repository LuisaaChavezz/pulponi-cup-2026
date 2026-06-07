import { isLogoAvatar, resolveAvatarUrl } from '../lib/avatars';

const AVATAR_MOBILE = 160;
const AVATAR_DESKTOP = 220;

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
  const logo = isLogoAvatar(src);
  const handle = username?.startsWith('@') ? username : username ? `@${username}` : '@jugador';

  const stats = [
    { key: 'rank', value: rank != null ? `#${rank}` : '—', label: 'Ranking' },
    { key: 'pts', value: Number(points ?? 0), label: 'Puntos' },
    { key: 'ex', value: Number(exacts ?? 0), label: 'Exactos' },
    ...(showPulpoIndex
      ? [{ key: 'pulpo', value: `${Number(pulpoIndex ?? 0)}%`, label: 'Índice Pulpo', accent: true }]
      : []),
    { key: 'streak', value: Number(streak ?? 0), label: 'Racha' },
  ];

  const avatarStyle = {
    width: AVATAR_MOBILE,
    height: AVATAR_MOBILE,
    minWidth: AVATAR_MOBILE,
    minHeight: AVATAR_MOBILE,
    maxWidth: AVATAR_MOBILE,
    maxHeight: AVATAR_MOBILE,
    objectFit: logo ? 'contain' : 'cover',
    objectPosition: 'center',
    borderRadius: '50%',
    display: 'block',
    flexShrink: 0,
    padding: logo ? 14 : 0,
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
                className={`pulponi-player-card__photo${logo ? ' pulponi-player-card__photo--logo' : ''}`}
                width={AVATAR_MOBILE}
                height={AVATAR_MOBILE}
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
