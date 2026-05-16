import {
  formatGroupLabel,
  formatMatchDate,
  formatMatchTime,
  formatVenue,
  formatVenueCity,
} from '../lib/matchUtils';

/** Estadio, ciudad, fecha y hora del partido. */
export default function MatchSchedule({ match, showGroup = true }) {
  const date = formatMatchDate(match?.kickoff);
  const time = formatMatchTime(match?.kickoff);
  const venue = formatVenue(match);
  const city = formatVenueCity(match);
  const group = showGroup ? formatGroupLabel(match) : null;

  const hasSchedule = date || time || venue || city || group;
  if (!hasSchedule) return null;

  return (
    <div className="match-schedule">
      {date ? <p className="match-schedule-date">{date}</p> : null}
      {time ? <p className="match-schedule-time">{time}</p> : null}
      {venue ? <p className="match-schedule-venue">{venue}</p> : null}
      {city ? <p className="match-schedule-city">{city}</p> : null}
      {group ? <p className="match-schedule-group">{group}</p> : null}
    </div>
  );
}
