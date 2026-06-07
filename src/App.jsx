import { Component, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Settings } from 'lucide-react';
import { supabase } from './lib/supabase';
import AuthPage from './pages/AuthPage';
import { useAppData } from './hooks/useAppData';
import {
  displayMatchStatus,
  displayTeamName,
  finalScoreLabel,
  formatMatchMinute,
  formatScoreLine,
  isMatchLive,
  isPickLocked,
  pickInicioMatch,
} from './lib/matchUtils';
import { filterWorldCupMatches } from './lib/worldCupScope';
import { useMatchSync } from './hooks/useMatchSync';
import MatchSchedule from './components/MatchSchedule';
import TeamLogo from './components/TeamLogo';
import MatchChat from './components/MatchChat';
import RulesBadgesSection from './components/RulesBadgesSection';
import DashboardNotifications from './components/DashboardNotifications';
import HomeDashboard from './components/HomeDashboard';
import { ACHIEVEMENT_CATALOG, isAchievementUnlockedById, countAchievementsTotal, countAchievementsUnlocked } from './data/achievements';
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
import MatchCommunityPrediction from './components/MatchCommunityPrediction';
import { collectMatchPickScores } from './lib/communityPicks';
import { normalizeStoredHighlightList } from './lib/highlightsMapper';
import { buildRankedLeaderboard } from './lib/rankingHistory';
import { exportRankingPdf } from './lib/exportRankingPdf';

