import { useCallback, useMemo, useState } from 'react';
import TeamLogo from '../components/TeamLogo';
import { displayTeamName, formatMatchDateShort, formatMatchTime } from '../lib/matchUtils';
import { useMobileViewport } from '../hooks/useMobileViewport';
import { useParlayOdds } from '../hooks/useParlayOdds';
import {
  PARLAY_MIN_SELECTIONS,
  PARLAY_MAX_SELECTIONS,
  PARLAY_MIN_STAKE,
  PARLAY_MIN_STAKE_MESSAGE,
  calculateVirtualParlayPayout,
  formatAmericanOdd,
  isParlayStakeValid,
  multiplySelectionOdds,
  resolveParlayStake,
} from '../lib/parlayCalculator';
import { getOutcomeOdds } from '../lib/parlayOdds';
import { createParlayId, loadUserParlays, saveUserParlay } from '../lib/parlayStorage';
import { exportParlayPdf } from '../lib/exportParlayPdf';

const PDF_ERROR_MSG = 'No se pudo generar el PDF.';
const PARLAY_COMPLETE_MSG = 'Ya completaste las selecciones de tu combinada.';
const PARLAY_COMPLETE_SUCCESS_MSG = 'Combinada completa ✅';
const PARLAY_COMPLETE_PROMPT = '¿Quieres guardar o descargar tu combinada?';
const PARLAY_REDUCE_MSG = 'Reduce tus selecciones para continuar.';
const PARLAY_TARGET_OPTIONS = Array.from(
  { length: PARLAY_MAX_SELECTIONS - PARLAY_MIN_SELECTIONS + 1 },
  (_, index) => PARLAY_MIN_SELECTIONS + index
);

const OUTCOMES = ['home', 'draw', 'away'];

function selectionKey(matchId, outcome) {
  return `${matchId}:${outcome}`;
}

function formatKickoff(kickoff) {
  const date = formatMatchDateShort(kickoff);
  const time = formatMatchTime(kickoff);
  if (date && time) return `${date} • ${time}`;
  return date || time || '';
}

function outcomePickLabel(outcome, homeLabel, awayLabel) {
  if (outcome === 'home') return `${homeLabel} gana`;
  if (outcome === 'away') return `${awayLabel} gana`;
  return 'Empate';
}

