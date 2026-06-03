import { Component, useEffect, useMemo, useRef, useState } from 'react';
import { Settings } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { supabase } from './lib/supabase';
import AuthPage from './pages/AuthPage';
import { useAppData } from './hooks/useAppData';
import {
  displayMatchStatus,
  displayTeamName,
  finalScoreLabel,
  formatMatchDate,
  formatMatchMinute,
  formatMatchTime,
  formatScoreLine,
  formatVenue,
  formatVenueCity,
  isMatchLive,
  isPickLocked,
  areCommunityTrendsRevealed,
  listCarouselUpcomingMatches,
  pickInicioMatch,
} from './lib/matchUtils';
import { filterWorldCupMatches } from './lib/worldCupScope';
import { useMatchSync } from './hooks/useMatchSync';
import MatchSchedule from './components/MatchSchedule';
import TeamLogo from './components/TeamLogo';
import MatchChat from './components/MatchChat';
import DashboardNotifications from './components/DashboardNotifications';
import { ACHIEVEMENT_CATALOG, isAchievementUnlockedById, countAchievementsTotal, countAchievementsUnlocked } from './data/achievements';
import AchievementCard from './components/AchievementCard';
import AchievementUnlockToast from './components/AchievementUnlockToast';
import ProfileAchievementsStrip from './components/ProfileAchievementsStrip';
import UserPublicProfile from './components/UserPublicProfile';
import Profile from './components/Profile';
import {
  ProfilePageCard,
  ProfileStatsGrid,
  ProfileBadgesList,
  ProfileActivityList,
  ProfilePickHistory,
  SHOW_PROFILE_ACTIVITY,
} from './components/ProfilePageSections';
import { usePublicProfile } from './hooks/usePublicProfile';
import { resolveAvatarUrl } from './lib/avatars';
import AvatarSelector from './components/AvatarSelector';
import UserAvatar from './components/UserAvatar';
import HighlightsModal from './components/HighlightsModal';
import RankingMovement from './components/RankingMovement';
import ProfileRankingSummary from './components/ProfileRankingSummary';
import RankingLeaderboard from './components/RankingLeaderboard';
import PulpoIndexCard from './components/PulpoIndexCard';
import { CommunityTrendsLockedHint } from './components/CommunityMatchInsights';
import { useKickoffClock } from './hooks/useKickoffClock';
import { normalizeStoredHighlightList } from './lib/highlightsMapper';
import { pullAndPersistHighlightEvents } from './lib/matchHighlightSync';

const NAV = [
  { id: 'inicio', icon: '⌂', label: 'Inicio' },
  { id: 'partidos', icon: '⚽', label: 'Partidos' },
  { id: 'ranking', icon: '🏆', label: 'Ranking' },
  { id: 'chat', icon: '💬', label: 'Chat' },
  { id: 'perfil', icon: '●', label: 'Perfil' },
  { id: 'reglas', icon: '📋', label: 'Reglas' },
];

class PulponiErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(err) {
    return { error: err };
  }

  componentDidCatch(error, info) {
    console.error('[PulponiErrorBoundary]', error, info);
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="app-fallback app-fallback--error">
          <div className="app-fallback__box">
            <p className="app-fallback__eyebrow">Pulponi Cup 2026</p>
            <h1 className="app-fallback__title">Algo falló al cargar la app</h1>
            <p className="app-fallback__msg">{String(error?.message ?? error)}</p>
            <button type="button" className="primary" onClick={() => window.location.reload()}>
              Recargar página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeNav, setActiveNav] = useState('inicio');
  const [chatInput, setChatInput] = useState('');
  const [chatTab, setChatTab] = useState('chat');

  const [pickDrafts, setPickDrafts] = useState({});
  const [profileEdit, setProfileEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [hlState, setHlState] = useState({ open: false, match: null, upcoming: false });
  const [highlightsRows, setHighlightsRows] = useState([]);
  const [highlightsLoading, setHighlightsLoading] = useState(false);
  const [viewProfileId, setViewProfileId] = useState(null);

  const exportCardRef = useRef(null);
  const matchesRef = useRef([]);

  const data = useAppData(session);
  const kickoffNow = useKickoffClock();

  useEffect(() => {
    if (chatTab === 'avisos' && session?.user?.id) {
      void data.loadCommunityPicks?.();
      void data.loadPredictionFeeds?.();
    }
  }, [chatTab, session?.user?.id, data.loadCommunityPicks, data.loadPredictionFeeds]);

  const worldCupMatches = useMemo(
    () => filterWorldCupMatches(data.matches ?? []),
    [data.matches]
  );

  const achievementCatalog = useMemo(
    () => (data.achievementCatalog?.length ? data.achievementCatalog : ACHIEVEMENT_CATALOG),
    [data.achievementCatalog]
  );

  const publicProfile = usePublicProfile(session ? viewProfileId : null, {
    matches: worldCupMatches,
    communityPickProfiles: data.communityPickProfiles ?? [],
    achievementCatalog,
  });

  const myProfileView = usePublicProfile(session?.user?.id ?? null, {
    matches: worldCupMatches,
    communityPickProfiles: data.communityPickProfiles ?? [],
    achievementCatalog,
  });

  useEffect(() => {
    console.log('[WORLD CUP MATCHES]', worldCupMatches.length);
  }, [worldCupMatches]);

  useMatchSync(session, worldCupMatches, data.onFootballSynced);

  useEffect(() => {
    matchesRef.current = worldCupMatches;
  }, [worldCupMatches]);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: d }) => {
        setSession(d.session);
        setAuthLoading(false);
      })
      .catch((err) => {
        console.error('[auth] getSession failed', err);
        setSession(null);
        setAuthLoading(false);
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (data.profile) {
      setEditName(data.profile.name ?? '');
      setEditUsername(data.profile.username ?? '');
    }
  }, [data.profile]);

  const upcomingCarouselMatches = useMemo(
    () => listCarouselUpcomingMatches(worldCupMatches),
    [worldCupMatches]
  );

  const [upcomingSlideIx, setUpcomingSlideIx] = useState(0);

  useEffect(() => {
    const n = upcomingCarouselMatches.length;
    setUpcomingSlideIx((x) => (n === 0 ? 0 : Math.min(x, n - 1)));
  }, [upcomingCarouselMatches]);

  useEffect(() => {
    const n = upcomingCarouselMatches.length;
    if (n <= 1) return undefined;
    const id = window.setInterval(() => {
      setUpcomingSlideIx((i) => (i + 1) % n);
    }, 5000);
    return () => window.clearInterval(id);
  }, [upcomingCarouselMatches]);

  const homeInicioPick = useMemo(() => pickInicioMatch(worldCupMatches), [worldCupMatches]);
  const featuredForHome = homeInicioPick?.match ?? null;

  function openHighlightsModal() {
    if (!featuredForHome) return;
    setHlState({
      open: true,
      match: featuredForHome,
      upcoming: !isMatchLive(featuredForHome),
    });
    setHighlightsRows(normalizeStoredHighlightList(featuredForHome.events ?? []));
  }

  function closeHighlightsModal() {
    setHlState({ open: false, match: null, upcoming: false });
    setHighlightsRows([]);
    setHighlightsLoading(false);
  }

  useEffect(() => {
    if (!hlState.open || !hlState.match?.id) return undefined;
    const mid = hlState.match.id;
    let cancelled = false;

    if (hlState.upcoming) {
      setHighlightsRows(normalizeStoredHighlightList(hlState.match.events ?? []));
      setHighlightsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setHighlightsLoading(true);

    (async () => {
      const row = matchesRef.current.find((m) => m.id === mid) ?? hlState.match;
      const res = await pullAndPersistHighlightEvents(row);
      if (cancelled) return;
      setHighlightsRows(res.highlights);
      setHighlightsLoading(false);
      if (res.persisted && Array.isArray(res.highlights)) {
        const merged = { ...(matchesRef.current.find((m) => m.id === mid) ?? row), events: res.highlights };
        data.applyMatchRow(merged);
      }
    })();

    const liveRow =
      matchesRef.current.find((m) => m.id === mid) ?? hlState.match;
    const shouldPoll =
      Boolean(liveRow?.api_fixture_id && liveRow.api_fixture_id >= 1 && isMatchLive(liveRow));

    const intervalId = shouldPoll
      ? window.setInterval(() => {
          const row = matchesRef.current.find((m) => m.id === mid) ?? hlState.match;
          if (!row || !isMatchLive(row)) return;
          pullAndPersistHighlightEvents(row).then((res) => {
            if (cancelled) return;
            setHighlightsRows(res.highlights);
            if (res.persisted && Array.isArray(res.highlights)) {
              data.applyMatchRow({ ...row, events: res.highlights });
            }
          });
        }, 30000)
      : null;

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [hlState.open, hlState.match?.id, hlState.upcoming, data.applyMatchRow]);

  function scrollToSection(id) {
    setActiveNav(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }

  function copyInvite() {
    navigator.clipboard.writeText(window.location.href).then(() => alert('Link privado copiado ✅'));
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  async function handleSendMessage() {
    const matchId = worldCupMatches[0]?.id ?? 'general';
    await data.sendComment(chatInput, matchId);
    setChatInput('');
  }

  async function submitPick(match) {
    const draft = pickDrafts[match.id] ?? {};
    const home = Number(draft.home ?? data.picks[match.id]?.home_pick ?? 0);
    const away = Number(draft.away ?? data.picks[match.id]?.away_pick ?? 0);
    await data.savePick(match.id, home, away, draft.advances ?? data.picks[match.id]?.advances_team);
  }

  function fillDemo() {
    worldCupMatches.forEach((m) => {
      const h = Math.floor(Math.random() * 4);
      const a = Math.floor(Math.random() * 4);
      data.savePick(m.id, h, a);
    });
    data.setActivity((prev) => [
      {
        text: `@${data.profile?.username ?? 'tú'} cambió su predicción`,
        avatarUrl: resolveAvatarUrl(data.profile?.photo_url),
      },
      ...prev,
    ]);
  }

  async function handleSaveProfile() {
    const err = await data.updateProfile(
      {
        name: editName,
        username: editUsername.toLowerCase(),
      },
      {
        activity: {
          type: 'profile_updated',
          payload: {},
        },
      }
    );
    if (err) alert(err.message);
    else setProfileEdit(false);
  }

  async function handleAvatarUpload(e) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file || !session?.user?.id) return;

    const filePath = `${session.user.id}/profile.jpg`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      console.error('[avatar upload]', uploadError);
      alert(`Error al subir la foto: ${uploadError.message}`);
      input.value = '';
      return;
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    const profileError = await data.updateProfile(
      { photo_url: publicUrl },
      {
        activity: {
          type: 'profile_photo_changed',
          payload: { source: 'storage_upload' },
        },
      }
    );
    if (profileError) {
      console.error('[avatar profile update]', profileError);
      alert(`Error al guardar la foto en el perfil: ${profileError.message}`);
      input.value = '';
      return;
    }

    input.value = '';
  }

  async function handleSelectPreset(photoUrl) {
    return data.updateProfile(
      { photo_url: photoUrl },
      {
        activity: {
          type: 'avatar_changed',
          payload: { photo_url: photoUrl },
        },
      }
    );
  }

  async function exportResults(format) {
    const el = exportCardRef.current;
    if (!el) return;
    const canvas = await html2canvas(el, { backgroundColor: '#050505', scale: 2 });
    if (format === 'pdf') {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [canvas.width, canvas.height] });
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save('pulponi-resultados.pdf');
    } else {
      const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const link = document.createElement('a');
      link.href = canvas.toDataURL(mime, 0.92);
      link.download = `pulponi.${format}`;
      link.click();
    }
  }

  if (authLoading) {
    return (
      <div className="loader-screen loader-screen--pulponi">
        <div className="loader-pulse" aria-hidden />
        <p>Cargando Pulponi Cup…</p>
      </div>
    );
  }
  if (!session) return <AuthPage />;

  const profile = data.profile;
  const displayUser = profile?.username ? `@${profile.username}` : '@tú';
  const displayName = profile?.name ?? 'Jugador';
  const avatarUrl = resolveAvatarUrl(profile?.photo_url);
  const inicioPick = homeInicioPick;
  const featured = featuredForHome;
  const inicioMode = inicioPick?.mode ?? null;
  const homeMatchIsLive = Boolean(featured && isMatchLive(featured));
  const featuredMinute = formatMatchMinute(featured);
  const inicioScoreCenter =
    !featured ? 'VS' : inicioMode === 'upcoming' ? 'VS' : formatScoreLine(featured);

  const proximosSlideMatch =
    upcomingCarouselMatches.length > 0
      ? upcomingCarouselMatches[Math.min(upcomingSlideIx, upcomingCarouselMatches.length - 1)]
      : null;
  const proximosActiveIx =
    upcomingCarouselMatches.length > 0
      ? Math.min(upcomingSlideIx, upcomingCarouselMatches.length - 1)
      : 0;

  const unlockedAchievementIds = data.userAchievementIds ?? [];
  const unlockedCount = countAchievementsUnlocked(unlockedAchievementIds, achievementCatalog);
  const achievementsTotal = countAchievementsTotal(achievementCatalog);

  const myRankIndex = (data.ranking ?? []).findIndex((r) => r.id === session?.user?.id);
  const myCurrentRank =
    myRankIndex >= 0 ? myRankIndex + 1 : myProfileView.data?.rankingSummary?.currentRank ?? null;
  const myPulpoIndex =
    Number(profile?.pulpo_index ?? myProfileView.data?.stats?.pulpoIndex ?? 0) || 0;
  const myProfileExtras = myProfileView.data ?? {};
  const myBadgesFromCatalog = achievementCatalog.filter((a) =>
    isAchievementUnlockedById(unlockedAchievementIds, a.id)
  ).map((a) => ({
    id: a.id,
    icon: a.icon,
    name: a.name,
    description: a.description,
    earnedAt: null,
  }));
  const myBadges =
    myProfileExtras.badges?.length > 0 ? myProfileExtras.badges : myBadgesFromCatalog;

  function openUserProfile(profileId) {
    if (!profileId) return;
    setViewProfileId(profileId);
    setActiveNav('usuario');
    window.setTimeout(() => {
      document.getElementById('usuario')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  function closeUserProfile() {
    setViewProfileId(null);
    setActiveNav('ranking');
  }

  return (
    <PulponiErrorBoundary>
      <>
        <AchievementUnlockToast
          unlock={data.pendingUnlock}
          onDismiss={data.dismissPendingUnlock}
        />
      <div className="bg-glow" />

      <header className="topbar topbar--premium">
        <a
          href="#inicio"
          className="topbar-brand"
          onClick={(e) => {
            e.preventDefault();
            scrollToSection('inicio');
          }}
        >
          <img src="/avatars/pulponi-neon.png" alt="Pulponi Cup" className="topbar-brand__logo" width={36} height={36} />
          <span className="topbar-brand__lockup">
            <span className="topbar-brand__w">PULPONI</span>
            <span className="topbar-brand__r">CUP 2026</span>
          </span>
        </a>
        <nav className="topbar-nav desktop-nav" aria-label="Principal">
          {NAV.map((n) => (
            <a
              key={n.id}
              href={`#${n.id}`}
              className={activeNav === n.id ? 'active' : ''}
              onClick={(e) => {
                e.preventDefault();
                scrollToSection(n.id);
              }}
            >
              {n.label}
            </a>
          ))}
        </nav>
        <div className="topbar-user">
          <button
            type="button"
            className="topbar-avatar-btn"
            onClick={() => scrollToSection('perfil')}
            aria-label="Ir a perfil"
          >
            <UserAvatar avatarUrl={avatarUrl} className="avatar-frame--sm" alt="" />
          </button>
        </div>
      </header>

      <section className="hero-premium hero-premium--compact dashboard-hero" id="hero-premium">
        <div className="hero-premium__inner">
          <div className="hero-premium__head">
            <div className="hero-premium__copy">
              <span className="eyebrow">COMPITE • COMENTA • DISFRUTA</span>
              <h2 className="hero-premium__title">VIVE EL MUNDIAL COMO NUNCA.</h2>
              <p className="hero-premium__lead">
                Predicciones visibles, ranking en vivo, chat, logros y modo live match.
              </p>
            </div>
            <div className="hero-premium__logo-wrap">
              <img
                src="/avatars/pulponi-neon.png"
                alt="Pulponi"
                className="hero-premium__logo"
                width={440}
                height={440}
                decoding="async"
              />
            </div>
          </div>
          <div className="hero-premium__actions">
            <button type="button" className="primary" onClick={() => scrollToSection('partidos')}>
              Enviar tus resultados
            </button>
            <button type="button" onClick={copyInvite}>
              Copiar link privado
            </button>
            <button type="button" onClick={handleLogout}>
              Salir
            </button>
          </div>
        </div>
      </section>

      <main id="inicio" className="layout layout--dashboard">
        {data.matchesLoading ? (
          <span className="sr-only" aria-live="polite">
            Sincronizando partidos…
          </span>
        ) : null}
        {!data.matchesLoading && data.matchSyncNotice ? (
          <p className="sync-footnote muted" role="status">
            {data.matchSyncNotice}
          </p>
        ) : null}
        <section className="dashboard-shell dashboard-shell--premium">
          <div className="dashboard-col-left">
            <article className="phone main-phone dash-inicio pulponi-card">
              <div className="phone-header phone-header--center">
                <span>INICIO</span>
              </div>
              {!featured ? (
                <div className="live-card live-card--empty inicio-empty">
                  <span className="inicio-empty-icon" aria-hidden>
                    ⚽
                  </span>
                  <p className="inicio-empty-title">Sin partidos por ahora</p>
                  <p className="muted inicio-empty-hint">
                    Cuando haya un partido en vivo o el próximo del calendario, aparecerá aquí.
                  </p>
                </div>
              ) : (
                <div className="live-card">
                  <div className="row inicio-match-badges">
                    {inicioMode === 'live' ? (
                      <span className="live-pill">PARTIDO EN VIVO</span>
                    ) : null}
                    {inicioMode === 'upcoming' ? <span className="tag">PRÓXIMO PARTIDO</span> : null}
                  </div>
                  <div className="scoreboard">
                    <div>
                      <TeamLogo
                        logo={featured.home_logo}
                        flag={featured.home_flag}
                        alt={featured.home_team ?? ''}
                        size="sm"
                      />
                      {displayTeamName(featured.home_team) ? (
                        <b>{displayTeamName(featured.home_team).toUpperCase()}</b>
                      ) : null}
                    </div>
                    <div className="score">
                      <strong>{inicioScoreCenter}</strong>
                      {homeMatchIsLive && featuredMinute ? <span>{featuredMinute}</span> : null}
                      {homeMatchIsLive || inicioMode === 'finished_fallback' ? (
                        <span className="match-status-code">{displayMatchStatus(featured)}</span>
                      ) : null}
                    </div>
                    <div>
                      <TeamLogo
                        logo={featured.away_logo}
                        flag={featured.away_flag}
                        alt={featured.away_team ?? ''}
                        size="sm"
                      />
                      {displayTeamName(featured.away_team) ? (
                        <b>{displayTeamName(featured.away_team).toUpperCase()}</b>
                      ) : null}
                    </div>
                  </div>
                  <div className="match-meta center">
                    <MatchSchedule match={featured} showGroup={false} />
                  </div>
                  <button type="button" className="primary full" onClick={openHighlightsModal}>
                    Highlights
                  </button>
                </div>
              )}
            </article>

            <article
              className="phone phone--activity-feed dash-activity-feed pulponi-card"
              id="actividad-reciente"
              aria-label="Actividad reciente"
            >
              <div className="phone-header phone-header--center phone-header--activity-feed">
                <span>Actividad reciente</span>
              </div>
              <div className="activity-list activity-list--feed">
                {data.activity.length === 0 ? (
                  <p className="empty-state activity-empty-compact">Sin actividad reciente</p>
                ) : (
                  data.activity.slice(0, 5).map((item, i) => {
                    const row = typeof item === 'string' ? { text: item, avatarUrl: resolveAvatarUrl(null) } : item;
                    return (
                      <div key={i} className="activity-row activity-row--feed">
                        <UserAvatar avatarUrl={row.avatarUrl} className="avatar-frame--xs" alt="" />
                        <span>
                          🔥{row.text}
                          <small>Hace {i + 1} min</small>
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </article>
          </div>

          <article
            id="partidoLive"
            className="phone phone--proximos phone--proximos-hero dash-proximos pulponi-card"
          >
            <div className="phone-header phone-header--center phone-header--proximos">
              <span>PRÓXIMOS PARTIDOS</span>
            </div>
            {upcomingCarouselMatches.length === 0 ? (
              <div className="upcoming-carousel-empty">
                <p>No hay próximos partidos todavía.</p>
              </div>
            ) : (
              <div className="upcoming-carousel">
                <div
                  key={
                    proximosSlideMatch?.id != null
                      ? String(proximosSlideMatch.id)
                      : `proximos-${upcomingSlideIx}`
                  }
                  className="upcoming-carousel-slide"
                >
                  <div className="upcoming-carousel-top">
                    <span className="upcoming-carousel-badge">Próximo</span>
                  </div>
                  <div className="match-teams">
                    <div className="match-team-cell">
                      <TeamLogo
                        logo={proximosSlideMatch.home_logo}
                        flag={proximosSlideMatch.home_flag}
                        alt={proximosSlideMatch.home_team ?? ''}
                        size="sm"
                      />
                      {displayTeamName(proximosSlideMatch.home_team) ? (
                        <span className="match-team-name">{proximosSlideMatch.home_team}</span>
                      ) : null}
                    </div>
                    <strong className="match-score-center upcoming-carousel-vs">VS</strong>
                    <div className="match-team-cell">
                      <TeamLogo
                        logo={proximosSlideMatch.away_logo}
                        flag={proximosSlideMatch.away_flag}
                        alt={proximosSlideMatch.away_team ?? ''}
                        size="sm"
                      />
                      {displayTeamName(proximosSlideMatch.away_team) ? (
                        <span className="match-team-name">{proximosSlideMatch.away_team}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="upcoming-carousel-meta">
                    {formatMatchDate(proximosSlideMatch.kickoff) ? (
                      <p className="upcoming-carousel-date">{formatMatchDate(proximosSlideMatch.kickoff)}</p>
                    ) : null}
                    {formatMatchTime(proximosSlideMatch.kickoff) ? (
                      <p className="upcoming-carousel-time">{formatMatchTime(proximosSlideMatch.kickoff)}</p>
                    ) : null}
                    {formatVenue(proximosSlideMatch) ? (
                      <p className="upcoming-carousel-venue">{formatVenue(proximosSlideMatch)}</p>
                    ) : null}
                    {formatVenueCity(proximosSlideMatch) ? (
                      <p className="upcoming-carousel-city">{formatVenueCity(proximosSlideMatch)}</p>
                    ) : null}
                  </div>
                </div>
                {upcomingCarouselMatches.length > 1 ? (
                  <div className="upcoming-carousel-dots" aria-hidden>
                    {upcomingCarouselMatches.map((m, i) => (
                      <span key={String(m.id ?? i)} className={i === proximosActiveIx ? 'is-active' : ''} />
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </article>

          <RankingMovement session={session} className="dash-ranking pulponi-card" />

          <article className="phone phone--chat-wide dash-chat pulponi-card" id="chat">
            <div className="phone-header">
              <span>{chatTab === 'avisos' ? 'MENSAJES IMPORTANTES' : 'CHAT DEL PARTIDO'}</span>
              <small>{(data.ranking ?? []).length} miembros</small>
            </div>
            <div className="tabs">
              <button type="button" className={chatTab === 'chat' ? 'active' : ''} onClick={() => setChatTab('chat')}>
                Chat
              </button>
              <button
                type="button"
                className={chatTab === 'avisos' ? 'active' : ''}
                onClick={() => setChatTab('avisos')}
              >
                Mensajes importantes
              </button>
            </div>
            {chatTab === 'chat' ? (
              <MatchChat
                messages={data.chatData}
                chatInput={chatInput}
                setChatInput={setChatInput}
                onSend={handleSendMessage}
                currentUserId={session?.user?.id ?? null}
                reactionRowsByMessage={data.reactionRowsByMessage}
                onToggleReaction={data.toggleReaction}
              />
            ) : (
              <div className="chat-list chat-list--notifications">
                <DashboardNotifications
                  importantAlerts={data.events ?? []}
                  predictionActivityFeed={data.predictionActivityFeed ?? []}
                  predictionActivityLog={data.predictionActivityLog ?? []}
                  matches={worldCupMatches ?? []}
                  communityPickProfiles={data.communityPickProfiles ?? []}
                  isAdmin={Boolean(data.profile?.is_admin)}
                  onCreateImportantAlert={data.createEvent}
                />
              </div>
            )}
          </article>

          <article className="phone dash-perfil dash-profile pulponi-card profile-page" id="perfil">
            <div className="phone-header">
              <span>PERFIL</span>
              <button type="button" onClick={() => setProfileEdit(!profileEdit)} aria-label="Ajustes">
                <Settings size={16} />
              </button>
            </div>

            <div className="profile-page__body">
              <Profile
                avatarUrl={avatarUrl}
                username={profile?.username ?? displayUser.replace('@', '')}
                displayName={displayName}
                rank={myCurrentRank}
                points={profile?.points ?? 0}
                exacts={profile?.exacts ?? 0}
                pulpoIndex={myPulpoIndex}
                streak={profile?.streak ?? 0}
                verified
                uploadLabel="Subir foto"
                onUpload={handleAvatarUpload}
              />

              {profileEdit ? (
                <ProfilePageCard title="Editar perfil" className="profile-page-card--edit">
                  <div className="profile-page__edit">
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nombre" />
                    <input
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value)}
                      placeholder="Username"
                    />
                    <button type="button" className="primary" onClick={handleSaveProfile}>
                      Guardar cambios
                    </button>
                  </div>
                </ProfilePageCard>
              ) : null}

              <div className="profile-page__cards profile-page__cards--own">
                <ProfilePageCard title="Índice Pulpo">
                  <PulpoIndexCard
                    profile={profile}
                    picks={data.picks}
                    matches={worldCupMatches}
                    communityPickProfiles={data.communityPickProfiles}
                    userId={session?.user?.id}
                  />
                </ProfilePageCard>

                <ProfilePageCard title="Tu ranking">
                  <ProfileRankingSummary userId={session?.user?.id} />
                </ProfilePageCard>

                <ProfilePageCard title="Estadísticas">
                  <ProfileStatsGrid stats={myProfileExtras.stats} />
                </ProfilePageCard>

                <ProfilePageCard
                  title="Historial de predicciones"
                  className="profile-page-card--predictions-history"
                >
                  <ProfilePickHistory rows={myProfileExtras.pickHistory} />
                </ProfilePageCard>

                <ProfilePageCard
                  title="Badges"
                  meta={`${unlockedCount} / ${achievementsTotal}`}
                >
                  <ProfileAchievementsStrip
                    unlockedIds={unlockedAchievementIds}
                    catalog={achievementCatalog}
                    onViewAll={() => openUserProfile(session.user.id)}
                  />
                  <ProfileBadgesList badges={myBadges} />
                </ProfilePageCard>

                {SHOW_PROFILE_ACTIVITY ? (
                  <ProfilePageCard title="Actividad reciente">
                    <ProfileActivityList
                      items={
                        myProfileExtras.activity?.length
                          ? myProfileExtras.activity
                          : (data.activity ?? []).map((row, i) => ({
                              id: `feed-${i}`,
                              text: row.text,
                              at: null,
                            }))
                      }
                    />
                  </ProfilePageCard>
                ) : null}

                <ProfilePageCard title="Elegir avatar" className="profile-page-card--avatars">
                  <AvatarSelector currentPhotoUrl={profile?.photo_url} onSelect={handleSelectPreset} />
                </ProfilePageCard>
              </div>
            </div>
          </article>
        </section>

        <section id="partidos" className="panel">
          <div className="section-title">
            <div>
              <span className="eyebrow">Predicciones</span>
              <h2>Partidos</h2>
            </div>
            {data.profile?.is_admin ? (
              <button type="button" onClick={fillDemo}>
                Llenar demo
              </button>
            ) : null}
          </div>
          <p className="penalty-note">
            Los penales cuentan como empate para la quiniela. Solo cuenta el marcador al final del tiempo
            regular (90&apos; + compensación).
          </p>
          <div className="matches-grid">
            {data.matchesLoading && !worldCupMatches.length ? (
              <p className="muted sync-footnote">Cargando calendario…</p>
            ) : null}
            {worldCupMatches.map((m) => {
              const locked = isPickLocked(m);
              const pick = data.picks[m.id];
              const draft = pickDrafts[m.id] ?? {};
              const status = displayMatchStatus(m);
              const finalLabel = finalScoreLabel(m);
              const trendsRevealed = areCommunityTrendsRevealed(m, kickoffNow);
              return (
                <article key={m.id} className="match-card">
                  <header>
                    <span className="match-card-header-left">
                      {m.provisional ? (
                        <span className="fifa-pill" title="Calendario publicado por FIFA">
                          Calendario oficial FIFA
                        </span>
                      ) : null}
                      {m.is_demo ? (
                        <span className="demo-pill" title="Partido de demostración">
                          DEMO
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={
                        status === 'En vivo' || status === 'Medio tiempo'
                          ? 'live-pill'
                          : 'match-status-code'
                      }
                    >
                      {status}
                    </span>
                  </header>
                  <MatchSchedule match={m} />
                  <div className="match-teams">
                    <div className="match-team-cell">
                      <TeamLogo logo={m.home_logo} flag={m.home_flag} alt={m.home_team ?? ''} size="sm" />
                      {displayTeamName(m.home_team) ? (
                        <span className="match-team-name">{m.home_team}</span>
                      ) : null}
                    </div>
                    <strong className="match-score-center">{formatScoreLine(m)}</strong>
                    <div className="match-team-cell">
                      <TeamLogo logo={m.away_logo} flag={m.away_flag} alt={m.away_team ?? ''} size="sm" />
                      {displayTeamName(m.away_team) ? (
                        <span className="match-team-name">{m.away_team}</span>
                      ) : null}
                    </div>
                  </div>
                  {!trendsRevealed ? <CommunityTrendsLockedHint /> : null}
                  <div className="pick-inputs">
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      disabled={locked}
                      value={draft.home ?? pick?.home_pick ?? ''}
                      onChange={(e) =>
                        setPickDrafts((d) => ({
                          ...d,
                          [m.id]: { ...d[m.id], home: e.target.value },
                        }))
                      }
                    />
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      disabled={locked}
                      value={draft.away ?? pick?.away_pick ?? ''}
                      onChange={(e) =>
                        setPickDrafts((d) => ({
                          ...d,
                          [m.id]: { ...d[m.id], away: e.target.value },
                        }))
                      }
                    />
                  </div>
                  {m.is_knockout ? (
                    <select
                      disabled={locked}
                      value={draft.advances ?? pick?.advances_team ?? ''}
                      onChange={(e) =>
                        setPickDrafts((d) => ({
                          ...d,
                          [m.id]: { ...d[m.id], advances: e.target.value },
                        }))
                      }
                      style={{ marginTop: 8 }}
                    >
                      <option value="">¿Quién avanza en penales?</option>
                      <option value={m.home_team}>{m.home_team}</option>
                      <option value={m.away_team}>{m.away_team}</option>
                    </select>
                  ) : null}
                  {finalLabel ? <p className="match-final">{finalLabel}</p> : null}
                  {locked ? (
                    <p className="pick-locked">
                      {status === 'Final' ? 'Predicción cerrada · Resultado final' : 'Predicción cerrada'}
                    </p>
                  ) : (
                    <button
                      type="button"
                      className="primary full"
                      style={{ marginTop: 10 }}
                      onClick={() => submitPick(m)}
                    >
                      Enviar resultado
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section id="usuario" className="panel panel--social-profile">
          <div className="section-title">
            <div>
              <span className="eyebrow">Comunidad</span>
              <h2>Perfil de jugador</h2>
            </div>
          </div>
          {viewProfileId ? (
            <UserPublicProfile
              data={publicProfile.data}
              loading={publicProfile.loading}
              error={publicProfile.error}
              isOwnProfile={viewProfileId === session.user.id}
              onEditProfile={() => scrollToSection('perfil')}
              onBack={closeUserProfile}
              achievementsTotal={achievementsTotal}
            />
          ) : (
            <div className="social-profile social-profile--empty pulponi-card">
              <p className="social-profile__muted">
                Toca un usuario en el ranking para ver su perfil público, stats, historial y badges.
              </p>
            </div>
          )}
        </section>

        <section id="ranking" className="panel">
          <div className="section-title">
            <div>
              <span className="eyebrow">Leaderboard</span>
              <h2>Ranking general</h2>
            </div>
            <div className="export-actions">
              <button type="button" onClick={() => exportResults('png')}>
                Exportar PNG
              </button>
              <button type="button" onClick={() => exportResults('jpeg')}>
                Exportar JPEG
              </button>
              <button type="button" onClick={() => exportResults('pdf')}>
                Exportar PDF
              </button>
            </div>
          </div>
          <RankingLeaderboard
            rows={data.ranking ?? []}
            currentUserId={session?.user?.id}
            onSelectUser={openUserProfile}
          />
        </section>

        <section id="logros" className="panel">
          <div className="section-title">
            <div>
              <span className="eyebrow">Badges Pulponi</span>
              <h2>Mis logros</h2>
              <p className="achievements-summary">
                Logros desbloqueados:{' '}
                <strong>
                  {unlockedCount} / {achievementsTotal}
                </strong>
              </p>
            </div>
          </div>
          <div className="achievements-grid">
            {achievementCatalog.map((achievement) => (
              <AchievementCard
                key={achievement.id}
                achievement={achievement}
                unlocked={isAchievementUnlockedById(unlockedAchievementIds, achievement.id)}
                personal
              />
            ))}
          </div>
        </section>

        <section id="reglas" className="panel">
          <div className="section-title">
            <div>
              <span className="eyebrow">Oficial</span>
              <h2>Reglas</h2>
            </div>
          </div>
          <div className="rules-accordion">
            <details open>
              <summary>Puntos</summary>
              <p>Marcador exacto (90&apos; + compensación): 3 puntos. Resultado correcto (ganador o empate): 1 punto. Sin predicción: 0 puntos.</p>
            </details>
            <details>
              <summary>Penales</summary>
              <p>La quiniela se califica solo con el marcador al final del tiempo regular. Tiempos extra no cuentan. Si hay penales, tu marcador regular sigue siendo el del 90&apos;. En eliminatorias indica quién avanza: +1 bonus si aciertas.</p>
            </details>
            <details>
              <summary>Cierre de picks</summary>
              <p>Puedes editar tu resultado hasta el inicio del partido (kickoff). Cuando el partido está en vivo o terminado, verás &quot;Predicción cerrada&quot;.</p>
            </details>
            <details>
              <summary>Desempates</summary>
              <p>1) Más puntos 2) Más exactos 3) Mayor racha.</p>
            </details>
            <details>
              <summary>Ranking y logros</summary>
              <p>El ranking se calcula desde Supabase en tiempo real. Los logros se desbloquean automáticamente según tus exactos, racha, ranking e Índice Pulpo.</p>
            </details>
          </div>
        </section>
      </main>

      <nav className="bottom-nav">
        {NAV.map((n) => (
          <a
            key={n.id}
            href={`#${n.id}`}
            className={activeNav === n.id ? 'active' : ''}
            onClick={(e) => {
              e.preventDefault();
              scrollToSection(n.id);
            }}
          >
            {n.icon}
            <span>{n.label}</span>
          </a>
        ))}
      </nav>

      <div ref={exportCardRef} className="export-card-hidden" aria-hidden="true">
        <span className="eyebrow">Pulponi Cup 2026</span>
        <h2 style={{ margin: '8px 0', fontStyle: 'italic' }}>Ranking</h2>
        {(data.ranking ?? []).slice(0, 5).map((r, i) => (
          <p key={r.id ?? i} style={{ margin: '4px 0' }}>
            {i + 1}. @{r.username} — {Number(r.points ?? 0)} pts
          </p>
        ))}
        <p style={{ color: '#ff1e27', marginTop: 16, fontSize: 12 }}>pulponi.cup</p>
      </div>

      <HighlightsModal
        open={hlState.open}
        onClose={closeHighlightsModal}
        match={hlState.match}
        highlights={highlightsRows}
        loading={highlightsLoading}
        isUpcomingOnly={hlState.upcoming}
        headlineEmptyCopy={
          hlState.open && !hlState.upcoming && !highlightsLoading && highlightsRows.length === 0
            ? 'Todavía no hay jugadas registradas en vivo para este partido.'
            : null
        }
      />
    </>
    </PulponiErrorBoundary>
  );
}
