import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TeamLogo from '../components/TeamLogo';
import { displayTeamName, formatKickoff } from '../lib/matchUtils';
import { useParlayOdds } from '../hooks/useParlayOdds';
import {
  PARLAY_MIN_SELECTIONS,
  PARLAY_MAX_SELECTIONS,
  PARLAY_MIN_STAKE,
  PARLAY_MIN_STAKE_MESSAGE,
  PULPONI_GAIN_FACTOR,
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
const PARLAY_REDUCE_MSG = 'Reduce tus selecciones para continuar.';

function displayParlayPossibleGain({ pulponiGain, possibleGain, estimatedReturn, stake }) {
  if (pulponiGain != null) return pulponiGain;
  if (possibleGain != null) return possibleGain;
  const gross = Math.max(0, (Number(estimatedReturn) || 0) - (Number(stake) || 0));
  return gross * PULPONI_GAIN_FACTOR;
}

/** Opciones 5, 6, 7, … 25 (partidos por combinada) */
const PARLAY_COUNT_OPTIONS = Array.from(
  { length: PARLAY_MAX_SELECTIONS - PARLAY_MIN_SELECTIONS + 1 },
  (_, index) => PARLAY_MIN_SELECTIONS + index
);

const OUTCOMES = ['home', 'draw', 'away'];

function selectionKey(matchId, outcome) {
  return `${matchId}:${outcome}`;
}

function outcomePickLabel(outcome, homeLabel, awayLabel) {
  if (outcome === 'home') return `${homeLabel} gana`;
  if (outcome === 'away') return `${awayLabel} gana`;
  return 'Empate';
}

function ParlayHeader() {
  return (
    <div className="section-title parlay-page__head">
      <div>
        <span className="eyebrow">Combinadas</span>
        <h2>PARLAY</h2>
        <p className="section-lead muted">
          Arma tu combinada con entre {PARLAY_MIN_SELECTIONS} y {PARLAY_MAX_SELECTIONS} partidos.
        </p>
      </div>
    </div>
  );
}

function ParlaySelectionCount({
  targetSelectionCount,
  selectionsLength,
  formLocked,
  flowMsg,
  needsReduceSelections,
  onChange,
}) {
  return (
    <div className="parlay-page__target-setup pulponi-card">
      <label className="parlay-page__target-label">
        <span>¿Cuántos partidos tendrá tu combinada?</span>
        <select
          className="parlay-page__target-select"
          value={targetSelectionCount}
          onChange={onChange}
          disabled={formLocked}
          aria-label="Cantidad de partidos de la combinada"
        >
          {PARLAY_COUNT_OPTIONS.map((count) => (
            <option key={count} value={count} disabled={count < selectionsLength}>
              {count}
            </option>
          ))}
        </select>
      </label>
      {flowMsg ? <p className="parlay-page__flow-msg">{flowMsg}</p> : null}
      {needsReduceSelections && flowMsg !== PARLAY_REDUCE_MSG ? (
        <p className="parlay-page__flow-msg parlay-page__flow-msg--warn">{PARLAY_REDUCE_MSG}</p>
      ) : null}
    </div>
  );
}

function ParlaySlip({
  selections,
  isParlayComplete,
  progressLabel,
  incompleteMessage,
  stakeInput,
  stakeError,
  payout,
  totalOdds,
  canSubmit,
  canExportPdf,
  saveMsg,
  pdfError,
  savedParlays,
  onStakeChange,
  onStakeBlur,
  onRemoveSelection,
  onClearSelections,
  onSaveParlay,
  onExportPdf,
  onExportSavedPdf,
}) {
  return (
    <aside className="parlay-page__slip pulponi-card">
      <div className="parlay-page__slip-head">
        <h3>Combinada</h3>
        <span className={`parlay-page__count${isParlayComplete ? ' is-ok' : ''}`}>{progressLabel}</span>
      </div>

      {selections.length > 0 ? (
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
                onClick={() => onRemoveSelection(sel.key)}
                aria-label="Quitar selección"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {!isParlayComplete ? (
        <p className="muted parlay-page__empty-slip">{incompleteMessage}</p>
      ) : (
        <p className="parlay-page__complete-msg">{PARLAY_COMPLETE_SUCCESS_MSG}</p>
      )}

      <label className="parlay-page__stake">
        <span>Monto virtual (mín. {PARLAY_MIN_STAKE})</span>
        <input
          type="number"
          min={PARLAY_MIN_STAKE}
          step="1"
          value={stakeInput}
          onChange={onStakeChange}
          onBlur={onStakeBlur}
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
          <dd>{displayParlayPossibleGain(payout).toFixed(0)} pts</dd>
        </div>
      </dl>

      <div className="parlay-page__actions">
        {isParlayComplete ? (
          <>
            <button type="button" className="primary full" disabled={!canSubmit} onClick={onSaveParlay}>
              Guardar combinada
            </button>
            <button
              type="button"
              className="parlay-page__export-btn full"
              disabled={!canExportPdf}
              onClick={onExportPdf}
            >
              Descargar parlay en PDF
            </button>
          </>
        ) : null}
        {pdfError ? <p className="parlay-page__export-error">{pdfError}</p> : null}
        {selections.length > 0 ? (
          <button type="button" onClick={onClearSelections}>
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
              <li key={p.id} className="parlay-page__saved-item">
                <div className="parlay-page__saved-meta">
                  <span>
                    {p.selections.length} picks · {formatAmericanOdd(p.totalOdds)} ·{' '}
                    {displayParlayPossibleGain(p).toFixed(0)} pts
                  </span>
                  <span className="muted">{new Date(p.createdAt).toLocaleString('es-MX')}</span>
                </div>
                <button
                  type="button"
                  className="parlay-page__saved-pdf-btn"
                  onClick={() => onExportSavedPdf(p)}
                >
                  Descargar PDF
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}

function ParlayMatchesLoading() {
  return (
    <div className="parlay-page__matches parlay-page__matches--loading" role="status" aria-live="polite">
      <span className="parlay-page__spinner" aria-hidden />
      <p className="muted sync-footnote">Cargando partidos…</p>
    </div>
  );
}

const ParlayMatchCard = memo(function ParlayMatchCard({
  match,
  oddsRow,
  selectedKey,
  formLocked,
  onToggleSelection,
}) {
  const homeLabel = displayTeamName(match.home_team) ?? 'Local';
  const awayLabel = displayTeamName(match.away_team) ?? 'Visitante';
  const kickoffLabel = formatKickoff(match.kickoff);
  const matchHasSelection = Boolean(selectedKey);

  return (
    <article
      className={`parlay-match-card${
        formLocked && !matchHasSelection ? ' parlay-match-card--locked' : ''
      }`}
    >
      {kickoffLabel ? (
        <time className="parlay-match-card__kickoff" dateTime={match.kickoff}>
          {kickoffLabel}
        </time>
      ) : null}

      <div className="parlay-match-card__matchup">
        <div className="parlay-match-card__team parlay-match-card__team--home">
          <TeamLogo logo={match.home_logo} flag={match.home_flag} alt={match.home_team ?? ''} size="sm" />
          <span className="parlay-match-card__team-name">{homeLabel}</span>
        </div>

        <span className="parlay-match-card__vs" aria-hidden>
          VS
        </span>

        <div className="parlay-match-card__team parlay-match-card__team--away">
          <span className="parlay-match-card__team-name">{awayLabel}</span>
          <TeamLogo logo={match.away_logo} flag={match.away_flag} alt={match.away_team ?? ''} size="sm" />
        </div>
      </div>

      <p className="parlay-match-card__hint">
        {formLocked && !matchHasSelection ? PARLAY_COMPLETE_SUCCESS_MSG : 'Selecciona un resultado'}
      </p>

      <div className="parlay-match-card__picks">
        {OUTCOMES.map((outcome) => {
          const odd = getOutcomeOdds(oddsRow, outcome);
          const key = selectionKey(match.id, outcome);
          const active = selectedKey === key;
          const pickLabel = outcomePickLabel(outcome, homeLabel, awayLabel);
          const american = formatAmericanOdd(odd);
          const isFavorite = american.startsWith('-');
          const pickDisabled = formLocked && !active;

          return (
            <button
              key={key}
              type="button"
              className={`parlay-pick-btn${active ? ' is-active' : ''}${pickDisabled ? ' is-locked' : ''}`}
              disabled={pickDisabled}
              onClick={() => onToggleSelection(match, outcome, pickLabel)}
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
});

function ParlayMatchesList({
  oddsState,
  selectionByMatchId,
  formLocked,
  onToggleSelection,
  matchesReady,
  hasMatches,
}) {
  if (!matchesReady && !hasMatches) {
    return <ParlayMatchesLoading />;
  }

  if (oddsState.loading && oddsState.openMatches.length === 0) {
    if (!hasMatches) return <ParlayMatchesLoading />;
    return (
      <div className="parlay-page__matches">
        <p className="muted sync-footnote">No hay partidos abiertos.</p>
      </div>
    );
  }

  if (oddsState.openMatches.length === 0) {
    return (
      <div className="parlay-page__matches">
        <p className="muted sync-footnote">No hay partidos abiertos.</p>
      </div>
    );
  }

  return (
    <div className="parlay-page__matches">
      <div className="parlay-page__match-list">
        {oddsState.openMatches.map((match) => (
          <ParlayMatchCard
            key={match.id}
            match={match}
            oddsRow={oddsState.byMatchId[String(match.id)]}
            selectedKey={selectionByMatchId.get(String(match.id)) ?? null}
            formLocked={formLocked}
            onToggleSelection={onToggleSelection}
          />
        ))}
      </div>
    </div>
  );
}

export default function ParlayPage({
  matches = [],
  matchesFullyLoaded = false,
  matchesLoading = false,
  onEnsureMatchesLoaded,
  userId,
  username = '',
  communityProfiles = [],
}) {
  const [ensuringMatches, setEnsuringMatches] = useState(false);

  const ensureRequestedRef = useRef(false);
  const onEnsureMatchesLoadedRef = useRef(onEnsureMatchesLoaded);
  onEnsureMatchesLoadedRef.current = onEnsureMatchesLoaded;

  useEffect(() => {
    if (matchesFullyLoaded) {
      ensureRequestedRef.current = true;
      setEnsuringMatches(false);
      return undefined;
    }
    if (ensureRequestedRef.current) return undefined;

    let cancelled = false;
    ensureRequestedRef.current = true;
    setEnsuringMatches(true);
    void Promise.resolve(onEnsureMatchesLoadedRef.current?.()).finally(() => {
      if (!cancelled) setEnsuringMatches(false);
    });
    return () => {
      cancelled = true;
    };
  }, [matchesFullyLoaded]);

  const matchesForOdds = useMemo(() => matches ?? [], [matches]);
  const oddsState = useParlayOdds(matchesForOdds, communityProfiles);
  const hasMatches = matchesForOdds.length > 0;
  const matchesReady =
    hasMatches && (matchesFullyLoaded || !matchesLoading) && !ensuringMatches;
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
  const formLocked = isParlayComplete;
  const canSubmit = isParlayComplete && isParlayStakeValid(stakeInput);
  const canExportPdf = isParlayComplete;
  const progressLabel = `${selections.length} / ${targetSelectionCount}`;
  const incompleteMessage = `Selecciona ${targetSelectionCount} partidos para completar tu combinada.`;

  const handleTargetSelectionCountChange = useCallback(
    (event) => {
      const next = Number(event.target.value);
      if (!Number.isFinite(next)) return;
      const clamped = Math.min(PARLAY_MAX_SELECTIONS, Math.max(PARLAY_MIN_SELECTIONS, Math.round(next)));
      if (!PARLAY_COUNT_OPTIONS.includes(clamped)) return;
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
      if (isParlayComplete) {
        setFlowMsg(PARLAY_COMPLETE_MSG);
        return;
      }

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
    [oddsState.byMatchId, selections, targetSelectionCount, isParlayComplete]
  );

  const handleExportSavedPdf = useCallback(
    (parlay) => {
      if (!parlay?.selections?.length) return;
      setPdfError('');
      try {
        exportParlayPdf({
          username,
          selections: parlay.selections,
          stake: parlay.stake,
          totalOdds: parlay.totalOdds,
          grossGain: displayParlayPossibleGain(parlay),
          filename: `pulponi-parlay-${String(parlay.id ?? 'saved').slice(0, 8)}.pdf`,
        });
      } catch (error) {
        console.error('[exportParlayPdf saved]', error);
        setPdfError(PDF_ERROR_MSG);
      }
    },
    [username]
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
        grossGain: displayParlayPossibleGain(payout),
      });
    } catch (error) {
      console.error('[exportParlayPdf]', error);
      setPdfError(PDF_ERROR_MSG);
    }
  }, [canExportPdf, username, selections, payout, totalOdds]);

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
      possibleGain: displayParlayPossibleGain(payout),
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

  const handleStakeChange = useCallback((event) => {
    const next = event.target.value;
    if (next === '') {
      setStakeInput('');
      setSaveMsg('');
      return;
    }
    const n = Math.round(Number(next));
    setStakeInput(Number.isFinite(n) ? String(Math.max(0, n)) : '');
    setSaveMsg('');
  }, []);

  const handleStakeBlur = useCallback(() => {
    setStakeInput((current) => (current === '' ? String(PARLAY_MIN_STAKE) : current));
  }, []);

  const selectionByMatchId = useMemo(() => {
    const map = new Map();
    for (const sel of selections) map.set(sel.matchId, sel.key);
    return map;
  }, [selections]);

  return (
    <div className={`parlay-page${formLocked ? ' parlay-page--locked' : ''}`}>
      <ParlayHeader />
      <ParlaySlip
        selections={selections}
        isParlayComplete={isParlayComplete}
        progressLabel={progressLabel}
        incompleteMessage={incompleteMessage}
        stakeInput={stakeInput}
        stakeError={stakeError}
        payout={payout}
        totalOdds={totalOdds}
        canSubmit={canSubmit}
        canExportPdf={canExportPdf}
        saveMsg={saveMsg}
        pdfError={pdfError}
        savedParlays={savedParlays}
        onStakeChange={handleStakeChange}
        onStakeBlur={handleStakeBlur}
        onRemoveSelection={removeSelection}
        onClearSelections={clearSelections}
        onSaveParlay={handleSaveParlay}
        onExportPdf={handleExportPdf}
        onExportSavedPdf={handleExportSavedPdf}
      />
      <ParlaySelectionCount
        targetSelectionCount={targetSelectionCount}
        selectionsLength={selections.length}
        formLocked={formLocked}
        flowMsg={flowMsg}
        needsReduceSelections={needsReduceSelections}
        onChange={handleTargetSelectionCountChange}
      />
      <ParlayMatchesList
        oddsState={oddsState}
        selectionByMatchId={selectionByMatchId}
        formLocked={formLocked}
        onToggleSelection={toggleSelection}
        matchesReady={matchesReady}
        hasMatches={hasMatches}
      />
    </div>
  );
}
