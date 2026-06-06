import { useMemo } from 'react';
import TeamLogo from './TeamLogo';
import UserAvatar from './UserAvatar';
import MatchSchedule from './MatchSchedule';
import { useKickoffClock } from '../hooks/useKickoffClock';
import { useRankingMovement } from '../hooks/useRankingMovement';
import {
  displayTeamName,
  formatCountdownToKickoff,
  formatMatchDate,
  formatMatchTime,
  formatVenue,
  formatVenueCity,
  isPickLocked,
  listCarouselUpcomingMatches,
  pickInicioMatch,
} from '../lib/matchUtils';
import { collectMatchPickScores, buildCommunityGeneralInsights } from '../lib/communityPicks';
import { selectDisplayName } from '../lib/rankingHistory';

function formatUsername(row) {
  const raw = row?.username ?? row?.name ?? 'jugador';
  return String(raw).replace(/^@+/, '').trim() || 'jugador';
}

function formatRelativeTime(at, now = new Date()) {
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) return '—';
  const diffMs = Math.max(0, now.getTime() - at.getTime());
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `Hace ${Math.max(1, sec)} seg`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `Hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Hace ${hr} h`;
  const days = Math.floor(hr / 24);
  return `Hace ${days} d`;
}

function parseActivityParts(text) {
  const raw = String(text || '').trim();
  if (!raw) return { action: 'Actividad', match: '' };
  const paraIdx = raw.lastIndexOf(' para ');
  if (paraIdx > 0) {
    return {
      action: raw.slice(0, paraIdx),
      match: raw.slice(paraIdx + 6),
    };
  }
  return { action: raw, match: '' };
}

function buildMovementHighlight(row) {
  const movement = row?.movement;
  const name = selectDisplayName(row);
  if (!movement) return null;

  if (movement.direction === 'up' && movement.delta > 0) {
    return {
      key: row.id,
      icon: '↑',
      delta: movement.delta,
      name,
      desc: `Subió ${movement.delta} ${movement.delta === 1 ? 'lugar' : 'lugares'}`,
      weight: movement.delta + (row.currentRank <= 5 ? 2 : 0),
    };
  }

  if (movement.direction === 'down' && movement.delta > 0) {
    return {
      key: row.id,
      icon: '↓',
      delta: movement.delta,
      name,
      desc: `Cayó ${movement.delta} ${movement.delta === 1 ? 'lugar' : 'lugares'}`,
      weight: movement.delta,
    };
  }

  if (movement.direction === 'new') {
    const inTop5 = (row.currentRank ?? 99) <= 5;
    return {
      key: row.id,
      icon: '↑',
      delta: inTop5 ? row.currentRank : 0,
      name,
      desc: inTop5 ? 'Entró al Top 5' : 'Nuevo en el ranking',
      weight: inTop5 ? 10 : 3,
    };
  }

  return null;
}

function HomeDashButton({ children, onClick, variant = 'ghost' }) {
  return (
    <button type="button" className={`home-dash-btn home-dash-btn--${variant}`} onClick={onClick}>
      {children}
    </button>
  );
}

