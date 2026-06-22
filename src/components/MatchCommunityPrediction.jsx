import { useKickoffClock } from '../hooks/useKickoffClock';
import { getCommunityOutcomeStats, getInsufficientMessage } from '../lib/communityPicks';
import { isProfilePickRevealed } from '../lib/matchUtils';

export default function MatchCommunityPrediction({ scores, match }) {
  const now = useKickoffClock(1000);
  const revealed = isProfilePickRevealed(match, now);

  if (!revealed) {
    return (
      <div className="pulponi-social pulponi-social--community" role="status">
        <p className="pulponi-social__title">Tendencia de la comunidad</p>
        <p className="pulponi-social__locked-hint">
          🔒 Las predicciones se revelan al iniciar el partido
        </p>
      </div>
    );
  }

  const stats = getCommunityOutcomeStats(scores, match);

  if (!stats.sufficient) {
    return (
      <div className="pulponi-social pulponi-social--community" role="status">
        <p className="pulponi-social__title">Tendencia de la comunidad</p>
        <p className="pulponi-social__empty">{stats.message ?? getInsufficientMessage()}</p>
      </div>
    );
  }

  return (
    <div
      className="pulponi-social pulponi-social--community"
      role="region"
      aria-label="Tendencia de la comunidad"
    >
      <p className="pulponi-social__title">Tendencia de la comunidad</p>
      <ul className="pulponi-social__bars">
        <li>
          <span className="pulponi-social__bar-label">{stats.homeLabel} gana</span>
          <div className="pulponi-social__bar-track">
            <div className="pulponi-social__bar-fill pulponi-social__bar-fill--home" style={{ width: `${stats.homePct}%` }} />
          </div>
          <span className="pulponi-social__bar-pct">{stats.homePct}%</span>
        </li>
        <li>
          <span className="pulponi-social__bar-label">Empate</span>
          <div className="pulponi-social__bar-track">
            <div className="pulponi-social__bar-fill pulponi-social__bar-fill--draw" style={{ width: `${stats.drawPct}%` }} />
          </div>
          <span className="pulponi-social__bar-pct">{stats.drawPct}%</span>
        </li>
        <li>
          <span className="pulponi-social__bar-label">{stats.awayLabel} gana</span>
          <div className="pulponi-social__bar-track">
            <div className="pulponi-social__bar-fill pulponi-social__bar-fill--away" style={{ width: `${stats.awayPct}%` }} />
          </div>
          <span className="pulponi-social__bar-pct">{stats.awayPct}%</span>
        </li>
      </ul>
    </div>
  );
}
