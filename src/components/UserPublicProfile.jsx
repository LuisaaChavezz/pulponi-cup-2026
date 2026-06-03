import UserAvatar from './UserAvatar';
import { selectDisplayName } from '../lib/rankingHistory';
import { resolveAvatarUrl } from '../lib/avatars';
import { countAchievementsTotal } from '../data/achievements';

function StatCard({ label, value, suffix = '' }) {
  return (
    <div className="social-profile-stat">
      <b>
        {value}
        {suffix}
      </b>
      <span>{label}</span>
    </div>
  );
}

function statusLabel(status) {
  return status;
}

export default function UserPublicProfile({
  data,
  loading,
  error,
  isOwnProfile,
  onEditProfile,
  onBack,
  achievementsTotal,
}) {
  if (loading) {
    return (
      <div className="social-profile social-profile--loading">
        <p className="social-profile__muted">Cargando perfil…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="social-profile social-profile--empty">
        <p className="social-profile__muted">{error ?? 'Perfil no disponible'}</p>
        {onBack ? (
          <button type="button" className="social-profile__back" onClick={onBack}>
            Volver
          </button>
        ) : null}
      </div>
    );
  }

  const { profile, rankingSummary, stats, pickHistory, badges, activity, pulpoStats } = data;
  const displayName = selectDisplayName(profile);
  const username = profile.username ? `@${profile.username}` : '@jugador';
  const avatarUrl = resolveAvatarUrl(profile.photo_url);
  const totalBadges = achievementsTotal ?? countAchievementsTotal();
  const unlockedBadges = badges.length;

  return (
    <div className="social-profile">
      <div className="social-profile__toolbar">
        {onBack ? (
          <button type="button" className="social-profile__back" onClick={onBack}>
            ← Volver
          </button>
        ) : null}
        {isOwnProfile && onEditProfile ? (
          <button type="button" className="social-profile__edit" onClick={onEditProfile}>
            Editar perfil
          </button>
        ) : null}
      </div>

      <header className="social-profile__hero pulponi-card">
        <div className="social-profile__hero-main">
          <UserAvatar avatarUrl={avatarUrl} profile className="avatar-frame--profile social-profile__avatar" alt="" />
          <div className="social-profile__identity">
            <p className="social-profile__username">{username}</p>
            <h2 className="social-profile__name">{displayName}</h2>
            <p className="social-profile__rank-line">
              Puesto <strong>#{rankingSummary.currentRank ?? '—'}</strong>
              {rankingSummary.bestRank != null ? (
                <>
                  {' '}
                  · Mejor <strong>#{rankingSummary.bestRank}</strong>
                </>
              ) : null}
            </p>
          </div>
        </div>

        <div className="social-profile__hero-stats">
          <div>
            <b>{stats.points}</b>
            <span>Puntos</span>
          </div>
          <div>
            <b>{stats.exacts}</b>
            <span>Exactos</span>
          </div>
          <div>
            <b>{stats.pulpoIndex}%</b>
            <span>Índice Pulpo</span>
          </div>
          <div>
            <b>{stats.currentStreak}</b>
            <span>Racha</span>
          </div>
        </div>

        {badges.length ? (
          <div className="social-profile__badge-strip" aria-label="Badges desbloqueados">
            {badges.slice(0, 10).map((b) => (
              <span key={b.id} className="social-profile__badge-chip" title={b.name}>
                {b.icon}
              </span>
            ))}
          </div>
        ) : null}
      </header>

      <section className="social-profile__section pulponi-card">
        <div className="social-profile__section-head">
          <h3>Estadísticas</h3>
        </div>
        <div className="social-profile-stats-grid">
          <StatCard label="Partidos pronosticados" value={stats.predicted} />
          <StatCard label="Resultados acertados" value={stats.correctResults} />
          <StatCard label="Marcadores exactos" value={stats.exacts} />
          <StatCard label="Efectividad" value={stats.effectiveness} suffix="%" />
          <StatCard label="Picks arriesgados acertados" value={stats.riskyHits} />
          <StatCard label="Mejor racha" value={stats.bestStreak} />
          <StatCard
            label="Posición más alta"
            value={stats.bestRank != null ? `#${stats.bestRank}` : '—'}
          />
          <StatCard label="Logros" value={`${unlockedBadges}/${totalBadges}`} />
        </div>
      </section>

      <section className="social-profile__section pulponi-card">
        <div className="social-profile__section-head">
          <h3>Historial de predicciones</h3>
        </div>
        {!pickHistory.length ? (
          <p className="social-profile__muted">Todavía no hay predicciones registradas.</p>
        ) : (
          <div className="social-profile-history">
            <div className="social-profile-history__head" aria-hidden>
              <span>Partido</span>
              <span>Pronóstico</span>
              <span>Final</span>
              <span>Pts</span>
              <span>Estado</span>
            </div>
            {pickHistory.map((row) => (
              <div key={row.matchId} className={`social-profile-history__row social-profile-history__row--${row.statusClass}`}>
                <span className="social-profile-history__match">{row.matchLabel}</span>
                <span className="social-profile-history__mono">{row.prediction}</span>
                <span className="social-profile-history__mono">{row.finalResult}</span>
                <span className="social-profile-history__pts">{row.status === 'Pendiente' ? '—' : row.points}</span>
                <span className={`social-profile-history__status social-profile-history__status--${row.statusClass}`}>
                  {statusLabel(row.status)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="social-profile__section pulponi-card">
        <div className="social-profile__section-head">
          <h3>Badges desbloqueados</h3>
          <span className="social-profile__section-meta">
            {unlockedBadges} / {totalBadges}
          </span>
        </div>
        {!badges.length ? (
          <p className="social-profile__muted">Sin badges desbloqueados todavía.</p>
        ) : (
          <ul className="social-profile-badges-list">
            {badges.map((b) => (
              <li key={b.id} className="social-profile-badge-item">
                <span className="social-profile-badge-item__icon" aria-hidden>
                  {b.icon}
                </span>
                <div className="social-profile-badge-item__body">
                  <strong>{b.name}</strong>
                  <p>{b.description}</p>
                  {b.earnedAt ? (
                    <time dateTime={b.earnedAt}>
                      {new Date(b.earnedAt).toLocaleDateString('es-MX', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </time>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="social-profile__section pulponi-card">
        <div className="social-profile__section-head">
          <h3>Actividad reciente</h3>
        </div>
        {!activity.length ? (
          <p className="social-profile__muted">Sin actividad reciente.</p>
        ) : (
          <ul className="social-profile-activity">
            {activity.map((item) => (
              <li key={item.id}>
                <p>{item.text}</p>
                {item.at ? (
                  <time dateTime={item.at}>
                    {new Date(item.at).toLocaleString('es-MX', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {pulpoStats ? (
        <p className="social-profile__pulpo-tier social-profile__muted">
          Nivel Pulpo: <strong>{pulpoStats.level?.title ?? '—'}</strong>
        </p>
      ) : null}
    </div>
  );
}
