import { useMemo } from 'react';
import { useRankingMovement } from '../hooks/useRankingMovement';
import { groupRankedRowsByPosition } from '../lib/rankingGroups';
import { RankingGroupList, movementBadgeLabel } from './RankingGroupBubble';

export default function RankingMovement({
  session,
  className = '',
  compact = false,
  maxRest = null,
  onViewFull = null,
  showYouHint = true,
  onSelectUser,
}) {
  const { rows, loading, tablesMissing, jornadaLabel, profileSummary, movementActive } =
    useRankingMovement(session);

  const groups = useMemo(() => groupRankedRowsByPosition(rows), [rows]);
  const restLimit = compact ? (maxRest ?? 5) : null;
  const hasMore = compact && onViewFull && restLimit != null && groups.length > 5 + restLimit;

  const isEmpty = !loading && groups.length === 0;

  return (
    <article
      className={[
        'phone',
        'phone--rank-movement',
        compact ? 'phone--rank-movement--compact' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-labelledby="ranking-movimiento-title"
    >
      <div className="phone-header phone-header--center phone-header--rank-mov">
        <span id="ranking-movimiento-title">
          {movementActive ? 'Ranking en movimiento' : 'Participantes'}
        </span>
      </div>

      {tablesMissing ? (
        <p className="rm-setup-hint">
          Ejecuta <code>supabase/ranking_history.sql</code> en Supabase para guardar jornadas y
          movimiento ↑↓.
        </p>
      ) : null}

      {movementActive && jornadaLabel ? (
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
          <RankingGroupList
            groups={groups}
            featuredCount={5}
            restLimit={restLimit}
            showMovement={movementActive}
            showBars={movementActive}
            onSelectUser={onSelectUser}
            currentUserId={session?.user?.id}
            restHeadLabel={compact ? 'RESTO DEL RANKING' : 'Resto del ranking'}
          />

          {hasMore ? (
            <button type="button" className="rm-view-full" onClick={onViewFull}>
              Ver ranking completo
            </button>
          ) : null}
        </>
      )}

      {showYouHint && movementActive && profileSummary && session?.user?.id ? (
        <p className="rm-you-hint" aria-live="polite">
          Tu puesto: #{profileSummary.currentRank ?? '—'}
          {profileSummary.movement?.direction !== 'none'
            ? ` · ${movementBadgeLabel(profileSummary.movement)}`
            : ''}
        </p>
      ) : null}
    </article>
  );
}
