import {
  buildCommunityGeneralInsights,
  getInsufficientMessage,
} from '../lib/communityPicks';
import { formatKickoff } from '../lib/matchUtils';

const TREND_DISCLAIMER =
  'Estos porcentajes muestran la tendencia general, no los marcadores individuales.';

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

      <div className="community-insights__block">
        <p className="community-insights__label">Tendencia de la comunidad</p>
        <p className="community-insights__disclaimer">{TREND_DISCLAIMER}</p>
        <ul className="community-insights__list">
          <li>
            {outcome.homeLabel} gana: <span>{outcome.homePct}%</span>
          </li>
          <li>
            Empate: <span>{outcome.drawPct}%</span>
          </li>
          <li>
            {outcome.awayLabel} gana: <span>{outcome.awayPct}%</span>
          </li>
        </ul>
      </div>
    </article>
  );
}
