import {
  buildCommunityGeneralInsights,
  getInsufficientMessage,
} from '../lib/communityPicks';
import { useKickoffClock } from '../hooks/useKickoffClock';
import { formatKickoff, isProfilePickRevealed } from '../lib/matchUtils';
import DownloadPdfButton from './DownloadPdfButton';
import VoteDistributionList from './VoteDistributionList';

export default function CommunityMatchInsights({ match, scores, profileRows = [], compact = false }) {
  const now = useKickoffClock(1000);
  const revealed = isProfilePickRevealed(match, now);
  const { outcome, voteDistribution } = buildCommunityGeneralInsights(scores, match, profileRows);
  const matchLabel = `${match?.home_team ?? 'Local'} vs ${match?.away_team ?? 'Visitante'}`;
  const kickoffLabel = formatKickoff(match?.kickoff);

  if (!revealed) {
    return (
      <article className="community-insights community-insights--locked">
        <header className="community-insights__head">
          <strong>{matchLabel}</strong>
          {kickoffLabel ? <span className="community-insights__meta">{kickoffLabel}</span> : null}
        </header>
        <p className="community-insights__empty">
          🔒 Predicciones ocultas hasta el inicio del partido
        </p>
      </article>
    );
  }

  if (!outcome.sufficient && !voteDistribution?.items?.length) {
    return (
      <article className="community-insights community-insights--empty">
        <header className="community-insights__head">
          <strong>{matchLabel}</strong>
          {kickoffLabel ? <span className="community-insights__meta">{kickoffLabel}</span> : null}
        </header>
        <p className="community-insights__empty">{outcome.message ?? getInsufficientMessage()}</p>
        <VoteDistributionList items={voteDistribution?.items} />
        <DownloadPdfButton match={match} />
      </article>
    );
  }

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
