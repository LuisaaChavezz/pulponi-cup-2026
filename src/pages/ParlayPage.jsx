import { useCallback, useMemo, useState } from 'react';
import TeamLogo from '../components/TeamLogo';
import { displayTeamName, formatMatchDateShort, formatMatchTime } from '../lib/matchUtils';
import { useParlayOdds } from '../hooks/useParlayOdds';
import {
  PARLAY_MIN_SELECTIONS,
  PARLAY_MAX_SELECTIONS,
  calculateVirtualParlayPayout,
  formatDecimalOdds,
  multiplySelectionOdds,
  parlaySelectionCountLabel,
} from '../lib/parlayCalculator';
import { getOutcomeOdds } from '../lib/parlayOdds';
import { createParlayId, loadUserParlays, saveUserParlay } from '../lib/parlayStorage';

const OUTCOMES = [
  { id: 'home', label: 'Gana local' },
  { id: 'draw', label: 'Empate' },
  { id: 'away', label: 'Gana visitante' },
];

function selectionKey(matchId, outcome) {
  return `${matchId}:${outcome}`;
}

function formatKickoff(kickoff) {
  const date = formatMatchDateShort(kickoff);
  const time = formatMatchTime(kickoff);
  if (date && time) return `${date} · ${time}`;
  return date || time || '';
}

