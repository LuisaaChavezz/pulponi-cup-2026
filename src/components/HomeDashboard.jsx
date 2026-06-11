import { useMemo } from 'react';
import { useMobileViewport } from '../hooks/useMobileViewport';
import TeamLogo from './TeamLogo';
import UserAvatar from './UserAvatar';
import MatchSchedule from './MatchSchedule';
import MatchChat from './MatchChat';
import HomeMobileRankingSummary from './HomeMobileRankingSummary';
import HomeMobileMatchesCarousel from './HomeMobileMatchesCarousel';
import RankingMovement from './RankingMovement';
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
  const name = String(row?.name ?? '').trim();
  if (name) return name.split(/\s+/)[0];
  const user = String(row?.username ?? '').replace(/^@+/, '').trim();
  if (user) return user;
  return 'Miembro';
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

const QUINIELA_INSCRITOS = [
  { username: 'adriespinoza', amount: 500 },
  { username: 'analy', amount: 500 },
  { username: 'chaveza', amount: 500 },
  { username: 'chovitz', amount: 500 },
  { username: 'claudioroca', amount: 500 },
  { username: 'costalitocampeon', amount: 500 },
  { username: 'ecantu8', amount: 500 },
  { username: 'góngora', amount: 500 },
  { username: 'imanol', amount: 500 },
  { username: 'itsmariachavez', amount: 500 },
  { username: 'ivan', amount: 500 },
  { username: 'lizbeth', amount: 500 },
  { username: 'luisaachavezz', amount: 500 },
  { username: 'manolo', amount: 500 },
  { username: 'marceloveloz', amount: 500 },
  { username: 'mau', amount: 500 },
  { username: 'michrobertsv', amount: 500 },
  { username: 'ni', amount: 500 },
  { username: 'pirata12', amount: 500 },
  { username: 'piyu', amount: 500 },
  { username: 'scs', amount: 500 },
  { username: 'ucg', amount: 500 },
  { username: 'vv', amount: 500 },
];
const PARLAY_INSCRITOS = [
  { username: 'jcpe', amount: 2000 },
  { username: 'luisaachavezz', amount: 2000 },
  { username: 'góngora', amount: 200 },
  { username: 'itsmariachavez', amount: 200 },
  { username: 'manolo', amount: 10000 },
  { username: 'imanol', amount: 40000 },
  { username: 'ni', amount: 500 },
];

