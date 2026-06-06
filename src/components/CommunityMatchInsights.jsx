import {
  buildCommunityGeneralInsights,
  getInsufficientMessage,
} from '../lib/communityPicks';
import { formatKickoff } from '../lib/matchUtils';

export default function CommunityMatchInsights({ match, scores, compact = false }) {
  const { outcome } = buildCommunityGeneralInsights(scores, match);
  const matchLabel = `${match?.home_team ?? 'Local'} vs ${match?.away_team ?? 'Visitante'}`;
  const kickoffLabel = formatKickoff(match?.kickoff);

  if (!outcome.sufficient) {
    return (
      <article className="community-insights community-insights--empty">
        <header className="community-insights__head">
          <strong>{matchLabel}</strong>
          {kickoffLabel ? <span className="community-insights__meta">{kickoffLabel}</span> : null}
        </header>
        <p className="community-insights__empty">{outcome.message ?? getInsufficientMessage()}</p>
      </article>
    );
  }

  return (
    <article className={`community-insights${compact ? ' community-insights--compact' : ''}`}>
      <header className="community-insights__head">
        <strong>{matchLabel}</strong>
        {kickoffLabel ? <span className="community-insights__meta">{kickoffLabel}</span> : null}
      </header>

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
    </article>
  );
}