export default function ParlayPage({ matches = [], userId }) {
  const oddsState = useParlayOdds(matches);
  const [selections, setSelections] = useState([]);
  const [stake, setStake] = useState(100);
  const [savedParlays, setSavedParlays] = useState(() => (userId ? loadUserParlays(userId) : []));
  const [saveMsg, setSaveMsg] = useState('');

  const totalOdds = useMemo(() => multiplySelectionOdds(selections), [selections]);
  const payout = useMemo(() => calculateVirtualParlayPayout(stake, totalOdds), [stake, totalOdds]);

  const canSubmit =
    selections.length >= PARLAY_MIN_SELECTIONS &&
    selections.length <= PARLAY_MAX_SELECTIONS &&
    payout.stake > 0;

  const toggleSelection = useCallback(
    (match, outcome) => {
      const oddsRow = oddsState.byMatchId[String(match.id)];
      const decimalOdds = getOutcomeOdds(oddsRow, outcome);
      if (!decimalOdds) return;

      const key = selectionKey(match.id, outcome);
      setSelections((prev) => {
        const existing = prev.find((s) => s.key === key);
        if (existing) return prev.filter((s) => s.key !== key);

        const withoutSameMatch = prev.filter((s) => s.matchId !== String(match.id));
        if (withoutSameMatch.length >= PARLAY_MAX_SELECTIONS) return prev;

        return [
          ...withoutSameMatch,
          {
            key,
            matchId: String(match.id),
            homeTeam: match.home_team,
            awayTeam: match.away_team,
            outcome,
            outcomeLabel: OUTCOMES.find((o) => o.id === outcome)?.label ?? outcome,
            decimalOdds,
          },
        ];
      });
      setSaveMsg('');
    },
    [oddsState.byMatchId]
  );

  const removeSelection = useCallback((key) => {
    setSelections((prev) => prev.filter((s) => s.key !== key));
    setSaveMsg('');
  }, []);

  const clearSelections = useCallback(() => {
    setSelections([]);
    setSaveMsg('');
  }, []);

  const handleSaveParlay = useCallback(() => {
    if (!userId || !canSubmit) return;
    const parlay = {
      id: createParlayId(),
      createdAt: new Date().toISOString(),
      selections,
      stake: payout.stake,
      totalOdds: payout.totalOdds,
      possibleGain: payout.pulponiGain,
      oddsMode: oddsState.mode,
      status: 'pending',
    };
    const rows = saveUserParlay(userId, parlay);
    setSavedParlays(rows);
    setSaveMsg('Parlay guardado.');
    setSelections([]);
  }, [userId, canSubmit, selections, payout, oddsState.mode]);

  return (
    <div className="parlay-page">
      <div className="section-title parlay-page__head">
        <div>
          <span className="eyebrow">Combinadas</span>
          <h2>PARLAY</h2>
          <p className="section-lead muted">
            Arma tu combinada con al menos {PARLAY_MIN_SELECTIONS} selecciones.
          </p>
        </div>
      </div>

      <div className="parlay-page__layout">
        <div className="parlay-page__matches">
          {oddsState.loading ? (
            <p className="muted sync-footnote">Cargando partidos…</p>
          ) : oddsState.openMatches.length === 0 ? (
            <p className="muted sync-footnote">No hay partidos abiertos.</p>
          ) : (
            <div className="parlay-page__match-list">
              {oddsState.openMatches.map((match) => {
                const oddsRow = oddsState.byMatchId[String(match.id)];
                const homeLabel = displayTeamName(match.home_team) ?? 'Local';
                const awayLabel = displayTeamName(match.away_team) ?? 'Visitante';
                const kickoffLabel = formatKickoff(match.kickoff);
                const selectedForMatch = selections.find((s) => s.matchId === String(match.id));

                return (
                  <article key={match.id} className="parlay-match-card pulponi-card">
                    <div className="parlay-match-card__top">
                      <div className="parlay-match-card__teams">
                        <span className="parlay-match-card__team">
                          <TeamLogo logo={match.home_logo} flag={match.home_flag} alt={match.home_team ?? ''} size="sm" />
                          {homeLabel}
                        </span>
                        <span className="parlay-match-card__vs">vs</span>
                        <span className="parlay-match-card__team">
                          <TeamLogo logo={match.away_logo} flag={match.away_flag} alt={match.away_team ?? ''} size="sm" />
                          {awayLabel}
                        </span>
                      </div>
                      {kickoffLabel ? <time className="parlay-match-card__time">{kickoffLabel}</time> : null}
                    </div>

                    <div className="parlay-match-card__odds">
                      {OUTCOMES.map((o) => {
                        const odd = getOutcomeOdds(oddsRow, o.id);
                        const key = selectionKey(match.id, o.id);
                        const active = selections.some((s) => s.key === key);
                        return (
                          <button
                            key={key}
                            type="button"
                            className={`parlay-odd-btn${active ? ' is-active' : ''}`}
                            onClick={() => toggleSelection(match, o.id)}
                            aria-pressed={active}
                          >
                            <span className="parlay-odd-btn__label">{o.label}</span>
                            <span className="parlay-odd-btn__value">{formatDecimalOdds(odd)}</span>
                            <span className="parlay-odd-btn__action">{active ? 'Quitar' : 'Agregar'}</span>
                          </button>
                        );
                      })}
                    </div>

                    {selectedForMatch ? (
                      <p className="parlay-match-card__picked">
                        Selección: {selectedForMatch.outcomeLabel} · {formatDecimalOdds(selectedForMatch.decimalOdds)}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <aside className="parlay-page__slip pulponi-card">
          <div className="parlay-page__slip-head">
            <h3>Combinada</h3>
            <span className={`parlay-page__count${selections.length >= PARLAY_MIN_SELECTIONS ? ' is-ok' : ''}`}>
              {parlaySelectionCountLabel(selections.length)}
            </span>
          </div>

          {selections.length === 0 ? (
            <p className="muted parlay-page__empty-slip">
              Elige {PARLAY_MIN_SELECTIONS} a {PARLAY_MAX_SELECTIONS} resultados.
            </p>
          ) : (
            <ul className="parlay-page__selections">
              {selections.map((sel) => (
                <li key={sel.key} className="parlay-page__selection">
                  <div>
                    <strong>
                      {displayTeamName(sel.homeTeam)} vs {displayTeamName(sel.awayTeam)}
                    </strong>
                    <span className="muted">
                      {sel.outcomeLabel} · {formatDecimalOdds(sel.decimalOdds)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="parlay-page__remove"
                    onClick={() => removeSelection(sel.key)}
                    aria-label="Quitar selección"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <label className="parlay-page__stake">
            <span>Monto virtual</span>
            <input
              type="number"
              min="1"
              step="1"
              value={stake}
              onChange={(e) => setStake(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>

          <dl className="parlay-page__calc">
            <div>
              <dt>Momio total</dt>
              <dd>{formatDecimalOdds(totalOdds)}</dd>
            </div>
            <div className="parlay-page__calc-total">
              <dt>Posible ganancia</dt>
              <dd>{payout.pulponiGain.toFixed(1)} pts</dd>
            </div>
          </dl>

          <div className="parlay-page__actions">
            <button type="button" className="primary full" disabled={!canSubmit} onClick={handleSaveParlay}>
              Guardar combinada
            </button>
            {selections.length > 0 ? (
              <button type="button" onClick={clearSelections}>
                Limpiar
              </button>
            ) : null}
          </div>

          {saveMsg ? <p className="parlay-page__save-msg">{saveMsg}</p> : null}

          {savedParlays.length > 0 ? (
            <div className="parlay-page__saved">
              <h4>Recientes</h4>
              <ul>
                {savedParlays.slice(0, 5).map((p) => (
                  <li key={p.id}>
                    <span>
                      {p.selections.length} picks · {formatDecimalOdds(p.totalOdds)} ·{' '}
                      {(p.possibleGain ?? p.pulponiGain ?? 0).toFixed(1)} pts
                    </span>
                    <span className="muted">{new Date(p.createdAt).toLocaleString('es-MX')}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
