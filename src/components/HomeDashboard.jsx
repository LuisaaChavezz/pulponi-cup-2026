import { useMemo } from 'react';
import TeamLogo from './TeamLogo';
import UserAvatar from './UserAvatar';
import MatchSchedule from './MatchSchedule';
import RankingMovement from './RankingMovement';
import MatchChat from './MatchChat';
import { useKickoffClock } from '../hooks/useKickoffClock';
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
  chatMessages = [],
  chatInput = '',
  setChatInput,
  onSendMessage,
  reactionRowsByMessage = {},
  onToggleReaction,
  memberCount = 0,
  onMakePrediction,
  onViewRanking,
  onViewCommunity,
  onSelectUser,
}) {
  const now = useKickoffClock(1000);

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

  const recentActivity = useMemo(() => {
    const list = Array.isArray(predictionActivityFeed) ? predictionActivityFeed : [];
    return [...list]
      .sort((a, b) => (b.at?.getTime?.() ?? 0) - (a.at?.getTime?.() ?? 0))
      .slice(0, 5);
  }, [predictionActivityFeed]);

  const topFive = (ranking ?? []).slice(0, 5);
  const communityProfiles = ranking ?? [];
  const venueLine = [formatVenue(heroMatch), formatVenueCity(heroMatch)].filter(Boolean).join(' · ');

  const heroBlock = (
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
  );

  const rankingBlock = (
    <RankingMovement
      session={session}
      compact
      maxRest={5}
      showYouHint={false}
      className="home-dash-ranking-movement pulponi-card"
      onViewFull={onViewRanking}
    />
  );

  const profilesBlock = (
    <aside className="home-dash-sidebar home-dash-sidebar--profiles">
      <article className="home-dash-sidebar-card home-dash-sidebar-card--profiles pulponi-card">
        <header className="home-dash-sidebar-card__head">
          <h3 className="home-dash-sidebar-card__title">Perfiles de la comunidad</h3>
        </header>
        {communityProfiles.length === 0 ? (
          <p className="home-dash-empty home-dash-sidebar-card__empty">Sin datos todavía</p>
        ) : (
          <ul className="home-dash-profiles-scroll">
            {communityProfiles.map((row, i) => (
              <li key={row.id ?? i}>
                <button
                  type="button"
                  className="home-dash-profile-row"
                  onClick={() => onSelectUser?.(row.id)}
                  aria-label={`Ver perfil de ${formatUsername(row)}, puesto ${i + 1}`}
                >
                  <span className="home-dash-profile-row__pos">#{i + 1}</span>
                  <UserAvatar photoUrl={row.photo_url} className="home-dash-profile-row__avatar" alt="" />
                  <span className="home-dash-profile-row__name">{formatUsername(row)}</span>
                  <span className="home-dash-profile-row__pts">{Number(row.points ?? 0)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </article>
    </aside>
  );

  const chatBlock = (
    <aside className="home-dash-sidebar home-dash-sidebar--chat">
      <article className="home-dash-sidebar-card home-dash-sidebar-card--chat pulponi-card">
        <header className="home-dash-sidebar-card__head">
          <h3 className="home-dash-sidebar-card__title">Chat</h3>
          {memberCount > 0 ? (
            <small className="home-dash-sidebar-card__meta">{memberCount} miembros</small>
          ) : null}
        </header>
        <div className="home-dash-chat-body">
          <MatchChat
            messages={chatMessages}
            chatInput={chatInput}
            setChatInput={setChatInput}
            onSend={onSendMessage}
            currentUserId={session?.user?.id ?? null}
            reactionRowsByMessage={reactionRowsByMessage}
            onToggleReaction={onToggleReaction}
          />
        </div>
      </article>
    </aside>
  );

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

      <div className="home-dash-layout">
        {profilesBlock}
        <div className="home-dash-center">
          {heroBlock}
          {rankingBlock}
        </div>
        {chatBlock}
      </div>

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
