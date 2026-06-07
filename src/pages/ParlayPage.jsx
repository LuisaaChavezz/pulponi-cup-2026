import { useCallback, useMemo, useState } from 'react';
import TeamLogo from '../components/TeamLogo';
import { displayTeamName, formatMatchDateShort, formatMatchTime } from '../lib/matchUtils';
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
  parlaySelectionCountLabel,
  resolveParlayStake,
} from '../lib/parlayCalculator';
import { getOutcomeOdds } from '../lib/parlayOdds';
import { createParlayId, loadUserParlays, saveUserParlay } from '../lib/parlayStorage';

const OUTCOMES = ['home', 'draw', 'away'];

function selectionKey(matchId, outcome) {
  return `${matchId}:${outcome}`;
}

function formatKickoff(kickoff) {
  const date = formatMatchDateShort(kickoff);
  const time = formatMatchTime(kickoff);
  if (date && time) return `${date} · ${time}`;
  return date || time || '';
}

function outcomePickLabel(outcome, homeLabel, awayLabel) {
  if (outcome === 'home') return `${homeLabel} gana`;
  if (outcome === 'away') return `${awayLabel} gana`;
  return 'Empate';
}

export default function ParlayPage({ matches = [], userId, communityProfiles = [] }) {
  const oddsState = useParlayOdds(matches, communityProfiles);
  const [selections, setSelections] = useState([]);
  const [stakeInput, setStakeInput] = useState(String(PARLAY_MIN_STAKE));
  const [savedParlays, setSavedParlays] = useState(() => (userId ? loadUserParlays(userId) : []));
  const [saveMsg, setSaveMsg] = useState('');

  const effectiveStake = useMemo(() => resolveParlayStake(stakeInput), [stakeInput]);
  const stakeError = isParlayStakeValid(stakeInput) ? '' : PARLAY_MIN_STAKE_MESSAGE;

  const totalOdds = useMemo(() => multiplySelectionOdds(selections), [selections]);
  const payout = useMemo(() => calculateVirtualParlayPayout(effectiveStake, totalOdds), [effectiveStake, totalOdds]);

  const canSubmit =
    selections.length >= PARLAY_MIN_SELECTIONS &&
    selections.length <= PARLAY_MAX_SELECTIONS &&
    isParlayStakeValid(stakeInput);

  const toggleSelection = useCallback(
    (match, outcome, pickLabel) => {
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
            outcomeLabel: pickLabel,
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
  }, [userId, canSubmit, selections, payout, oddsState.mode, stakeInput]);

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

                return (
                  <article key={match.id} className="parlay-match-card">
                    {kickoffLabel ? (
                      <time className="parlay-match-card__kickoff" dateTime={match.kickoff}>
                        {kickoffLabel}
                      </time>
                    ) : null}

                    <div className="parlay-match-card__matchup">
                      <div className="parlay-match-card__team">
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

                      <div className="parlay-match-card__team">
                        <TeamLogo
                          logo={match.away_logo}
                          flag={match.away_flag}
                          alt={match.away_team ?? ''}
                          size="sm"
                        />
                        <span className="parlay-match-card__team-name">{awayLabel}</span>
                      </div>
                    </div>

                    <p className="parlay-match-card__hint">Selecciona un resultado</p>

                    <div className="parlay-match-card__picks">
                      {OUTCOMES.map((outcome) => {
                        const odd = getOutcomeOdds(oddsRow, outcome);
                        const key = selectionKey(match.id, outcome);
                        const active = selections.some((s) => s.key === key);
                        const pickLabel = outcomePickLabel(outcome, homeLabel, awayLabel);
                        const american = formatAmericanOdd(odd);
                        const isFavorite = american.startsWith('-');

                        return (
                          <button
                            key={key}
                            type="button"
                            className={`parlay-pick-btn${active ? ' is-active' : ''}`}
                            onClick={() => toggleSelection(match, outcome, pickLabel)}
                            aria-pressed={active}
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
            <button type="button" className="primary full" disabled={!canSubmit} onClick={handleSaveParlay}>
              Guardar combinada
            </button>
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
