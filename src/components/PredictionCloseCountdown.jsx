import { useMemo } from 'react';
import { resolvePredictionCloseCountdown } from '../lib/matchUtils';
import { useKickoffClock } from '../hooks/useKickoffClock';

export default function PredictionCloseCountdown({ matches = [], className = '' }) {
  const now = useKickoffClock(1000);
  const predictionClose = useMemo(
    () => resolvePredictionCloseCountdown(matches, now),
    [matches, now]
  );

  return (
    <div
      className={['dash-notifications__close-countdown', className].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
    >
      {predictionClose.status === 'countdown' ? (
        <>
          <p className="dash-notifications__close-countdown-match">{predictionClose.matchLabel}</p>
          <p className="dash-notifications__close-countdown-time">
            Cierra en: <strong>{predictionClose.countdown}</strong>
          </p>
        </>
      ) : predictionClose.status === 'closed' ? (
        <>
          <p className="dash-notifications__close-countdown-match">{predictionClose.matchLabel}</p>
          <p className="dash-notifications__close-countdown-time dash-notifications__close-countdown-time--closed">
            Predicciones cerradas para este partido.
          </p>
        </>
      ) : (
        <p className="dash-notifications__close-countdown-time">No hay cierres próximos.</p>
      )}
    </div>
  );
}
