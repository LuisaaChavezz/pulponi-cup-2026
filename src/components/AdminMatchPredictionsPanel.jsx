import { useEffect, useMemo, useState } from 'react';
import UserAvatar from './UserAvatar';
import { useKickoffClock } from '../hooks/useKickoffClock';
import {
  buildAdminMatchPredictionRows,
  canAdminExportPredictions,
  formatMatchVersusLabel,
  loadEligibleParticipantProfiles,
} from '../lib/predictionActivity';
import { pickDefaultFocusedMatch, sortMatchesForFocusedDropdown } from '../lib/matchUtils';

export default function AdminMatchPredictionsPanel({
  matches = [],
  isAdmin = false,
  currentUsername = null,
  selectedMatchId = '',
}) {
  const allowed = isAdmin || canAdminExportPredictions(currentUsername);
  const now = useKickoffClock(1000);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(false);

  const matchOptions = useMemo(
    () => sortMatchesForFocusedDropdown(matches ?? [], now),
    [matches, now]
  );

  const activeMatch = useMemo(() => {
    if (selectedMatchId) {
      return (
        matchOptions.find((m) => String(m.id) === String(selectedMatchId)) ??
        (matches ?? []).find((m) => String(m.id) === String(selectedMatchId)) ??
        null
      );
    }
    return pickDefaultFocusedMatch(matchOptions, now) ?? matchOptions[0] ?? null;
  }, [selectedMatchId, matchOptions, matches]);

  useEffect(() => {
    if (!allowed) {
      setParticipants([]);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    loadEligibleParticipantProfiles()
      .then((rows) => {
        if (!cancelled) setParticipants(rows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [allowed]);

  const { rows, sentCount, totalCount } = useMemo(
    () => buildAdminMatchPredictionRows(participants, activeMatch, matches),
    [participants, activeMatch, matches]
  );

  if (!allowed) return null;

  return (
    <section className="dash-notifications__section dash-notifications__section--admin-predictions">
      <div className="dash-notifications__head">
        <h3 className="dash-notifications__subtitle">Predicciones por partido</h3>
        <p className="dash-notifications__hint">
          Todos los participantes verificados o inscritos en la quiniela. Verde = pick enviado; rojo =
          sin predicción.
        </p>
      </div>

      {activeMatch ? (
        <p className="dash-notifications__export-match-name">{formatMatchVersusLabel(activeMatch)}</p>
      ) : null}

      <p className="dash-notifications__admin-pred-summary" role="status">
        {loading
          ? 'Cargando participantes…'
          : `${sentCount} de ${totalCount} enviaron su predicción`}
      </p>

      {!activeMatch ? (
        <p className="dash-notifications__empty">No hay partidos disponibles.</p>
      ) : loading ? (
        <p className="dash-notifications__empty">Cargando predicciones…</p>
      ) : !rows.length ? (
        <p className="dash-notifications__empty">No hay participantes elegibles.</p>
      ) : (
        <ul className="dash-notifications__admin-pred-list" aria-label="Predicciones por usuario">
          {rows.map((row) => (
            <li
              key={row.profileId}
              className={[
                'dash-notifications__admin-pred-row',
                row.hasPick
                  ? 'dash-notifications__admin-pred-row--sent'
                  : 'dash-notifications__admin-pred-row--missing',
              ].join(' ')}
            >
              <UserAvatar photoUrl={row.photoUrl} variant="chat" alt="" />
              <span className="dash-notifications__admin-pred-name">{row.displayName}</span>
              <span
                className={[
                  'dash-notifications__admin-pred-score',
                  row.hasPick ? '' : 'dash-notifications__admin-pred-score--missing',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {row.scoreLabel}
              </span>
              <span className="dash-notifications__admin-pred-status" aria-hidden>
                {row.hasPick ? '✅' : '🔴'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
