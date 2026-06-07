import { useCallback, useMemo, useState } from 'react';
import MatchSchedule from '../components/MatchSchedule';
import TeamLogo from '../components/TeamLogo';
import { displayTeamName } from '../lib/matchUtils';
import { useParlayOdds } from '../hooks/useParlayOdds';
import {
  PARLAY_MIN_SELECTIONS,
  PARLAY_MAX_SELECTIONS,
  PULPONI_COMMISSION_RATE,
  PULPONI_GAIN_FACTOR,
  calculateVirtualParlayPayout,
  formatDecimalOdds,
  multiplySelectionOdds,
  parlaySelectionCountLabel,
} from '../lib/parlayCalculator';
import { getOutcomeOdds, oddsSourceBadge } from '../lib/parlayOdds';
import { createParlayId, loadUserParlays, saveUserParlay } from '../lib/parlayStorage';

const OUTCOMES = [
  { id: 'home', label: 'Local' },
  { id: 'draw', label: 'Empate' },
  { id: 'away', label: 'Visitante' },
];

function selectionKey(matchId, outcome) {
  return `${matchId}:${outcome}`;
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
            kickoff: match.kickoff,
            outcome,
            outcomeLabel: OUTCOMES.find((o) => o.id === outcome)?.label ?? outcome,
            decimalOdds,
            oddsSource: oddsRow?.source ?? 'pulponi_simulated',
            oddsSourceLabel: oddsSourceBadge(oddsRow),
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
      grossGain: payout.grossGain,
      pulponiCommissionRate: payout.commissionRate,
      pulponiGain: payout.pulponiGain,
      pulponiReturn: payout.pulponiReturn,
      oddsMode: oddsState.mode,
      status: 'pending',
    };
    const rows = saveUserParlay(userId, parlay);
    setSavedParlays(rows);
    setSaveMsg('Parlay virtual guardado. Solo puntos internos — sin dinero real.');
    setSelections([]);
  }, [userId, canSubmit, selections, payout, oddsState.mode]);

  const oddsBanner = (() => {
    if (oddsState.loading) {
      return { tone: 'neutral', title: 'Cargando momios…', copy: 'Consultando fuente autorizada o generando momios Pulponi.' };
    }
    if (oddsState.mode === 'authorized') {
      return {
        tone: 'authorized',
        title: 'Momios autorizados activos',
        copy: `Cotizaciones agregadas vía The Odds API (${oddsState.authorizedCount} partidos). El cálculo final usa el sistema interno Pulponi.`,
      };
    }
    if (oddsState.mode === 'mixed') {
      return {
        tone: 'mixed',
        title: 'Momios mixtos',
        copy: `${oddsState.authorizedCount} partidos con momios autorizados y ${oddsState.simulatedCount} con momios Pulponi simulados. Sin datos de casas no autorizadas.`,
      };
    }
    return {
      tone: 'simulated',
      title: 'Momios Pulponi (simulados)',
      copy: oddsState.apiConfigured
        ? 'No se pudieron cargar momios autorizados. Usamos momios Pulponi simulados — no son cotizaciones de casas de apuestas.'
        : 'Sin API de momios configurada. Usamos momios Pulponi simulados — claramente etiquetados, sin dinero real.',
    };
  })();

  return (
    <div className="parlay-page">
      <div className="section-title parlay-page__head">
        <div>
          <span className="eyebrow">Combinadas</span>
          <h2>PARLAY</h2>
          <p className="section-lead muted">
            Crea combinaciones de predicciones y compite por el mejor porcentaje de aciertos.
          </p>
        </div>
      </div>

      <div className={`parlay-page__banner parlay-page__banner--${oddsBanner.tone}`} role="status">
        <strong>{oddsBanner.title}</strong>
        <p>{oddsBanner.copy}</p>
      </div>

      <article className="parlay-page__rules pulponi-card">
        <h3 className="parlay-page__rules-title">Reglas transparentes</h3>
        <ul className="parlay-page__rules-list">
          <li>Mínimo {PARLAY_MIN_SELECTIONS} y máximo {PARLAY_MAX_SELECTIONS} selecciones por parlay.</li>
          <li>Momio total = multiplicación de cada selección (formato decimal).</li>
          <li>
            Comisión Pulponi interna: {(PULPONI_COMMISSION_RATE * 100).toFixed(0)}% sobre la ganancia estimada
            (factor usuario {(PULPONI_GAIN_FACTOR * 100).toFixed(0)}%).
          </li>
          <li>No se maneja dinero real. Solo puntos virtuales y ranking interno.</li>
          <li>
            <strong>El cálculo final usa el sistema interno Pulponi.</strong>
          </li>
        </ul>
      </article>

      <div className="parlay-page__layout">
        <div className="parlay-page__matches">
          <div className="parlay-page__matches-head">
            <h3>Partidos disponibles</h3>
            <span className="parlay-page__matches-meta muted">
              {oddsState.openMatches.length} partidos abiertos
            </span>
          </div>

          {oddsState.loading ? (
            <p className="muted sync-footnote">Cargando momios…</p>
          ) : oddsState.openMatches.length === 0 ? (
            <p className="muted sync-footnote">No hay partidos abiertos para armar parlay.</p>
          ) : (
            <div className="parlay-page__match-list">
              {oddsState.openMatches.map((match) => {
                const oddsRow = oddsState.byMatchId[String(match.id)];
                const homeLabel = displayTeamName(match.home_team) ?? 'Local';
                const awayLabel = displayTeamName(match.away_team) ?? 'Visitante';
                const sourceLabel = oddsSourceBadge(oddsRow);

                return (
                  <article key={match.id} className="parlay-match-card pulponi-card">
                    <div className="parlay-match-card__head">
                      <div className="parlay-match-card__teams">
                        <TeamLogo logo={match.home_logo} flag={match.home_flag} alt={match.home_team ?? ''} size="sm" />
                        <span>{homeLabel}</span>
                        <span className="parlay-match-card__vs">vs</span>
                        <TeamLogo logo={match.away_logo} flag={match.away_flag} alt={match.away_team ?? ''} size="sm" />
                        <span>{awayLabel}</span>
                      </div>
                      <MatchSchedule match={match} showWeekday={false} showGroup={false} />
                    </div>
                    <p className="parlay-match-card__source muted">{sourceLabel}</p>
                    <div className="parlay-match-card__odds">
                      {OUTCOMES.map((o) => {
                        const odd = getOutcomeOdds(oddsRow, o.id);
                        const key = selectionKey(match.id, o.id);
                        const active = selections.some((s) => s.key === key);
                        const label =
                          o.id === 'home' ? homeLabel : o.id === 'away' ? awayLabel : o.label;
                        return (
                          <button
                            key={key}
                            type="button"
                            className={`parlay-odd-btn${active ? ' is-active' : ''}`}
                            onClick={() => toggleSelection(match, o.id)}
                            aria-pressed={active}
                          >
                            <span className="parlay-odd-btn__label">{label}</span>
                            <span className="parlay-odd-btn__value">{formatDecimalOdds(odd)}</span>
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
            <h3>Tu parlay virtual</h3>
            <span className={`parlay-page__count${selections.length >= PARLAY_MIN_SELECTIONS ? ' is-ok' : ''}`}>
              {parlaySelectionCountLabel(selections.length)}
            </span>
          </div>

          {selections.length === 0 ? (
            <p className="muted parlay-page__empty-slip">
              Elige al menos {PARLAY_MIN_SELECTIONS} resultados (1X2) de partidos distintos.
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
                    <span className="parlay-page__selection-source">{sel.oddsSourceLabel}</span>
                  </div>
                  <button type="button" className="parlay-page__remove" onClick={() => removeSelection(sel.key)} aria-label="Quitar selección">
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <label className="parlay-page__stake">
            <span>Puntos virtuales a jugar</span>
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
            <div>
              <dt>Ganancia bruta estimada</dt>
              <dd>{payout.grossGain.toFixed(1)} pts</dd>
            </div>
            <div className="parlay-page__calc-commission">
              <dt>Comisión Pulponi ({(PULPONI_COMMISSION_RATE * 100).toFixed(0)}%)</dt>
              <dd>-{(payout.grossGain * PULPONI_COMMISSION_RATE).toFixed(1)} pts</dd>
            </div>
            <div className="parlay-page__calc-highlight">
              <dt>Ganancia Pulponi ({(PULPONI_GAIN_FACTOR * 100).toFixed(0)}%)</dt>
              <dd>{payout.pulponiGain.toFixed(1)} pts</dd>
            </div>
            <div className="parlay-page__calc-total">
              <dt>Retorno virtual estimado</dt>
              <dd>{payout.pulponiReturn.toFixed(1)} pts</dd>
            </div>
          </dl>

          <p className="parlay-page__calc-note muted">
            El cálculo final usa el sistema interno Pulponi. Sin dinero real.
          </p>

          <div className="parlay-page__actions">
            <button type="button" className="primary full" disabled={!canSubmit} onClick={handleSaveParlay}>
              Guardar parlay virtual
            </button>
            {selections.length > 0 ? (
              <button type="button" onClick={clearSelections}>
                Limpiar selecciones
              </button>
            ) : null}
          </div>

          {saveMsg ? <p className="parlay-page__save-msg">{saveMsg}</p> : null}

          {savedParlays.length > 0 ? (
            <div className="parlay-page__saved">
              <h4>Parlays guardados</h4>
              <ul>
                {savedParlays.slice(0, 5).map((p) => (
                  <li key={p.id}>
                    <span>
                      {p.selections.length} picks · momio {formatDecimalOdds(p.totalOdds)} ·{' '}
                      {p.pulponiReturn.toFixed(1)} pts est.
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