export default function ParlayPage({ matches = [], userId, username = '', communityProfiles = [] }) {
  const isMobileParlayFlow = useMobileViewport(767);
  const oddsState = useParlayOdds(matches, communityProfiles);
  const [selections, setSelections] = useState([]);
  const [targetSelectionCount, setTargetSelectionCount] = useState(PARLAY_MIN_SELECTIONS);
  const [stakeInput, setStakeInput] = useState(String(PARLAY_MIN_STAKE));
  const [savedParlays, setSavedParlays] = useState(() => (userId ? loadUserParlays(userId) : []));
  const [saveMsg, setSaveMsg] = useState('');
  const [pdfError, setPdfError] = useState('');
  const [flowMsg, setFlowMsg] = useState('');

  const effectiveStake = useMemo(() => resolveParlayStake(stakeInput), [stakeInput]);
  const stakeError = isParlayStakeValid(stakeInput) ? '' : PARLAY_MIN_STAKE_MESSAGE;

  const totalOdds = useMemo(() => multiplySelectionOdds(selections), [selections]);
  const payout = useMemo(() => calculateVirtualParlayPayout(effectiveStake, totalOdds), [effectiveStake, totalOdds]);

  const needsReduceSelections = selections.length > targetSelectionCount;
  const isParlayComplete = selections.length === targetSelectionCount && !needsReduceSelections;

  const canSubmit = isParlayComplete && isParlayStakeValid(stakeInput);
  const canExportPdf = isParlayComplete;
  const selectionCountLabel = `Selecciones: ${selections.length} / ${targetSelectionCount}`;

  const handleTargetSelectionCountChange = useCallback(
    (event) => {
      const next = Number(event.target.value);
      if (!Number.isFinite(next)) return;
      const clamped = Math.min(PARLAY_MAX_SELECTIONS, Math.max(PARLAY_MIN_SELECTIONS, Math.round(next)));
      setTargetSelectionCount(clamped);
      if (clamped < selections.length) {
        setFlowMsg(PARLAY_REDUCE_MSG);
      } else {
        setFlowMsg('');
      }
      setSaveMsg('');
      setPdfError('');
    },
    [selections.length]
  );

  const toggleSelection = useCallback(
    (match, outcome, pickLabel) => {
      const oddsRow = oddsState.byMatchId[String(match.id)];
      const decimalOdds = getOutcomeOdds(oddsRow, outcome);
      if (!decimalOdds) return;

      const key = selectionKey(match.id, outcome);
      const matchId = String(match.id);
      const existing = selections.find((s) => s.key === key);

      if (existing) {
        setSelections((prev) => prev.filter((s) => s.key !== key));
        setFlowMsg('');
        setSaveMsg('');
        setPdfError('');
        return;
      }

      const hasMatchSelection = selections.some((s) => s.matchId === matchId);
      if (!hasMatchSelection && selections.length >= targetSelectionCount) {
        setFlowMsg(PARLAY_COMPLETE_MSG);
        return;
      }

      setSelections((prev) => {
        const withoutSameMatch = prev.filter((s) => s.matchId !== matchId);
        if (!hasMatchSelection && withoutSameMatch.length >= targetSelectionCount) {
          return prev;
        }

        return [
          ...withoutSameMatch,
          {
            key,
            matchId,
            homeTeam: match.home_team,
            awayTeam: match.away_team,
            outcome,
            outcomeLabel: pickLabel,
            decimalOdds,
          },
        ];
      });
      setFlowMsg('');
      setSaveMsg('');
      setPdfError('');
    },
    [oddsState.byMatchId, selections, targetSelectionCount]
  );

  const handleExportPdf = useCallback(() => {
    if (!canExportPdf) return;
    setPdfError('');
    try {
      exportParlayPdf({
        username,
        selections,
        stake: payout.stake,
        totalOdds,
        grossGain: payout.grossGain,
      });
    } catch (error) {
      console.error('[exportParlayPdf]', error);
      setPdfError(PDF_ERROR_MSG);
    }
  }, [canExportPdf, username, selections, payout.stake, payout.grossGain, totalOdds]);

  const removeSelection = useCallback((key) => {
    setSelections((prev) => prev.filter((s) => s.key !== key));
    setSaveMsg('');
    setPdfError('');
    setFlowMsg('');
  }, []);

  const clearSelections = useCallback(() => {
    setSelections([]);
    setSaveMsg('');
    setPdfError('');
    setFlowMsg('');
  }, []);

  const handleSaveParlay = useCallback(() => {
    if (!userId) return;
    if (!isParlayStakeValid(stakeInput)) {
      setSaveMsg(PARLAY_MIN_STAKE_MESSAGE);
      return;
    }
    if (!canSubmit) return;
    const parlay = {
      id: createParlayId(),
      createdAt: new Date().toISOString(),
      selections,
      stake: payout.stake,
      totalOdds: payout.totalOdds,
      possibleGain: payout.grossGain,
      estimatedReturn: payout.estimatedReturn,
      oddsMode: oddsState.mode,
      status: 'pending',
    };
    const rows = saveUserParlay(userId, parlay);
    setSavedParlays(rows);
    setSaveMsg('Parlay guardado.');
    setSelections([]);
    setFlowMsg('');
  }, [userId, canSubmit, selections, payout, oddsState.mode, stakeInput]);

  const targetSetup = (
    <div className="parlay-page__target-setup pulponi-card">
      <label className="parlay-page__target-label">
        <span>¿Cuántas selecciones tendrá tu combinada?</span>
        <select
          className="parlay-page__target-select"
          value={targetSelectionCount}
          onChange={handleTargetSelectionCountChange}
          aria-label="Cantidad de selecciones de la combinada"
        >
          {PARLAY_TARGET_OPTIONS.map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>
      </label>
      <p className={`parlay-page__target-progress${isParlayComplete ? ' is-complete' : ''}`}>
        {selectionCountLabel}
      </p>
      {isParlayComplete ? (
        <p className="parlay-page__complete-msg">{PARLAY_COMPLETE_SUCCESS_MSG}</p>
      ) : null}
      {flowMsg ? <p className="parlay-page__flow-msg">{flowMsg}</p> : null}
      {needsReduceSelections && flowMsg !== PARLAY_REDUCE_MSG ? (
        <p className="parlay-page__flow-msg parlay-page__flow-msg--warn">{PARLAY_REDUCE_MSG}</p>
      ) : null}
    </div>
  );

  return (
    <div className="parlay-page">
      <div className="section-title parlay-page__head">
        <div>
          <span className="eyebrow">Combinadas</span>
          <h2>PARLAY</h2>
          <p className="section-lead muted">
            Elige cuántas selecciones tendrá tu combinada ({PARLAY_MIN_SELECTIONS}–{PARLAY_MAX_SELECTIONS}).
          </p>
        </div>
      </div>

      {isMobileParlayFlow ? targetSetup : null}

      <div className="parlay-page__layout">
        <div className="parlay-page__matches">
          {!isMobileParlayFlow ? targetSetup : null}
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
                const matchHasSelection = selections.some((s) => s.matchId === String(match.id));

                return (
                  <article
                    key={match.id}
                    className={`parlay-match-card${isParlayComplete && !matchHasSelection ? ' parlay-match-card--locked' : ''}`}
                  >
                    {kickoffLabel ? (
                      <time className="parlay-match-card__kickoff" dateTime={match.kickoff}>
                        {kickoffLabel}
                      </time>
                    ) : null}

                    <div className="parlay-match-card__matchup">
                      <div className="parlay-match-card__team parlay-match-card__team--home">
                        <TeamLogo
                          logo={match.home_logo}
                          flag={match.home_flag}
                          alt={match.home_team ?? ''}
                          size="sm"
                        />
                        <span className="parlay-match-card__team-name">{homeLabel}</span>
                      </div>

                      <span className="parlay-match-card__vs" aria-hidden>
                        VS
                      </span>

                      <div className="parlay-match-card__team parlay-match-card__team--away">
                        <span className="parlay-match-card__team-name">{awayLabel}</span>
                        <TeamLogo
                          logo={match.away_logo}
                          flag={match.away_flag}
                          alt={match.away_team ?? ''}
                          size="sm"
                        />
                      </div>
                    </div>

                    <p className="parlay-match-card__hint">
                      {isParlayComplete && !matchHasSelection ? 'Combinada completa' : 'Selecciona un resultado'}
                    </p>

                    <div className="parlay-match-card__picks">
                      {OUTCOMES.map((outcome) => {
                        const odd = getOutcomeOdds(oddsRow, outcome);
                        const key = selectionKey(match.id, outcome);
                        const active = selections.some((s) => s.key === key);
                        const pickLabel = outcomePickLabel(outcome, homeLabel, awayLabel);
                        const american = formatAmericanOdd(odd);
                        const isFavorite = american.startsWith('-');
                        const pickDisabled = isParlayComplete && !active;

                        return (
                          <button
                            key={key}
                            type="button"
                            className={`parlay-pick-btn${active ? ' is-active' : ''}${pickDisabled ? ' is-locked' : ''}`}
                            disabled={pickDisabled}
                            onClick={() => toggleSelection(match, outcome, pickLabel)}
                            aria-pressed={active}
                            aria-disabled={pickDisabled}
                          >
                            <span className="parlay-pick-btn__label">{pickLabel}</span>
                            <span className="parlay-pick-btn__meta">
                              <span
                                className={`parlay-pick-btn__odd${isFavorite ? ' parlay-pick-btn__odd--favorite' : ''}`}
                              >
                                {american}
                              </span>
                              {active ? (
                                <span className="parlay-pick-btn__check" aria-hidden>
                                  ✓
                                </span>
                              ) : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <aside className="parlay-page__slip pulponi-card">
          <div className="parlay-page__slip-head">
            <h3>Combinada</h3>
            <span className={`parlay-page__count${isParlayComplete ? ' is-ok' : ''}`}>{selectionCountLabel}</span>
          </div>

          {selections.length === 0 ? (
            <p className="muted parlay-page__empty-slip">
              Elige {targetSelectionCount} resultados para tu combinada.
            </p>
          ) : (
            <ul className="parlay-page__selections">
              {selections.map((sel) => (
                <li key={sel.key} className="parlay-page__selection">
                  <div>
                    <strong>{sel.outcomeLabel}</strong>
                    <span className="parlay-page__selection-odd">{formatAmericanOdd(sel.decimalOdds)}</span>
                    <span className="muted">
                      {displayTeamName(sel.homeTeam)} vs {displayTeamName(sel.awayTeam)}
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
            <span>Monto virtual (mín. {PARLAY_MIN_STAKE})</span>
            <input
              type="number"
              min={PARLAY_MIN_STAKE}
              step="1"
              value={stakeInput}
              onChange={(e) => {
                const next = e.target.value;
                if (next === '') {
                  setStakeInput('');
                  setSaveMsg('');
                  return;
                }
                const n = Math.round(Number(next));
                setStakeInput(Number.isFinite(n) ? String(Math.max(0, n)) : '');
                setSaveMsg('');
              }}
              onBlur={() => {
                if (stakeInput === '') setStakeInput(String(PARLAY_MIN_STAKE));
              }}
            />
          </label>
          {stakeError ? <p className="parlay-page__stake-error">{stakeError}</p> : null}

          <dl className="parlay-page__calc">
            <div>
              <dt>Monto</dt>
              <dd>{payout.stake.toFixed(0)} pts</dd>
            </div>
            <div>
              <dt>Momio total</dt>
              <dd>{formatAmericanOdd(totalOdds)}</dd>
            </div>
            <div className="parlay-page__calc-total">
              <dt>Posible ganancia</dt>
              <dd>{payout.grossGain.toFixed(0)} pts</dd>
            </div>
          </dl>

          <div className="parlay-page__actions">
            {isParlayComplete ? (
              <>
                <p className="parlay-page__complete-prompt">{PARLAY_COMPLETE_PROMPT}</p>
                <button type="button" className="primary full" disabled={!canSubmit} onClick={handleSaveParlay}>
                  Guardar combinada
                </button>
                <button
                  type="button"
                  className="parlay-page__export-btn full"
                  disabled={!canExportPdf}
                  onClick={handleExportPdf}
                >
                  Descargar parlay en PDF
                </button>
              </>
            ) : null}
            {pdfError ? <p className="parlay-page__export-error">{pdfError}</p> : null}
            {selections.length > 0 ? (
              <button type="button" onClick={clearSelections}>
                Limpiar
              </button>
            ) : null}
          </div>

          {saveMsg ? (
            <p
              className={`parlay-page__save-msg${saveMsg === PARLAY_MIN_STAKE_MESSAGE ? ' parlay-page__save-msg--error' : ''}`}
            >
              {saveMsg}
            </p>
          ) : null}

          {savedParlays.length > 0 ? (
            <div className="parlay-page__saved">
              <h4>Recientes</h4>
              <ul>
                {savedParlays.slice(0, 5).map((p) => (
                  <li key={p.id}>
                    <span>
                      {p.selections.length} picks · {formatAmericanOdd(p.totalOdds)} ·{' '}
                      {(p.possibleGain ?? Math.max(0, (p.estimatedReturn ?? 0) - (p.stake ?? 0))).toFixed(0)} pts
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
