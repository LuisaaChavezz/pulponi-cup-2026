import {
  buildCommunityMatchInsights,
  getInsufficientMessage,
} from '../lib/communityPicks';
import { formatKickoff } from '../lib/matchUtils';

export default function CommunityMatchInsights({ match, scores, compact = false }) {
  const insights = buildCommunityMatchInsights(scores, match);
  const { outcome, mostChosen, riskiest } = insights;
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
        <p className="community-insights__label">Predicción de la comunidad</p>
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

      {mostChosen ? (
        <p className="community-insights__line">
          <span className="community-insights__label">Marcador más elegido</span>
          El marcador más elegido fue: <strong>{mostChosen.label}</strong>
        </p>
      ) : null}

      {riskiest ? (
        <p className="community-insights__line">
          <span className="community-insights__label">Pick más arriesgado</span>
          El pick más arriesgado fue: <strong>{riskiest.label}</strong>
        </p>
      ) : null}
    </article>
  );
}

export function CommunityTrendsLockedHint() {
  return (
    <p className="pulponi-social__locked-hint" role="status">
      Las tendencias de la comunidad se revelarán cuando cierre este partido.
    </p>
  );
}
