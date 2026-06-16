import { useEffect, useMemo, useState } from 'react';
import { canAdminExportPredictions } from '../lib/predictionActivity';
import { findMatchByTeams, normalizeMatchId } from '../lib/matchScoring';
import { formatMatchVersusLabel } from '../lib/predictionActivity';

export default function AdminMatchResultPanel({
  matches = [],
  currentUsername = null,
  isAdmin = false,
  onApplyFinalResult,
}) {
  const allowed = isAdmin || canAdminExportPredictions(currentUsername);
  const mexicoMatch = useMemo(
    () => findMatchByTeams(matches, 'México', 'Sudáfrica'),
    [matches]
  );

  const selectableMatches = useMemo(() => {
    return [...(matches ?? [])]
      .filter((m) => normalizeMatchId(m?.id))
      .sort((a, b) => {
        const ta = a?.kickoff ? new Date(a.kickoff).getTime() : 0;
        const tb = b?.kickoff ? new Date(b.kickoff).getTime() : 0;
        return ta - tb;
      });
  }, [matches]);

  const defaultMatchId = useMemo(() => {
    const preferred = normalizeMatchId(mexicoMatch?.id);
    if (preferred) return preferred;
    return normalizeMatchId(selectableMatches[0]?.id);
  }, [mexicoMatch, selectableMatches]);

  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [homeScore, setHomeScore] = useState('2');
  const [awayScore, setAwayScore] = useState('0');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (!defaultMatchId) return;
    setSelectedMatchId((prev) => {
      const current = normalizeMatchId(prev);
      if (current && selectableMatches.some((m) => normalizeMatchId(m.id) === current)) {
        return current;
      }
      return defaultMatchId;
    });
  }, [defaultMatchId, selectableMatches]);

  const activeMatchId = normalizeMatchId(selectedMatchId) || defaultMatchId;
  const activeMatch =
    selectableMatches.find((m) => normalizeMatchId(m.id) === activeMatchId) ?? mexicoMatch;

  if (!allowed) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    const matchIdToScore = normalizeMatchId(selectedMatchId) || defaultMatchId;
    if (busy || !matchIdToScore || !onApplyFinalResult) {
      if (!matchIdToScore) {
        setNotice({ type: 'error', text: 'Selecciona un partido válido.' });
      }
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const res = await onApplyFinalResult(matchIdToScore, homeScore, awayScore);
      if (res?.error) {
        setNotice({ type: 'error', text: String(res.error) });
      } else {
        const picks = res?.scored_picks ?? res?.score?.scored_picks ?? '—';
        setNotice({
          type: 'ok',
          text: `Marcador registrado (${homeScore}-${awayScore}). Predicciones puntuadas: ${picks}.`,
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
              const id = normalizeMatchId(m.id);
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
            <input
              type="number"
              min={0}
              max={20}
              value={homeScore}
              onChange={(e) => setHomeScore(e.target.value)}
              required
            />
          </label>
          <span className="dash-notifications__admin-score-sep">—</span>
          <label>
            Visitante
            <input
              type="number"
              min={0}
              max={20}
              value={awayScore}
              onChange={(e) => setAwayScore(e.target.value)}
              required
            />
          </label>
        </div>

        <button
          type="submit"
          className="dash-notifications__export-toggle"
          disabled={busy || !activeMatchId}
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
