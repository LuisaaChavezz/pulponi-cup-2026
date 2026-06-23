import { buildCommunityGeneralInsights } from '../lib/communityPicks';
import { formatKickoff } from '../lib/matchUtils';
import DownloadPdfButton from './DownloadPdfButton';
import VoteDistributionList from './VoteDistributionList';

export default function CommunityMatchInsights({ match, scores, profileRows = [], compact = false }) {
  const { outcome, voteDistribution } = buildCommunityGeneralInsights(scores, match, profileRows, {
    minPicks: 1,
  });
  const matchLabel = `${match?.home_team ?? 'Local'} vs ${match?.away_team ?? 'Visitante'}`;
  const kickoffLabel = formatKickoff(match?.kickoff);

  return (
    <article className={`community-insights${compact ? ' community-insights--compact' : ''}`}>
      <header className="community-insights__head">
        <strong>{matchLabel}</strong>
        {kickoffLabel ? <span className="community-insights__meta">{kickoffLabel}</span> : null}
      </header>

      {outcome.sufficient ? (
        <ul className="community-insights__list">
          <li>
            <span className="community-insights__pct-label">{outcome.homeLabel} gana:</span>
            <span className="community-insights__pct-value">{outcome.homePct}%</span>
          </li>
          <li>
            <span className="community-insights__pct-label">Empate:</span>
            <span className="community-insights__pct-value">{outcome.drawPct}%</span>
          </li>
          <li>
            <span className="community-insights__pct-label">{outcome.awayLabel} gana:</span>
            <span className="community-insights__pct-value">{outcome.awayPct}%</span>
          </li>
        </ul>
      ) : null}
      <VoteDistributionList items={voteDistribution?.items} />
      <DownloadPdfButton match={match} />
    </article>
  );
}