function InscritoChip({ username, amount }) {
  return (
    <span className="home-dash-chip">
      <span className="home-dash-chip__user">@{username}</span>
      <span className="home-dash-chip__amount">+${amount}</span>
    </span>
  );
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
  myRankingRow = null,
  predictionActivityFeed = [],
  communityPickProfiles = [],
  communityProfiles = [],
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
  const isMobileHome = useMobileViewport(767);

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

  const activityFeed = useMemo(() => {
    const list = Array.isArray(predictionActivityFeed) ? predictionActivityFeed : [];
    return [...list].sort((a, b) => (b.at?.getTime?.() ?? 0) - (a.at?.getTime?.() ?? 0));
  }, [predictionActivityFeed]);

  const recentActivity = activityFeed.slice(0, 8);
  const hasMoreActivity = activityFeed.length > 8;

  const profileList =
    (communityProfiles?.length ? communityProfiles : null) ??
    (ranking?.length ? ranking : null) ??
    (communityPickProfiles?.length ? communityPickProfiles : []);
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

  const profilesBlock = (
    <article className="home-dash-sidebar-card home-dash-sidebar-card--profiles pulponi-card">
      <header className="home-dash-sidebar-card__head">
        <h3 className="home-dash-sidebar-card__title">Perfiles de la comunidad</h3>
      </header>
      {profileList.length === 0 ? (
        <p className="home-dash-empty home-dash-sidebar-card__empty">Sin datos todavía</p>
      ) : (
        <ul className="home-dash-profiles-scroll">
          {profileList.map((row, i) => (
            <li key={row.id ?? i}>
              <button
                type="button"
                className="home-dash-profile-row"
                onClick={() => onSelectUser?.(row.id)}
                aria-label={`Ver perfil de ${formatUsername(row)}`}
              >
                <UserAvatar photoUrl={row.photo_url} variant="community" className="home-dash-profile-row__avatar" alt="" />
                <span className="home-dash-profile-row__name">{formatUsername(row)}</span>
                <span className="home-dash-profile-row__pts">{Number(row.points ?? 0)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </article>
  );

  const chatBlock = (
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
          onSelectUser={onSelectUser}
        />
      </div>
    </article>
  );

  const myPoints = Number(myRankingRow?.points ?? profile?.points ?? 0);
  const myExacts = Number(myRankingRow?.exacts ?? profile?.exacts ?? 0);

  const insightsBlock = (
    <>
      <article className="home-dash-card home-dash-card--rank">
        <h3 className="home-dash-card__title">TU POSICIÓN</h3>
        <p className="home-dash-rank-num">#{myCurrentRank ?? '—'}</p>
        <ul className="home-dash-stat-list">
          <li>
            <span>Puntos</span>
            <strong>{myPoints}</strong>
          </li>
          <li>
            <span>Exactos</span>
            <strong>{myExacts}</strong>
          </li>
          <li>
            <span>Racha</span>
            <strong>{Number(profile?.streak ?? 0)}</strong>
          </li>
        </ul>
        <HomeDashButton onClick={onViewRanking}>VER RANKING COMPLETO</HomeDashButton>
      </article>

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
                <div
                  className="home-dash-bar__fill home-dash-bar__fill--draw"
                  style={{ width: `${trendInsights.outcome.drawPct}%` }}
                />
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

      <article className="home-dash-card home-dash-card--activity home-dash-card--activity-expanded">
        <h3 className="home-dash-card__title">ACTIVIDAD RECIENTE</h3>
        {recentActivity.length === 0 ? (
          <p className="home-dash-empty">No hay actividad reciente</p>
        ) : (
          <ul className="home-dash-activity home-dash-activity-scroll">
            {recentActivity.map((item) => {
              const parts = parseActivityParts(item.text);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="home-dash-activity__row profile-link-btn"
                    onClick={() => onSelectUser?.(item.profile_id)}
                    disabled={!item.profile_id || !onSelectUser}
                    aria-label={parts.match ? `Ver perfil: ${parts.action}` : `Ver perfil: ${parts.action}`}
                  >
                    <UserAvatar avatarUrl={item.avatarUrl} variant="community" className="home-dash-activity__avatar" alt="" />
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
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {hasMoreActivity ? <HomeDashButton onClick={onViewCommunity}>VER TODA</HomeDashButton> : null}
      </article>
    </>
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

      <div className={`home-dash-stack${isMobileHome ? ' home-dash-stack--mobile' : ''}`}>
        <div className="home-dash-stack__center">
          <section className="home-dash-stack__section home-dash-stack__section--hero">{heroBlock}</section>
          <section
            className={`home-dash-stack__section${
              isMobileHome ? ' home-dash-stack__section--mobile-ranking' : ' home-dash-stack__section--ranking'
            }`}
          >
            {isMobileHome ? (
              <HomeMobileRankingSummary
                session={session}
                onViewRanking={onViewRanking}
                onSelectUser={onSelectUser}
              />
            ) : (
              <RankingMovement
                session={session}
                className="dash-ranking pulponi-card ranking-section-movement home-dash-ranking-movement"
                onSelectUser={onSelectUser}
              />
            )}
          </section>
        </div>
        {isMobileHome ? (
          <section className="home-dash-stack__section home-dash-stack__section--mobile-carousel">
            <HomeMobileMatchesCarousel
              matches={matches}
              excludeMatchId={heroMatch?.id ?? null}
              onMakePrediction={onMakePrediction}
            />
          </section>
        ) : (
          <>
            <section className="home-dash-stack__section home-dash-stack__section--profiles">
              {profilesBlock}
            </section>
            <section className="home-dash-stack__section home-dash-stack__section--chat">
              {chatBlock}
            </section>
            <section className="home-dash-stack__section home-dash-stack__section--insights">
              <div className="home-dash-insights">{insightsBlock}</div>
            </section>
          </>
        )}
      </div>

      <footer className="home-dash-footer" aria-label="Inscritos quiniela y parlay">
        <section className="home-dash-pool">
          <h3 className="home-dash-pool__title">🔥 Quiniela</h3>
          <div className="home-dash-pool__chips">
            {QUINIELA_INSCRITOS.map((row) => (
              <InscritoChip key={row.username} username={row.username} amount={row.amount} />
            ))}
          </div>
          <p className="home-dash-pool__bolsa">💰 Bolsa Quiniela: $11,500 MXN</p>
        </section>
        <section className="home-dash-pool">
          <h3 className="home-dash-pool__title">🏆 Parlay</h3>
          <div className="home-dash-pool__chips">
            {PARLAY_INSCRITOS.map((row) => (
              <InscritoChip key={row.username} username={row.username} amount={row.amount} />
            ))}
          </div>
          <p className="home-dash-pool__bolsa">💰 Bolsa Parlay: $56,900 MXN</p>
        </section>
      </footer>
    </div>
  );
}
