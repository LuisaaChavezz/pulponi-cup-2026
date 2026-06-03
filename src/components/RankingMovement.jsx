import { useMemo } from 'react';
import { formatMovementLine, selectDisplayName } from '../lib/rankingHistory';
import { useRankingMovement } from '../hooks/useRankingMovement';
import UserAvatar from './UserAvatar';

const TOP_EMOJIS = ['🐙🏆', '🧠', '👑', '🔥', '⚡'];

function MovementBadge({ movement }) {
  if (!movement) return null;
  const dir = movement.direction;
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
    <span className={cls} title={movement.lineLabel}>
      {movement.lineLabel}
    </span>
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
              const prevRank = r.previousRank;
              return (
                <div
                  key={r.id}
                  role="listitem"
                  className={`rm-top-card rm-top-card--${rank} ${r.movement?.direction === 'up' ? 'rm-top-card--up' : ''} ${r.movement?.direction === 'down' ? 'rm-top-card--down' : ''}`}
                >
                  <div className="rm-top-card-inner">
                    <div className="rm-top-row">
                      <span className="rm-pos-emoji" aria-label={`Puesto ${rank}`}>
                        {TOP_EMOJIS[i] ?? '◆'}
                      </span>
                      <UserAvatar photoUrl={r.photo_url} className="rm-avatar avatar-frame--sm" alt="" />
                      <div className="rm-top-meta">
                        <span className="rm-username">{selectDisplayName(r)}</span>
                        <div className="rm-rank-positions">
                          <span className="rm-rank-now">#{rank}</span>
                          {prevRank != null ? (
                            <span className="rm-rank-was">antes #{prevRank}</span>
                          ) : null}
                        </div>
                        <div className="rm-points-line">
                          <strong>{r.points}</strong>
                          <span className="rm-pts-label">pts</span>
                        </div>
                        <MovementBadge movement={r.movement} />
                        <p className="rm-movement-line">{formatMovementLine(r, r.movement)}</p>
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
                      <span className="rm-rest-pos">{pos}</span>
                      <UserAvatar photoUrl={r.photo_url} className="rm-rest-avatar avatar-frame--xs" alt="" />
                      <div className="rm-rest-main">
                        <span className="rm-rest-name">{selectDisplayName(r)}</span>
                        <div className="rm-rest-sub">
                          <span>
                            #{pos}
                            {r.previousRank != null ? ` · antes #${r.previousRank}` : ''}
                          </span>
                          <span className="rm-rest-dot">·</span>
                          <span>{r.points} pts</span>
                          <span className="rm-rest-dot">·</span>
                          <span>{r.exacts} exactos</span>
                        </div>
                        <MovementBadge movement={r.movement} />
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
          Tu puesto: #{profileSummary.currentRank ?? '—'} · {profileSummary.movement?.lineLabel}
        </p>
      ) : null}
    </article>
  );
}
