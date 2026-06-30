import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, FileDown } from 'lucide-react';
import { useUserSummaryPdf } from '../hooks/useUserSummaryPdf';

const RESULT_META = {
  exact: { icon: '⭐', label: 'Exacto', className: 'exact' },
  winner: { icon: '✅', label: 'Ganador', className: 'winner' },
  miss: { icon: '❌', label: 'Fallo', className: 'miss' },
};

function resultMetaForRow(row) {
  return RESULT_META[row.statusClass] ?? null;
}

function isPlayedRow(row) {
  return Boolean(row?.hasScoring || row?.hasResult);
}

function SummaryCard({ icon, value, label, accent = false }) {
  return (
    <div className={`profile-stats-card${accent ? ' profile-stats-card--accent' : ''}`}>
      <span className="profile-stats-card__icon" aria-hidden>
        {icon}
      </span>
      <b className="profile-stats-card__value">{value}</b>
      <span className="profile-stats-card__label">{label}</span>
    </div>
  );
}

export default function ProfileStatsPanel({
  stats = {},
  pickHistory = [],
  currentStreak = 0,
  badgesCount = 0,
  userId,
}) {
  const [expanded, setExpanded] = useState(false);
  const { downloadUserSummaryPdf, loading, error } = useUserSummaryPdf();

  const playedRows = useMemo(
    () => (Array.isArray(pickHistory) ? pickHistory.filter(isPlayedRow) : []),
    [pickHistory]
  );

  const totals = useMemo(() => {
    let exacts = 0;
    let winners = 0;
    let misses = 0;
    for (const row of playedRows) {
      if (row.statusClass === 'exact') exacts += 1;
      else if (row.statusClass === 'winner') winners += 1;
      else if (row.statusClass === 'miss') misses += 1;
    }
    return { exacts, winners, misses };
  }, [playedRows]);

  const points = stats?.points ?? 0;
  const exacts = stats?.exacts ?? totals.exacts;
  const pulpoIndex = stats?.pulpoIndex ?? 0;
  const accumulatedStreak = stats?.accumulatedStreak ?? 0;

  return (
    <div className="profile-stats-panel">
      <div className="profile-stats-grid-cards">
        <SummaryCard icon="🏆" value={points} label="Puntos totales" accent />
        <SummaryCard icon="⭐" value={exacts} label="Exactos" />
        <SummaryCard icon="✅" value={totals.winners} label="Ganadores" />
        <SummaryCard icon="🔥" value={currentStreak} label="Racha actual" />
        <SummaryCard icon="📈" value={accumulatedStreak} label="Racha acumulada" />
        <SummaryCard icon="🐙" value={pulpoIndex} label="Índice Pulpo" />
        <SummaryCard icon="🏅" value={badgesCount} label="Badges" />
        <SummaryCard icon="🎯" value={playedRows.length} label="Partidos jugados" />
      </div>

      <button
        type="button"
        className="profile-stats-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        {expanded
          ? 'Ocultar detalle de partidos'
          : `Ver detalle de partidos (${playedRows.length})`}
      </button>

      {expanded ? (
        playedRows.length === 0 ? (
          <p className="profile-page__muted">Todavía no hay partidos jugados.</p>
        ) : (
          <div className="profile-stats-table-scroll" role="region" aria-label="Detalle de partidos" tabIndex={0}>
            <table className="profile-stats-table">
              <thead>
                <tr>
                  <th>Partido</th>
                  <th>Final</th>
                  <th>Predicción</th>
                  <th>Resultado</th>
                  <th>Pts</th>
                </tr>
              </thead>
              <tbody>
                {playedRows.map((row) => {
                  const meta = resultMetaForRow(row);
                  const showPenalty = row.isKnockout && (row.penaltyPrediction || row.wentToPenalties);
                  return (
                    <Fragment key={row.matchId}>
                      <tr
                        className={`profile-stats-row${meta ? ` profile-stats-row--${meta.className}` : ''}`}
                      >
                        <td className="profile-stats-table__match">
                          <span>{row.matchLabel}</span>
                          {row.kickoffLabel ? (
                            <small>{row.kickoffLabel}</small>
                          ) : null}
                        </td>
                        <td className="profile-stats-table__mono">{row.finalResult}</td>
                        <td className="profile-stats-table__mono">{row.prediction}</td>
                        <td>
                          {meta ? (
                            <span className={`profile-stats-result profile-stats-result--${meta.className}`}>
                              {meta.icon} {meta.label}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="profile-stats-table__pts">{row.points ?? '—'}</td>
                      </tr>
                      {showPenalty ? (
                        <tr className="profile-stats-row profile-stats-row--penalty">
                          <td colSpan={5} className="profile-stats-table__penalty">
                            <span className="profile-stats-table__penalty-tag">🥅 Penales</span>
                            {row.wentToPenalties ? (
                              <>
                                <span>
                                  <b>{row.penaltyResultLabel ?? '—'}</b>
                                  {row.penaltyWinner ? (
                                    <span className="profile-stats-table__penalty-advance">
                                      {' '}
                                      ({row.penaltyWinner} avanza)
                                    </span>
                                  ) : null}
                                </span>
                                <span>
                                  Tu pick: <b>{row.penaltyPrediction ?? '—'}</b>
                                </span>
                                <span
                                  className={`profile-stats-result profile-stats-result--${
                                    row.penaltyWinnerHit ? 'winner' : 'miss'
                                  }`}
                                >
                                  {row.penaltyWinnerHit
                                    ? `✅ Ganador +1pt${row.penaltyExactHit ? ' · 🎯 marcador +1pt' : ''}`
                                    : '❌ Falló ganador'}
                                </span>
                                <span className="profile-stats-table__penalty-total">
                                  Total: <b>{row.points ?? 0} pts</b>
                                </span>
                              </>
                            ) : (
                              <>
                                <span>
                                  Tu pick: <b>{row.penaltyPrediction ?? '—'}</b>
                                </span>
                                <span className="profile-page__muted">No fue a penales</span>
                              </>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      <div className="profile-stats-download">
        <button
          type="button"
          className="primary profile-summary-btn"
          onClick={() => downloadUserSummaryPdf(userId)}
          disabled={loading || !userId}
        >
          <FileDown size={15} />
          {loading ? 'Generando…' : 'Descargar mi resumen completo'}
        </button>
        {error ? <p className="profile-page__summary-error">{error}</p> : null}
      </div>
    </div>
  );
}
