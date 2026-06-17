import { useEffect, useMemo, useState } from 'react';
import PickScoreInput from './PickScoreInput';
import { useKickoffClock } from '../hooks/useKickoffClock';
import { canAdminExportPredictions, formatMatchVersusLabel } from '../lib/predictionActivity';
import { validatePickScores } from '../lib/pickScoreInput';
import {
  normalizeMatchId,
  pickDefaultFocusedMatch,
  resolveMatchForScoring,
  sortMatchesForFocusedDropdown,
} from '../lib/matchUtils';

export default function AdminMatchResultPanel({
  matches = [],
  currentUsername = null,
  isAdmin = false,
  onApplyFinalResult,
}) {
  const allowed = isAdmin || canAdminExportPredictions(currentUsername);
  const now = useKickoffClock(1000);

  const selectableMatches = useMemo(() => {
    const filtered = (matches ?? []).filter(
      (m) => resolveMatchForScoring(m?.id ?? m?.official_id, matches).dbId
    );
    return sortMatchesForFocusedDropdown(filtered, now);
  }, [matches, now]);

  const matchScoringId = (match) => resolveMatchForScoring(match?.id ?? match?.official_id, matches).dbId;

  const defaultMatchId = useMemo(() => {
    const focused = pickDefaultFocusedMatch(selectableMatches, now);
    if (focused) return matchScoringId(focused);
    return matchScoringId(selectableMatches[0]);
  }, [selectableMatches, now, matches]);

  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (!defaultMatchId) return;
    setSelectedMatchId((prev) => {
      const current = normalizeMatchId(prev);
      if (current && selectableMatches.some((m) => matchScoringId(m) === current)) {
        return current;
      }
      return defaultMatchId;
    });
  }, [defaultMatchId, selectableMatches]);

  const activeMatchId = normalizeMatchId(selectedMatchId) || defaultMatchId;
  const activeMatch = selectableMatches.find((m) => matchScoringId(m) === activeMatchId) ?? null;

  const scoreValidation = validatePickScores(homeScore, awayScore);
  const canSubmit =
    !busy && Boolean(activeMatchId) && Boolean(activeMatch) && scoreValidation.ok;

  if (!allowed) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy || !activeMatch || !onApplyFinalResult) {
      if (!activeMatch) {
        setNotice({ type: 'error', text: 'Selecciona un partido válido.' });
      }
      return;
    }
    if (!scoreValidation.ok) {
      setNotice({ type: 'error', text: scoreValidation.error ?? 'Ingresa un marcador válido para ambos equipos.' });
      return;
    }

    const homeTeam = String(activeMatch.home_team ?? '').trim();
    const awayTeam = String(activeMatch.away_team ?? '').trim();
    if (!homeTeam || !awayTeam) {
      setNotice({ type: 'error', text: 'El partido seleccionado no tiene equipos válidos.' });
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const res = await onApplyFinalResult(
        homeTeam,
        awayTeam,
        scoreValidation.home,
        scoreValidation.away,
        activeMatchId
      );
      if (res?.error) {
        setNotice({ type: 'error', text: String(res.error) });
      } else {
        const picks = res?.scored_picks ?? res?.score?.scored_picks ?? '—';
        setNotice({
          type: 'ok',
          text: `Marcador registrado (${scoreValidation.home}-${scoreValidation.away}). Predicciones puntuadas: ${picks}.`,
        });
      }
    } catch (err) {
      setNotice({ type: 'error', text: err?.message ?? 'Error al puntuar' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dash-notifications__section dash-notifications__section--admin-score">
      <div className="dash-notifications__head">
        <h3 className="dash-notifications__subtitle">Admin — marcador final</h3>
        <p className="dash-notifications__hint">
          Registra el resultado (90&apos;) y puntúa automáticamente: 3 pts exacto, 1 pt ganador, 0 si falla.
        </p>
      </div>

      <form className="dash-notifications__admin-score-form" onSubmit={handleSubmit}>
        <label className="dash-notifications__export-select-label">
          Partido
          <select
            className="dash-notifications__export-select"
            value={activeMatchId}
            onChange={(e) => setSelectedMatchId(e.target.value)}
            disabled={!selectableMatches.length}
          >
            {selectableMatches.map((m) => {
              const id = matchScoringId(m);
              return (
                <option key={id} value={id}>
                  {formatMatchVersusLabel(m)}
                </option>
              );
            })}
          </select>
        </label>

        {activeMatch ? (
          <p className="dash-notifications__export-match-name">{formatMatchVersusLabel(activeMatch)}</p>
        ) : null}

        <div className="dash-notifications__admin-score-inputs">
          <label>
            Local
            <PickScoreInput
              value={homeScore}
              onChange={setHomeScore}
              disabled={busy}
              ariaLabel="goles local"
            />
          </label>
          <span className="dash-notifications__admin-score-sep">—</span>
          <label>
            Visitante
            <PickScoreInput
              value={awayScore}
              onChange={setAwayScore}
              disabled={busy}
              ariaLabel="goles visitante"
            />
          </label>
        </div>

        <button
          type="submit"
          className="dash-notifications__export-toggle"
          disabled={!canSubmit}
        >
          {busy ? 'Puntuando…' : 'Registrar marcador y puntuar'}
        </button>

        {notice ? (
          <p
            className={
              notice.type === 'ok'
                ? 'dash-notifications__admin-score-notice dash-notifications__admin-score-notice--ok'
                : 'dash-notifications__admin-score-notice dash-notifications__admin-score-notice--err'
            }
            role="status"
          >
            {notice.text}
          </p>
        ) : null}
      </form>
    </section>
  );
}
