import { useMemo } from 'react';
import { selectDisplayName } from '../lib/rankingHistory';
import { useRankingMovement } from '../hooks/useRankingMovement';
import UserAvatar from './UserAvatar';

const TOP_EMOJIS = ['🐙🏆', '🧠', '👑', '🔥', '⚡'];

/** Etiqueta de la burbuja de movimiento (solo UI). */
function movementBadgeLabel(movement) {
  if (!movement) return '';
  const n = movement.delta ?? 0;
  const posWord = n === 1 ? 'posición' : 'posiciones';
  switch (movement.direction) {
    case 'new':
      return '↑ Nuevo en el ranking';
    case 'up':
      return `↑ Subió ${n} ${posWord}`;
    case 'down':
      return `↓ Bajó ${n} ${posWord}`;
    case 'same':
      return '→ Se mantiene';
    default:
      return movement.lineLabel ?? '';
  }
}

function MovementBadge({ movement }) {
  if (!movement) return null;
  const dir = movement.direction;
  const label = movementBadgeLabel(movement);
  const cls = [
    'rm-movement',
    dir === 'up' ? 'rm-movement--up' : '',
    dir === 'down' ? 'rm-movement--down' : '',
    dir === 'same' ? 'rm-movement--same' : '',
    dir === 'new' ? 'rm-movement--new' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={cls} title={label}>
      {label}
    </span>
  );
}

function RankStats({ points, exacts }) {
  const pts = Number(points ?? 0);
  const ex = Number(exacts ?? 0);
  return (
    <p className="rm-stats-line">
      <span className="rm-stat">
        {pts} PTS
      </span>
      <span className="rm-stat-sep" aria-hidden>
        {' '}
        •{' '}
      </span>
      <span className="rm-stat">
        {ex} exactos
      </span>
    </p>
  );
}

export default function RankingMovement({ session, className = '' }) {
  const { top5, rest, loading, tablesMissing, jornadaLabel, profileSummary } =
    useRankingMovement(session);

  const maxTop5 = useMemo(() => {
    const m = Math.max(1, ...top5.map((r) => r.points));
    return m;
  }, [top5]);

  const isEmpty = !loading && top5.length === 0 && rest.length === 0;

  return (
    <article
      className={['phone', 'phone--rank-movement', className].filter(Boolean).join(' ')}
      aria-labelledby="ranking-movimiento-title"
    >
      <div className="phone-header phone-header--center phone-header--rank-mov">
        <span id="ranking-movimiento-title">Ranking en movimiento</span>
      </div>

      {tablesMissing ? (
        <p className="rm-setup-hint">
          Ejecuta <code>supabase/ranking_history.sql</code> en Supabase para guardar jornadas y
          movimiento ↑↓.
        </p>
      ) : null}

      {jornadaLabel ? (
        <p className="rm-jornada-ref">Comparado vs {jornadaLabel}</p>
      ) : null}

      {loading ? (
        <div className="rm-loading">
          <span className="rm-loading-pulse" />
          <p className="rm-muted">Sincronizando quiniela…</p>
        </div>
      ) : isEmpty ? (
        <div className="rm-empty">
          <p>El ranking todavía está vacío.</p>
        </div>
      ) : (
        <>
          <div className="rm-top5-graph" role="list">
            {top5.map((r, i) => {
              const rank = r.currentRank ?? i + 1;
              const barPct = Math.min(100, (r.points / maxTop5) * 100);
              return (
                <div
                  key={r.id}
                  role="listitem"
                  className={`rm-top-card rm-top-card--${rank} ${r.movement?.direction === 'up' ? 'rm-top-card--up' : ''} ${r.movement?.direction === 'down' ? 'rm-top-card--down' : ''}`}
                >
                  <div className="rm-top-card-inner">
                    <div className="rm-top-row">
                      <span className="rm-pos-emoji" aria-hidden>
                        {TOP_EMOJIS[i] ?? '◆'}
                      </span>
                      <UserAvatar photoUrl={r.photo_url} className="rm-avatar avatar-frame--sm" alt="" />
                      <div className="rm-top-body">
                        <div className="rm-top-line">
                          <h3 className="rm-top-title">
                            <span className="rm-rank-num">#{rank}</span>{' '}
                            <span className="rm-rank-name">{selectDisplayName(r)}</span>
                          </h3>
                          <MovementBadge movement={r.movement} />
                        </div>
                        <RankStats points={r.points} exacts={r.exacts} />
                      </div>
                    </div>
                    <div className="rm-bar-wrap" aria-hidden>
                      <div className="rm-bar-track">
                        <div className="rm-bar-fill" style={{ width: `${barPct}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {rest.length > 0 ? (
            <div className="rm-rest">
              <p className="rm-rest-head">Resto del ranking</p>
              <ol className="rm-rest-list">
                {rest.map((r) => {
                  const pos = r.currentRank;
                  return (
                    <li
                      key={r.id}
                      className={`rm-rest-row rm-rest-row--${r.movement?.direction ?? 'same'}`}
                    >
                      <UserAvatar photoUrl={r.photo_url} className="rm-rest-avatar avatar-frame--xs" alt="" />
                      <div className="rm-rest-body">
                        <div className="rm-rest-line">
                          <span className="rm-rest-title">
                            <span className="rm-rank-num">#{pos}</span>{' '}
                            <span className="rm-rank-name">{selectDisplayName(r)}</span>
                          </span>
                          <MovementBadge movement={r.movement} />
                        </div>
                        <RankStats points={r.points} exacts={r.exacts} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : null}
        </>
      )}

      {profileSummary && session?.user?.id ? (
        <p className="rm-you-hint" aria-live="polite">
          Tu puesto: #{profileSummary.currentRank ?? '—'} · {movementBadgeLabel(profileSummary.movement)}
        </p>
      ) : null}
    </article>
  );
}