const NAV = [
  { id: 'inicio', icon: '⌂', label: 'Inicio' },
  { id: 'partidos', icon: '⚽', label: 'Partidos' },
  { id: 'ranking', icon: '🏆', label: 'Ranking' },
  { id: 'comunidad', icon: '💬', label: 'Comunidad' },
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

  const [pickDrafts, setPickDrafts] = useState({});
  const [profileEdit, setProfileEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [hlState, setHlState] = useState({ open: false, match: null, upcoming: false });
  const [highlightsRows, setHighlightsRows] = useState([]);
  const [highlightsLoading, setHighlightsLoading] = useState(false);
  const [viewProfileId, setViewProfileId] = useState(null);

  const matchesRef = useRef([]);
  const pickFeedbackTimersRef = useRef({});

  const [pickSaveFeedback, setPickSaveFeedback] = useState({});

  const data = useAppData(session);

  const sortedRanking = useMemo(
    () => buildRankedLeaderboard(data.ranking ?? []),
    [data.ranking]
  );

  useEffect(() => {
    if ((activeNav === 'comunidad' || activeNav === 'inicio') && session?.user?.id) {
      void data.loadCommunityPicks?.();
      void data.loadPredictionFeeds?.();
    }
  }, [activeNav, session?.user?.id, data.loadCommunityPicks, data.loadPredictionFeeds]);

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

  useEffect(
    () => () => {
      Object.values(pickFeedbackTimersRef.current).forEach((id) => window.clearTimeout(id));
    },
    []
  );

  function clearPickFeedbackTimer(matchId) {
    const timerId = pickFeedbackTimersRef.current[matchId];
    if (timerId) {
      window.clearTimeout(timerId);
      delete pickFeedbackTimersRef.current[matchId];
    }
  }

  function setPickFeedback(matchId, feedback) {
    clearPickFeedbackTimer(matchId);
    setPickSaveFeedback((prev) => ({ ...prev, [matchId]: feedback }));
    if (feedback?.type === 'success' || feedback?.type === 'error') {
      pickFeedbackTimersRef.current[matchId] = window.setTimeout(() => {
        setPickSaveFeedback((prev) => {
          const next = { ...prev };
          delete next[matchId];
          return next;
        });
        delete pickFeedbackTimersRef.current[matchId];
      }, 3000);
    }
  }

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

  function navigateToSection(id) {
    setActiveNav(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    const matchId = match.id;
    const hadPick = data.picks[matchId] != null;
    setPickFeedback(matchId, { type: 'saving' });
    try {
      const draft = pickDrafts[matchId] ?? {};
      const home = Number(draft.home ?? data.picks[matchId]?.home_pick ?? 0);
      const away = Number(draft.away ?? data.picks[matchId]?.away_pick ?? 0);
      const result = await data.savePick(
        matchId,
        home,
        away,
        draft.advances ?? data.picks[matchId]?.advances_team
      );
      if (result?.ok) {
        setPickFeedback(matchId, {
          type: 'success',
          message: result.isUpdate || hadPick ? 'Predicción actualizada ✅' : 'Predicción registrada ✅',
        });
      } else {
        setPickFeedback(matchId, {
          type: 'error',
          message: 'No se pudo guardar la predicción. Intenta de nuevo.',
        });
      }
    } catch {
      setPickFeedback(matchId, {
        type: 'error',
        message: 'No se pudo guardar la predicción. Intenta de nuevo.',
      });
    }
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

  const unlockedAchievementIds = data.userAchievementIds ?? [];
  const unlockedCount = countAchievementsUnlocked(unlockedAchievementIds, achievementCatalog);
  const achievementsTotal = countAchievementsTotal(achievementCatalog);

  const myRankIndex = sortedRanking.findIndex((r) => r.id === session?.user?.id);
  const myCurrentRank =
    myRankIndex >= 0 ? myRankIndex + 1 : myProfileView.data?.rankingSummary?.currentRank ?? null;
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
    setActiveNav('ranking');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeUserProfile() {
    setViewProfileId(null);
    setActiveNav('ranking');
  }

  function sectionClass(id, extra = '') {
    return `app-section${extra ? ` ${extra}` : ''}${activeNav === id ? ' is-active' : ''}`;
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
            navigateToSection('inicio');
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
              className={`desktop-nav__item${activeNav === n.id ? ' is-active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                navigateToSection(n.id);
              }}
            >
              <span className="desktop-nav__label">{n.label}</span>
            </a>
          ))}
        </nav>
        <div className="topbar-user">
          <button type="button" className="topbar-logout-btn" onClick={copyInvite}>
            Invitar
          </button>
          <button type="button" className="topbar-logout-btn" onClick={handleLogout}>
            Salir
          </button>
          <button
            type="button"
            className="topbar-avatar-btn"
            onClick={() => navigateToSection('perfil')}
            aria-label="Ir a perfil"
          >
            <UserAvatar avatarUrl={avatarUrl} className="avatar-frame--sm" alt="" />
          </button>
        </div>
      </header>

      <main className="app-shell">
        <section id="inicio" className={sectionClass('inicio', 'layout layout--dashboard')}>
          <HomeDashboard
            session={session}
            matches={worldCupMatches}
            ranking={data.ranking ?? []}
            profile={profile}
            myCurrentRank={myCurrentRank}
            predictionActivityFeed={data.predictionActivityFeed ?? []}
            communityPickProfiles={data.communityPickProfiles ?? []}
            matchesLoading={data.matchesLoading}
            matchSyncNotice={data.matchSyncNotice}
            chatMessages={data.chatData ?? []}
            chatInput={chatInput}
            setChatInput={setChatInput}
            onSendMessage={handleSendMessage}
            reactionRowsByMessage={data.reactionRowsByMessage ?? {}}
            onToggleReaction={data.toggleReaction}
            memberCount={(data.ranking ?? []).length}
            onMakePrediction={() => navigateToSection('partidos')}
            onViewRanking={() => navigateToSection('ranking')}
            onViewCommunity={() => navigateToSection('comunidad')}
            onSelectUser={openUserProfile}
          />
        </section>

        <section id="partidos" className={sectionClass('partidos', 'panel')}>
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
              const communityScores = collectMatchPickScores(data.communityPickProfiles, m.id);
              const pickFeedback = pickSaveFeedback[m.id];
              const pickSaving = pickFeedback?.type === 'saving';
              const hasSavedPick = pick != null;
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
                  <MatchCommunityPrediction scores={communityScores} match={m} />
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
                    <div className="pick-submit-wrap">
                      <button
                        type="button"
                        className="primary full pick-submit-btn"
                        disabled={pickSaving}
                        onClick={() => submitPick(m)}
                      >
                        {pickSaving
                          ? 'Guardando...'
                          : hasSavedPick
                            ? 'Actualizar predicción'
                            : 'Enviar predicción'}
                      </button>
                      {pickFeedback?.message ? (
                        <p
                          className={`pick-save-feedback pick-save-feedback--${pickFeedback.type}`}
                          role={pickFeedback.type === 'error' ? 'alert' : 'status'}
                        >
                          {pickFeedback.message}
                        </p>
                      ) : null}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section id="ranking" className={sectionClass('ranking', 'panel')}>
          {viewProfileId ? (
            <UserPublicProfile
              data={publicProfile.data}
              loading={publicProfile.loading}
              error={publicProfile.error}
              isOwnProfile={viewProfileId === session.user.id}
              onEditProfile={() => navigateToSection('perfil')}
              onBack={closeUserProfile}
              achievementsTotal={achievementsTotal}
            />
          ) : (
            <>
              <div className="section-title">
                <div>
                  <span className="eyebrow">Leaderboard</span>
                  <h2>Ranking</h2>
                  <p className="section-lead muted">
                    Toca un jugador para abrir su perfil público. Exactos, rachas e Índice Pulpo incluidos.
                  </p>
                </div>
                <div className="export-actions ranking-export-actions">
                  <button type="button" onClick={() => exportRankingPdf(sortedRanking)}>
                    Exportar ranking
                  </button>
                </div>
              </div>
              <RankingLeaderboard
                rows={sortedRanking}
                currentUserId={session?.user?.id}
                onSelectUser={openUserProfile}
              />
              <RankingMovement session={session} className="dash-ranking pulponi-card ranking-section-movement" />
              <article className="phone pulponi-card ranking-section-pulpo">
                <div className="phone-header phone-header--center">
                  <span>ÍNDICE PULPO</span>
                </div>
                <PulpoIndexCard
                  profile={profile}
                  picks={data.picks}
                  matches={worldCupMatches}
                  communityPickProfiles={data.communityPickProfiles}
                  userId={session?.user?.id}
                />
              </article>
            </>
          )}
        </section>

        <section id="comunidad" className={sectionClass('comunidad', 'panel')}>
          <div className="section-title">
            <div>
              <span className="eyebrow">Comunidad</span>
              <h2>Comunidad Pulponi</h2>
            </div>
          </div>
          <div className="community-content">
            <article className="important-messages-panel pulponi-card">
              <div className="important-messages-panel__scroll chat-list chat-list--notifications">
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
            </article>
            <article className="chat-panel pulponi-card">
              <header className="phone-header chat-panel__header">
                <span>CHAT DEL PARTIDO</span>
                <small>{(data.ranking ?? []).length} miembros</small>
              </header>
              <MatchChat
                messages={data.chatData}
                chatInput={chatInput}
                setChatInput={setChatInput}
                onSend={handleSendMessage}
                currentUserId={session?.user?.id ?? null}
                reactionRowsByMessage={data.reactionRowsByMessage}
                onToggleReaction={data.toggleReaction}
                messagesListClassName="chat-messages-list"
                inputAreaClassName="chat-input-area"
              />
            </article>
          </div>
        </section>

        <section id="perfil" className={sectionClass('perfil', 'panel')}>
          <article className="phone dash-perfil dash-profile pulponi-card profile-page">
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

                <ProfilePageCard title="Badges" meta={`${unlockedCount} / ${achievementsTotal}`}>
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

        <section id="reglas" className={sectionClass('reglas', 'panel')}>
          <div className="section-title">
            <div>
              <span className="eyebrow">Oficial</span>
              <h2>Reglas</h2>
            </div>
          </div>
          <div className="rules-accordion">
            <details open>
              <summary>Sistema de puntos</summary>
              <p>Marcador exacto (90&apos; + compensación): 3 puntos. Resultado correcto (ganador o empate): 1 punto. Sin predicción: 0 puntos.</p>
            </details>
            <details>
              <summary>Cómo funciona la quiniela</summary>
              <p>
                Antes de cada kickoff elige el marcador al 90&apos; (+ compensación). Solo cuenta el tiempo
                regular: tiempos extra y penales no cambian tu pick de marcador. En eliminatorias puedes
                indicar quién avanza en penales para un bonus extra.
              </p>
            </details>
            <details>
              <summary>Reglamento · Penales</summary>
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
          <RulesBadgesSection />
        </section>
      </main>

      {createPortal(
        <nav className="bottom-nav" aria-label="Navegación principal">
          <div className="bottom-nav__inner">
            {NAV.map((n) => (
              <a
                key={n.id}
                href={`#${n.id}`}
                className={`bottom-nav__item${activeNav === n.id ? ' is-active' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigateToSection(n.id);
                }}
              >
                <span className="bottom-nav__icon" aria-hidden>
                  {n.icon}
                </span>
                <span className="bottom-nav__label">{n.label}</span>
              </a>
            ))}
          </div>
        </nav>,
        document.body
      )}

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
