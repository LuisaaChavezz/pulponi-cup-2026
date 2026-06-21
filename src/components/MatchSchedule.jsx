import {
  formatGroupLabel,
  formatKickoff,
  formatVenue,
  formatVenueCity,
} from '../lib/matchUtils';

/** Estadio, ciudad, fecha y hora del partido. */
export default function MatchSchedule({ match, showGroup = true, showWeekday = true }) {
  void showWeekday;
  const kickoffLabel = formatKickoff(match?.kickoff);
  const venue = formatVenue(match);
  const city = formatVenueCity(match);
  const group = showGroup ? formatGroupLabel(match) : null;

  const hasSchedule = kickoffLabel || venue || city || group;
  if (!hasSchedule) return null;

  return (
    <div className="match-schedule">
      {kickoffLabel ? <p className="match-schedule-kickoff">{kickoffLabel}</p> : null}
      {venue ? <p className="match-schedule-venue">{venue}</p> : null}
      {city ? <p className="match-schedule-city">{city}</p> : null}
      {group ? <p className="match-schedule-group">{group}</p> : null}
    </div>
  );
}
