import { getCommunityOutcomeStatsDisplay } from '../lib/communityPicks';

export default function MatchCommunityPrediction({ scores, match }) {
  const stats = getCommunityOutcomeStatsDisplay(scores, match);

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
            <div
              className="pulponi-social__bar-fill pulponi-social__bar-fill--home"
              style={{ width: `${stats.homePct}%` }}
            />
          </div>
          <span className="pulponi-social__bar-pct">{stats.homePct}%</span>
        </li>
        <li>
          <span className="pulponi-social__bar-label">Empate</span>
          <div className="pulponi-social__bar-track">
            <div
              className="pulponi-social__bar-fill pulponi-social__bar-fill--draw"
              style={{ width: `${stats.drawPct}%` }}
            />
          </div>
          <span className="pulponi-social__bar-pct">{stats.drawPct}%</span>
        </li>
        <li>
          <span className="pulponi-social__bar-label">{stats.awayLabel} gana</span>
          <div className="pulponi-social__bar-track">
            <div
              className="pulponi-social__bar-fill pulponi-social__bar-fill--away"
              style={{ width: `${stats.awayPct}%` }}
            />
          </div>
          <span className="pulponi-social__bar-pct">{stats.awayPct}%</span>
        </li>
      </ul>
      {stats.total === 0 ? (
        <p className="pulponi-social__empty">Aún no hay predicciones para este partido.</p>
      ) : null}
    </div>
  );
}