export default function HomeDashboard({
  session,
  matches = [],
  ranking = [],
  profile,
  myCurrentRank,
  predictionActivityFeed = [],
  communityPickProfiles = [],
  matchesLoading = false,
  matchSyncNotice = null,
  onMakePrediction,
  onViewRanking,
  onViewCommunity,
  onSelectUser,
}) {
  const now = useKickoffClock(1000);
  const { rows: movementRows, loading: movementLoading } = useRankingMovement(session);

  const heroPick = useMemo(() => {
    const upcoming = listCarouselUpcomingMatches(matches)[0];
    if (upcoming) return { match: upcoming, mode: 'upcoming' };
    return pickInicioMatch(matches);
  }, [matches]);

  const heroMatch = heroPick?.match ?? null;
  const heroMode = heroPick?.mode ?? null;

  const closeCountdown = useMemo(() => {
    if (!heroMatch?.kickoff) return null;
    const ms = new Date(heroMatch.kickoff).getTime();
    if (Number.isNaN(ms)) return null;
    if (isPickLocked(heroMatch) || ms <= now.getTime()) return null;
    return formatCountdownToKickoff(ms, now);
  }, [heroMatch, now]);

  const trendInsights = useMemo(() => {
    if (!heroMatch?.id) return null;
    const scores = collectMatchPickScores(communityPickProfiles, heroMatch.id);
    return buildCommunityGeneralInsights(scores, heroMatch);
  }, [heroMatch, communityPickProfiles]);

  const movementHighlights = useMemo(() => {
    return movementRows
      .map(buildMovementHighlight)
      .filter(Boolean)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3);
  }, [movementRows]);

  const recentActivity = useMemo(() => {
    const list = Array.isArray(predictionActivityFeed) ? predictionActivityFeed : [];
    return [...list]
      .sort((a, b) => (b.at?.getTime?.() ?? 0) - (a.at?.getTime?.() ?? 0))
      .slice(0, 5);
  }, [predictionActivityFeed]);

  const topFive = (ranking ?? []).slice(0, 5);
  const venueLine = [formatVenue(heroMatch), formatVenueCity(heroMatch)].filter(Boolean).join(' · ');

  return (
    <div className="home-dash">
      {matchesLoading ? (
        <span className="sr-only" aria-live="polite">
          Sincronizando partidos…
        </span>
      ) : null}
      {!matchesLoading && matchSyncNotice ? (
        <p className="home-dash-sync muted" role="status">
          {matchSyncNotice}
        </p>
      ) : null}

      <article className="home-dash-hero">
        <div className="home-dash-hero__glow" aria-hidden />
        <header className="home-dash-hero__head">
          <span className="home-dash-kicker">PRÓXIMO PARTIDO</span>
          {heroMode === 'live' ? <span className="home-dash-live-pill">EN VIVO</span> : null}
        </header>

        {!heroMatch ? (
          <div className="home-dash-hero__empty">
            <span aria-hidden>⚽</span>
            <p>No hay próximo partido</p>
          </div>
        ) : (
          <>
            <div className="home-dash-hero__teams">
              <div className="home-dash-team">
                <TeamLogo
                  logo={heroMatch.home_logo}
                  flag={heroMatch.home_flag}
                  alt={heroMatch.home_team ?? ''}
                  size="md"
                />
                <strong>{displayTeamName(heroMatch.home_team)?.toUpperCase() ?? 'LOCAL'}</strong>
              </div>
              <div className="home-dash-hero__vs">
                <span>VS</span>
                {closeCountdown ? (
                  <div className="home-dash-hero__countdown">
                    <small>CIERRA EN</small>
                    <strong>{closeCountdown}</strong>
                  </div>
                ) : (
                  <div className="home-dash-hero__countdown home-dash-hero__countdown--closed">
                    <small>PREDICCIONES</small>
                    <strong>CERRADAS</strong>
                  </div>
                )}
              </div>
              <div className="home-dash-team">
                <TeamLogo
                  logo={heroMatch.away_logo}
                  flag={heroMatch.away_flag}
                  alt={heroMatch.away_team ?? ''}
                  size="md"
                />
                <strong>{displayTeamName(heroMatch.away_team)?.toUpperCase() ?? 'VISITANTE'}</strong>
              </div>
            </div>

            <div className="home-dash-hero__meta">
              {formatMatchDate(heroMatch.kickoff) || formatMatchTime(heroMatch.kickoff) ? (
                <p>
                  {[formatMatchDate(heroMatch.kickoff), formatMatchTime(heroMatch.kickoff)]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              ) : (
                <MatchSchedule match={heroMatch} showGroup={false} />
              )}
              {venueLine ? <p className="home-dash-hero__venue">{venueLine}</p> : null}
            </div>

            <HomeDashButton variant="primary" onClick={onMakePrediction}>
              HACER PREDICCIÓN
            </HomeDashButton>
          </>
        )}
      </article>

      <div className="home-dash-summary">
        <article className="home-dash-card home-dash-card--rank">
          <h3 className="home-dash-card__title">TU POSICIÓN</h3>
          <p className="home-dash-rank-num">#{myCurrentRank ?? '—'}</p>
          <ul className="home-dash-stat-list">
            <li>
              <span>Puntos</span>
              <strong>{Number(profile?.points ?? 0)}</strong>
            </li>
            <li>
              <span>Exactos</span>
              <strong>{Number(profile?.exacts ?? 0)}</strong>
            </li>
            <li>
              <span>Racha</span>
              <strong>{Number(profile?.streak ?? 0)}</strong>
            </li>
          </ul>
          <HomeDashButton onClick={onViewRanking}>VER RANKING COMPLETO</HomeDashButton>
        </article>

        <article className="home-dash-card home-dash-card--top5">
          <h3 className="home-dash-card__title">TOP 5</h3>
          {topFive.length === 0 ? (
            <p className="home-dash-empty">Sin datos todavía</p>
          ) : (
            <ol className="home-dash-top5">
              {topFive.map((row, i) => (
                <li key={row.id ?? i}>
                  <button type="button" className="home-dash-top5__row" onClick={() => onSelectUser?.(row.id)}>
                    <span className="home-dash-top5__pos">#{i + 1}</span>
                    <UserAvatar photoUrl={row.photo_url} className="home-dash-top5__avatar" alt="" />
                    <span className="home-dash-top5__name">{formatUsername(row)}</span>
                    <span className="home-dash-top5__pts">{Number(row.points ?? 0)}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          <HomeDashButton onClick={onViewRanking}>VER RANKING COMPLETO</HomeDashButton>
        </article>
      </div>

      <article className="home-dash-card home-dash-card--movement">
        <h3 className="home-dash-card__title">RANKING EN MOVIMIENTO</h3>
        {movementLoading ? (
          <p className="home-dash-empty">Sincronizando…</p>
        ) : movementHighlights.length === 0 ? (
          <p className="home-dash-empty">Sin datos todavía</p>
        ) : (
          <ul className="home-dash-movement">
            {movementHighlights.map((item) => (
              <li key={item.key} className={`home-dash-movement__row home-dash-movement__row--${item.icon === '↑' ? 'up' : 'down'}`}>
                <span className="home-dash-movement__badge" aria-hidden>
                  {item.icon} {item.delta > 0 ? item.delta : ''}
                </span>
                <UserAvatar
                  photoUrl={movementRows.find((r) => r.id === item.key)?.photo_url}
                  className="home-dash-movement__avatar"
                  alt=""
                />
                <div className="home-dash-movement__copy">
                  <strong>{item.name}</strong>
                  <span>{item.desc}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <HomeDashButton onClick={onViewRanking}>VER RANKING COMPLETO</HomeDashButton>
      </article>

      <div className="home-dash-bottom">
        <article className="home-dash-card home-dash-card--trend">
          <h3 className="home-dash-card__title">TENDENCIA DEL PRÓXIMO PARTIDO</h3>
          {!heroMatch ? (
            <p className="home-dash-empty">No hay próximo partido</p>
          ) : !trendInsights?.outcome?.sufficient ? (
            <p className="home-dash-empty">{trendInsights?.outcome?.message ?? 'Sin datos todavía'}</p>
          ) : (
            <ul className="home-dash-bars">
              <li>
                <div className="home-dash-bar__head">
                  <span>{trendInsights.outcome.homeLabel} gana</span>
                  <strong>{trendInsights.outcome.homePct}%</strong>
                </div>
                <div className="home-dash-bar__track">
                  <div className="home-dash-bar__fill" style={{ width: `${trendInsights.outcome.homePct}%` }} />
                </div>
              </li>
              <li>
                <div className="home-dash-bar__head">
                  <span>Empate</span>
                  <strong>{trendInsights.outcome.drawPct}%</strong>
                </div>
                <div className="home-dash-bar__track">
                  <div className="home-dash-bar__fill home-dash-bar__fill--draw" style={{ width: `${trendInsights.outcome.drawPct}%` }} />
                </div>
              </li>
              <li>
                <div className="home-dash-bar__head">
                  <span>{trendInsights.outcome.awayLabel} gana</span>
                  <strong>{trendInsights.outcome.awayPct}%</strong>
                </div>
                <div className="home-dash-bar__track">
                  <div className="home-dash-bar__fill home-dash-bar__fill--away" style={{ width: `${trendInsights.outcome.awayPct}%` }} />
                </div>
              </li>
            </ul>
          )}
        </article>

        <article className="home-dash-card home-dash-card--activity">
          <h3 className="home-dash-card__title">ACTIVIDAD RECIENTE</h3>
          {recentActivity.length === 0 ? (
            <p className="home-dash-empty">No hay actividad reciente</p>
          ) : (
            <ul className="home-dash-activity">
              {recentActivity.map((item) => {
                const parts = parseActivityParts(item.text);
                return (
                  <li key={item.id} className="home-dash-activity__row">
                    <UserAvatar avatarUrl={item.avatarUrl} className="home-dash-activity__avatar" alt="" />
                    <div className="home-dash-activity__copy">
                      <p>
                        <strong>{parts.action}</strong>
                        {parts.match ? (
                          <>
                            {' '}
                            — <span>{parts.match}</span>
                          </>
                        ) : null}
                      </p>
                      <time dateTime={item.at?.toISOString?.() ?? ''}>{formatRelativeTime(item.at, now)}</time>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <HomeDashButton onClick={onViewCommunity}>VER TODA</HomeDashButton>
        </article>
      </div>
    </div>
  );
}
