import { getCommunityOutcomeStats, aggregateVoteDistribution } from '../lib/communityPicks';
import VoteDistributionList from './VoteDistributionList';

export default function MatchCommunityPrediction({ scores, match, profileRows = [] }) {
  const stats = getCommunityOutcomeStats(scores, match, { minPicks: 1 });
  const voteDistribution = aggregateVoteDistribution(profileRows, match?.id, match);

  return (
    <div
      className="pulponi-social pulponi-social--community"
      role="region"
      aria-label="Tendencia de la comunidad"
    >
      <p className="pulponi-social__title">Tendencia de la comunidad</p>
      {stats.sufficient ? (
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
      ) : null}
      <VoteDistributionList items={voteDistribution?.items} title="Distribución de votos por marcador" />
    </div>
  );
}
