import TeamLogo from './TeamLogo';
import {
  displayMatchStatus,
  displayTeamName,
  formatMatchDate,
  formatMatchTime,
  formatVenue,
  formatVenueCity,
  isPickLocked,
  listCarouselUpcomingMatches,
} from '../lib/matchUtils';

export default function HomeMobileMatchesCarousel({ matches = [], excludeMatchId = null, onMakePrediction }) {
  const carouselMatches = (() => {
    const upcoming = listCarouselUpcomingMatches(matches);
    if (!upcoming.length) return [];
    if (excludeMatchId == null) return upcoming;
    return upcoming.filter((m) => String(m.id) !== String(excludeMatchId));
  })();

  return (
    <article className="home-dash-mobile-carousel pulponi-card">
      <header className="home-dash-mobile-carousel__head">
        <h3 className="home-dash-mobile-carousel__title">Próximos partidos</h3>
      </header>
      {carouselMatches.length === 0 ? (
        <p className="home-dash-empty home-dash-mobile-carousel__empty">No hay más partidos próximos.</p>
      ) : (
        <div className="home-dash-mobile-carousel__track" role="list">
          {carouselMatches.map((match) => {
            const venueLine = [formatVenue(match), formatVenueCity(match)].filter(Boolean).join(' · ');
            const locked = isPickLocked(match);
            const status = displayMatchStatus(match);

            return (
              <article key={match.id} className="home-dash-mobile-carousel__card" role="listitem">
                <div className="home-dash-mobile-carousel__teams">
                  <div className="home-dash-mobile-carousel__team">
                    <TeamLogo
                      logo={match.home_logo}
                      flag={match.home_flag}
                      alt={match.home_team ?? ''}
                      size="sm"
                    />
                    <span>{displayTeamName(match.home_team) ?? 'Local'}</span>
                  </div>
                  <span className="home-dash-mobile-carousel__vs">VS</span>
                  <div className="home-dash-mobile-carousel__team">
                    <TeamLogo
                      logo={match.away_logo}
                      flag={match.away_flag}
                      alt={match.away_team ?? ''}
                      size="sm"
                    />
                    <span>{displayTeamName(match.away_team) ?? 'Visitante'}</span>
                  </div>
                </div>
                <div className="home-dash-mobile-carousel__meta">
                  {[formatMatchDate(match.kickoff), formatMatchTime(match.kickoff)].filter(Boolean).length > 0 ? (
                    <p>
                      {[formatMatchDate(match.kickoff), formatMatchTime(match.kickoff)].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}
                  {venueLine ? <p className="home-dash-mobile-carousel__venue">{venueLine}</p> : null}
                  <span className="home-dash-mobile-carousel__status">{status}</span>
                </div>
                {!locked ? (
                  <button
                    type="button"
                    className="home-dash-btn home-dash-btn--primary home-dash-mobile-carousel__cta"
                    onClick={onMakePrediction}
                  >
                    Hacer predicción
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </article>
  );
}
