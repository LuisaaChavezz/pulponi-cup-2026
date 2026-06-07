import UserAvatar from './UserAvatar';
import { buildRankedLeaderboard } from '../lib/rankingHistory';

function formatUsername(row) {
  const raw = row?.username ?? row?.name ?? 'jugador';
  return String(raw).replace(/^@+/, '').trim() || 'jugador';
}

export default function HomeMobileRankingSummary({ ranking = [], onViewRanking }) {
  const topFive = buildRankedLeaderboard(ranking).slice(0, 5);

  return (
    <article className="home-dash-mobile-ranking pulponi-card">
      <h3 className="home-dash-mobile-ranking__title">TOP RANKING</h3>
      {topFive.length === 0 ? (
        <p className="home-dash-empty home-dash-mobile-ranking__empty">Sin datos todavía</p>
      ) : (
        <ol className="home-dash-mobile-ranking__list">
          {topFive.map((row) => (
            <li key={row.id ?? row.rank_position} className="home-dash-mobile-ranking__row">
              <span className="home-dash-mobile-ranking__pos">{row.rank_position}.</span>
              <UserAvatar photoUrl={row.photo_url} variant="ranking" className="home-dash-mobile-ranking__avatar" alt="" />
              <span className="home-dash-mobile-ranking__name">{formatUsername(row)}</span>
              <span className="home-dash-mobile-ranking__pts">{Number(row.points ?? 0)} pts</span>
            </li>
          ))}
        </ol>
      )}
      <button type="button" className="home-dash-btn home-dash-btn--ghost" onClick={onViewRanking}>
        Ver ranking completo
      </button>
    </article>
  );
}
