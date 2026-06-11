import RankingMovement from './RankingMovement';

/** Ranking en Inicio (móvil): movimiento ↑ ↓ = vía jornada anterior. */
export default function HomeMobileRankingSummary({ session, onViewRanking, onSelectUser }) {
  return (
    <RankingMovement
      session={session}
      compact
      maxRest={5}
      onViewFull={onViewRanking}
      className="home-dash-mobile-ranking pulponi-card phone--rank-movement--compact home-dash-ranking-movement"
      onSelectUser={onSelectUser}
    />
  );
}
