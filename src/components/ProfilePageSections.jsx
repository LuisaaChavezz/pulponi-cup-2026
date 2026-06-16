/** Oculto en UI; activity_log y carga en hooks siguen activos. Cambiar a true para reactivar. */
import { useKickoffClock } from '../hooks/useKickoffClock';
import { isProfilePickRevealed } from '../lib/matchUtils';

export const SHOW_PROFILE_ACTIVITY = false;

function isHistoryRowRevealed(row, now) {
  return isProfilePickRevealed(
    {
      kickoff: row.kickoff,
      status: row.matchRawStatus,
      api_status: row.matchApiStatus,
    },
    now
  );
}

function ProfilePageCard({ title, meta, children, className = '' }) {
  return (
    <section className={`profile-page-card pulponi-card ${className}`.trim()}>
      <div className="profile-page-card__head">
        <h3>{title}</h3>
        {meta ? <span className="profile-page-card__meta">{meta}</span> : null}
      </div>
      <div className="profile-page-card__body">{children}</div>
    </section>
  );
}

export function ProfileStatsGrid({ stats }) {
  const s = stats ?? {};
  return (
    <div className="profile-page-stats-grid">
      <div>
        <b>{s.predicted ?? 0}</b>
        <span>Pronosticados</span>
      </div>
      <div>
        <b>{s.correctResults ?? 0}</b>
        <span>Aciertos</span>
      </div>
      <div>
        <b>{s.exacts ?? 0}</b>
        <span>Exactos</span>
      </div>
      <div>
        <b>{s.effectiveness ?? 0}%</b>
        <span>Efectividad</span>
      </div>
      <div>
        <b>{s.riskyHits ?? 0}</b>
        <span>Picks arriesgados</span>
      </div>
      <div>
        <b>{s.bestStreak ?? 0}</b>
        <span>Mejor racha</span>
      </div>
      <div>
        <b>{s.bestRank != null ? `#${s.bestRank}` : '—'}</b>
        <span>Mejor puesto</span>
      </div>
      <div>
        <b>{s.currentStreak ?? 0}</b>
        <span>Racha actual</span>
      </div>
    </div>
  );
}

export function ProfileBadgesList({ badges, emptyText = 'Sin badges desbloqueados todavía.' }) {
  if (!badges?.length) {
    return <p className="profile-page__muted">{emptyText}</p>;
  }
  return (
    <ul className="profile-page-badges-list">
      {badges.map((b) => (
        <li key={b.id} className="profile-page-badge-item">
          <span className="profile-page-badge-item__icon" aria-hidden>
            {b.icon}
          </span>
          <div>
            <strong>{b.name}</strong>
            {b.description ? <p>{b.description}</p> : null}
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
  );
}

export function ProfileActivityList({ items, emptyText = 'Sin actividad reciente.' }) {
  if (!items?.length) {
    return <p className="profile-page__muted">{emptyText}</p>;
  }
  return (
    <ul className="profile-page-activity">
      {items.map((item) => (
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
  );
}

export function ProfilePickHistory({ rows, emptyText = 'Todavía no hay predicciones registradas.' }) {
  const now = useKickoffClock();
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    return <p className="profile-page__muted">{emptyText}</p>;
  }
  return (
    <div
      className="predictions-history-scroll"
      role="region"
      aria-label="Historial de predicciones"
      tabIndex={0}
    >
      <div className="profile-page-history predictions-history-list">
        <div className="profile-page-history__head" aria-hidden>
          <span>Partido</span>
          <span>Pick</span>
          <span>Final</span>
          <span>Pts</span>
          <span>Estado</span>
        </div>
        {list.map((row) => {
          const revealed = isHistoryRowRevealed(row, now);
          const showResult = Boolean(row.hasResult);
          const statusClass = revealed || showResult ? row.statusClass : 'locked';
          return (
            <div
              key={row.matchId}
              className={`profile-page-history__row profile-page-history__row--${statusClass}`}
            >
              <span className="profile-page-history__match">
                <span className="profile-page-history__match-label">{row.matchLabel}</span>
                {row.kickoffLabel ? (
                  <span className="profile-page-history__match-date">{row.kickoffLabel}</span>
                ) : null}
              </span>
              {revealed ? (
                <span className="profile-page-history__mono">{row.prediction}</span>
              ) : (
                <span className="profile-page-history__pick-hidden">
                  <span className="profile-page-history__pick-hidden-title">Predicción enviada</span>
                  <span className="profile-page-history__pick-hidden-hint">
                    🔒 Oculta hasta el inicio del partido
                  </span>
                </span>
              )}
              <span className="profile-page-history__mono">
                {showResult ? row.finalResult : '—'}
              </span>
              <span className="profile-page-history__pts">
                {showResult && row.points != null ? row.points : '—'}
              </span>
              <span className={`profile-page-history__status profile-page-history__status--${statusClass}`}>
                {revealed || showResult ? row.status : row.matchStatus ?? 'Próximo'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { ProfilePageCard };
