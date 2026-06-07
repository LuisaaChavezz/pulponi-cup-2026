import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  sortMatchesByKickoffAsc,
} from './lib/matchUtils';
import { filterWorldCupMatches } from './lib/worldCupScope';
import {
  countMatchPredictionStatuses,
  filterMatchesForList,
  getMatchPredictionUiState,
  listMatchDayFilterOptions,
} from './lib/matchListFilters';
import { useMatchSync } from './hooks/useMatchSync';
import { useMobileViewport } from './hooks/useMobileViewport';
import MatchSchedule from './components/MatchSchedule';
import TeamLogo from './components/TeamLogo';
import HomeDashboard from './components/HomeDashboard';
import { HomeDashboardSkeleton, MatchesGridSkeleton } from './components/PulponiSkeleton';
import { ACHIEVEMENT_CATALOG, isAchievementUnlockedById, countAchievementsTotal, countAchievementsUnlocked } from './data/achievements';
import AchievementUnlockToast from './components/AchievementUnlockToast';
import UserPublicProfile from './components/UserPublicProfile';
import { usePublicProfile } from './hooks/usePublicProfile';
import { resolveAvatarUrl } from './lib/avatars';
import UserAvatar from './components/UserAvatar';
import HighlightsModal from './components/HighlightsModal';
import RankingLeaderboard from './components/RankingLeaderboard';
import RankingMovement from './components/RankingMovement';
import PulpoIndexCard from './components/PulpoIndexCard';
import MatchCommunityPrediction from './components/MatchCommunityPrediction';
import PickScoreInput from './components/PickScoreInput';
import { collectMatchPickScores, parsePickScore } from './lib/communityPicks';
import { validatePickScores } from './lib/pickScoreInput';
import { normalizeStoredHighlightList } from './lib/highlightsMapper';
import { buildRankedLeaderboard } from './lib/rankingHistory';
import { exportRankingPdf } from './lib/exportRankingPdf';

const ParlayPage = lazy(() => import('./pages/ParlayPage'));
const ComunidadPage = lazy(() => import('./pages/ComunidadPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const RulesPage = lazy(() => import('./pages/RulesPage'));

function PanelFallback({ label = 'Cargando…' }) {
  return <div className="panel-skeleton-fallback">{label}</div>;
}

const NAV = [
  { id: 'inicio', icon: '⌂', label: 'Inicio' },
  { id: 'partidos', icon: '⚽', label: 'Partidos' },
  { id: 'parlay', icon: '🎯', label: 'PARLAY' },
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
  const [matchSearchInput, setMatchSearchInput] = useState('');
  const [matchSearch, setMatchSearch] = useState('');
  const [matchStatusFilter, setMatchStatusFilter] = useState('all');
  const [matchDayFilter, setMatchDayFilter] = useState('all');
  const [matchPredictionFilter, setMatchPredictionFilter] = useState('all');

  const data = useAppData(session);
  const showRankingMovement = useMobileViewport(1023);
  const appRenderCountRef = useRef(0);
  appRenderCountRef.current += 1;

  function applyMatchSearch(value = matchSearchInput) {
    const trimmed = String(value ?? '').trim();
    setMatchSearchInput(trimmed);
    setMatchSearch(trimmed);
  }

  function handleMatchSearchInputChange(value) {
    setMatchSearchInput(value);
    setMatchSearch(value);
  }

  function handleMatchSearchSubmit(event) {
    event.preventDefault();
    applyMatchSearch();
  }

  const sortedRanking = useMemo(
    () => buildRankedLeaderboard(data.ranking ?? []),
    [data.ranking]
  );

  useEffect(() => {
    if (data.bootstrapReady) {
      console.log('[Pulponi Perf] Renders hasta fase 1:', appRenderCountRef.current);
    }
  }, [data.bootstrapReady]);

  useEffect(() => {
    if (activeNav === 'comunidad' && session?.user?.id) {
      void data.loadSecondaryData?.();
    }
  }, [activeNav, session?.user?.id, data.loadSecondaryData]);

  useEffect(() => {
    if ((activeNav === 'partidos' || activeNav === 'parlay') && session?.user?.id) {
      void data.ensureAllMatchesLoaded?.();
    }
  }, [activeNav, session?.user?.id, data.ensureAllMatchesLoaded]);

  const worldCupMatches = useMemo(() => {
    const list = filterWorldCupMatches(data.matches ?? []);
    return sortMatchesByKickoffAsc(list);
  }, [data.matches]);

  const matchDayOptions = useMemo(
    () => listMatchDayFilterOptions(worldCupMatches),
    [worldCupMatches]
  );

  const partidosBaseFiltered = useMemo(
    () =>
      filterMatchesForList(worldCupMatches, {
        search: matchSearch,
        status: matchStatusFilter,
        day: matchDayFilter,
        picks: data.picks,
      }),
    [worldCupMatches, matchSearch, matchStatusFilter, matchDayFilter, data.picks]
  );

  const filteredPartidos = useMemo(
    () =>
      filterMatchesForList(worldCupMatches, {
        search: matchSearch,
        status: matchStatusFilter,
        day: matchDayFilter,
        predictionStatus: matchPredictionFilter,
        picks: data.picks,
      }),
    [worldCupMatches, matchSearch, matchStatusFilter, matchDayFilter, matchPredictionFilter, data.picks]
  );

  const predictionStats = useMemo(
    () => countMatchPredictionStatuses(partidosBaseFiltered, data.picks),
    [partidosBaseFiltered, data.picks]
  );

  const sortedPartidos = useMemo(
    () => sortMatchesByKickoffAsc(filteredPartidos),
    [filteredPartidos]
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

  const myProfileView = usePublicProfile(activeNav === 'perfil' ? session?.user?.id ?? null : null, {
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
      const validated = validatePickScores(
        draft.home ?? data.picks[matchId]?.home_pick,
        draft.away ?? data.picks[matchId]?.away_pick
      );
      if (!validated.ok) {
        setPickFeedback(matchId, { type: 'error', message: validated.error });
        return;
      }
      const result = await data.savePick(
        matchId,
        validated.home,
        validated.away,
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

  const profileActivityRows =
    myProfileExtras.activity?.length
      ? myProfileExtras.activity
      : (data.activity ?? []).map((row, i) => ({
          id: `feed-${i}`,
          text: row.text,
          at: null,
        }));

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

  function renderMatchCard(m) {
    const locked = isPickLocked(m);
    const pick = data.picks[m.id];
    const draft = pickDrafts[m.id] ?? {};
    const status = displayMatchStatus(m);
    const finalLabel = finalScoreLabel(m);
    const communityScores = collectMatchPickScores(data.communityPickProfiles, m.id);
    const pickFeedback = pickSaveFeedback[m.id];
    const pickSaving = pickFeedback?.type === 'saving';
    const hasSavedPick = pick != null && parsePickScore(pick) != null;
    const predictionUiState = getMatchPredictionUiState(m, data.picks);
    const predictionBadge =
      predictionUiState === 'closed'
        ? { className: 'match-pick-badge match-pick-badge--closed', label: '🔒 Predicciones cerradas' }
        : predictionUiState === 'sent'
          ? { className: 'match-pick-badge match-pick-badge--sent', label: '✅ Predicción enviada' }
          : { className: 'match-pick-badge match-pick-badge--pending', label: '⚠️ Falta predicción' };

    const scoreLine = formatScoreLine(m);
    const homeLabel = displayTeamName(m.home_team) ?? '—';
    const awayLabel = displayTeamName(m.away_team) ?? '—';

    return (
      <article
        key={m.id}
        className={`match-card match-card--partidos match-card--pick-${predictionUiState}`}
      >
        <p className={predictionBadge.className} role="status">
          {predictionBadge.label}
        </p>
        <div className="match-card__meta">
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
                status === 'En vivo' || status === 'Medio tiempo' ? 'live-pill' : 'match-status-code'
              }
            >
              {status}
            </span>
          </header>
          <MatchSchedule match={m} showWeekday={false} />
        </div>
        <div className="match-teams-inline">
          <TeamLogo logo={m.home_logo} flag={m.home_flag} alt={m.home_team ?? ''} size="sm" />
          <span className="match-teams-inline__center">
            {scoreLine !== 'VS' ? (
              scoreLine
            ) : (
              <>
                <span className="match-teams-inline__home">{homeLabel}</span>
                <span className="match-teams-inline__vs">vs</span>
                <span className="match-teams-inline__away">{awayLabel}</span>
              </>
            )}
          </span>
          <TeamLogo logo={m.away_logo} flag={m.away_flag} alt={m.away_team ?? ''} size="sm" />
        </div>
        <div className="match-teams match-teams--card">
          <div className="match-team-cell match-team-cell--home">
            <TeamLogo logo={m.home_logo} flag={m.home_flag} alt={m.home_team ?? ''} size="sm" />
            {displayTeamName(m.home_team) ? (
              <span className="match-team-name">{m.home_team}</span>
            ) : null}
          </div>
          <strong className="match-score-center">{scoreLine}</strong>
          <div className="match-team-cell match-team-cell--away">
            <TeamLogo logo={m.away_logo} flag={m.away_flag} alt={m.away_team ?? ''} size="sm" />
            {displayTeamName(m.away_team) ? (
              <span className="match-team-name">{m.away_team}</span>
            ) : null}
          </div>
        </div>
        <MatchCommunityPrediction scores={communityScores} match={m} />
        <div className="match-card__pick-row">
          <div className="pick-inputs">
            <PickScoreInput
              disabled={locked}
              value={draft.home ?? pick?.home_pick ?? ''}
              onChange={(home) =>
                setPickDrafts((d) => ({
                  ...d,
                  [m.id]: { ...d[m.id], home },
                }))
              }
              ariaLabel={`Goles ${homeLabel}`}
            />
            <PickScoreInput
              disabled={locked}
              value={draft.away ?? pick?.away_pick ?? ''}
              onChange={(away) =>
                setPickDrafts((d) => ({
                  ...d,
                  [m.id]: { ...d[m.id], away },
                }))
              }
              ariaLabel={`Goles ${awayLabel}`}
            />
          </div>
          {locked ? (
            <button
              type="button"
              className="primary full pick-submit-btn pick-submit-btn--closed"
              disabled
            >
              Predicción cerrada
            </button>
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
        </div>
        {m.is_knockout ? (
          <select
            className="match-card__knockout-select"
            disabled={locked}
            value={draft.advances ?? pick?.advances_team ?? ''}
            onChange={(e) =>
              setPickDrafts((d) => ({
                ...d,
                [m.id]: { ...d[m.id], advances: e.target.value },
              }))
            }
          >
            <option value="">¿Quién avanza en penales?</option>
            <option value={m.home_team}>{m.home_team}</option>
            <option value={m.away_team}>{m.away_team}</option>
          </select>
        ) : null}
        {finalLabel ? <p className="match-final">{finalLabel}</p> : null}
      </article>
    );
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
            <UserAvatar avatarUrl={avatarUrl} variant="chat" alt="" />
          </button>
        </div>
      </header>

      <main className="app-shell">
        <section id="inicio" className={sectionClass('inicio', 'layout layout--dashboard')}>
          {activeNav === 'inicio' ? (
            !data.bootstrapReady && !worldCupMatches.length ? (
              <HomeDashboardSkeleton />
            ) : (
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
            )
          ) : null}
        </section>

        <section id="partidos" className={sectionClass('partidos', 'panel')}>
          {activeNav === 'partidos' ? (
            <>
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
          <div className="matches-toolbar">
            <div className="matches-toolbar__count-wrap">
              <p className="matches-toolbar__count">
                Mostrando {filteredPartidos.length} partido
                {filteredPartidos.length === 1 ? '' : 's'}
                {filteredPartidos.length !== worldCupMatches.length
                  ? ` de ${worldCupMatches.length}`
                  : ''}
              </p>
              <p className="matches-toolbar__stats">
                Pendientes: {predictionStats.pending} · Enviadas: {predictionStats.sent} · Cerradas:{' '}
                {predictionStats.closed}
              </p>
            </div>
            <form className="matches-toolbar__filters" onSubmit={handleMatchSearchSubmit} role="search">
              <input
                type="search"
                className="matches-toolbar__search matches-toolbar__filter--desktop-only"
                placeholder="Buscar equipo, sede o grupo…"
                value={matchSearchInput}
                onChange={(e) => handleMatchSearchInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applyMatchSearch();
                  }
                }}
                aria-label="Buscar partidos"
              />
              <select
                className="matches-toolbar__select matches-toolbar__filter--desktop-only"
                value={matchStatusFilter}
                onChange={(e) => setMatchStatusFilter(e.target.value)}
                aria-label="Filtrar por estado"
              >
                <option value="all">Todos los estados</option>
                <option value="upcoming">Próximos</option>
                <option value="live">En vivo</option>
                <option value="finished">Finalizados</option>
              </select>
              <select
                className="matches-toolbar__select"
                value={matchPredictionFilter}
                onChange={(e) => setMatchPredictionFilter(e.target.value)}
                aria-label="Filtrar por estado de predicción"
              >
                <option value="all">Todas las predicciones</option>
                <option value="pending">Pendientes</option>
                <option value="sent">Enviadas</option>
                <option value="closed">Cerradas</option>
              </select>
              <select
                className="matches-toolbar__select"
                value={matchDayFilter}
                onChange={(e) => setMatchDayFilter(e.target.value)}
                aria-label="Filtrar por fecha"
              >
                <option value="all">Todas las fechas</option>
                {matchDayOptions.map((dayKey) => (
                  <option key={dayKey} value={dayKey}>
                    {dayKey === 'sin-fecha'
                      ? 'Sin fecha'
                      : new Date(`${dayKey}T12:00:00`).toLocaleDateString('es-MX', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        })}
                  </option>
                ))}
              </select>
            </form>
          </div>
          {data.matchesLoading && !worldCupMatches.length ? (
            <MatchesGridSkeleton rows={6} />
          ) : null}
          {!data.matchesLoading && filteredPartidos.length === 0 ? (
            <p className="muted sync-footnote">
              {matchSearch.trim()
                ? 'No encontramos partidos con esa búsqueda.'
                : 'No hay partidos que coincidan con los filtros.'}
            </p>
          ) : (
            <div className="matches-grid matches-grid--continuous">
              {sortedPartidos.map((m) => renderMatchCard(m))}
            </div>
          )}
          {!data.matchesFullyLoaded ? (
            <p className="muted sync-footnote">Cargando más partidos en segundo plano…</p>
          ) : null}
            </>
          ) : null}
        </section>

        <section id="parlay" className={sectionClass('parlay', 'panel')}>
          {activeNav === 'parlay' ? (
            <Suspense fallback={<PanelFallback label="Cargando parlay…" />}>
              <ParlayPage
                matches={worldCupMatches}
                userId={session?.user?.id}
                username={profile?.username ?? session?.user?.email ?? ''}
                communityProfiles={data.communityPickProfiles ?? []}
              />
            </Suspense>
          ) : null}
        </section>

        <section id="ranking" className={sectionClass('ranking', 'panel')}>
          {activeNav === 'ranking' ? (
            viewProfileId ? (
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
                      Toca un jugador para abrir su perfil público. Exactos y rachas incluidos.
                    </p>
                  </div>
                  <div className="export-actions ranking-export-actions">
                    <button type="button" onClick={() => exportRankingPdf(sortedRanking)}>
                      Exportar ranking
                    </button>
                  </div>
                </div>
                <section className="ranking-section-pulpo pulponi-card phone" aria-label="Índice Pulpo">
                  <PulpoIndexCard
                    profile={profile}
                    picks={profile?.picks}
                    matches={worldCupMatches}
                    communityPickProfiles={data.communityPickProfiles ?? []}
                    userId={session?.user?.id}
                  />
                </section>
                {showRankingMovement ? (
                  <RankingMovement
                    session={session}
                    className="dash-ranking pulponi-card ranking-section-movement"
                  />
                ) : null}
                <RankingLeaderboard
                  rows={sortedRanking}
                  currentUserId={session?.user?.id}
                  onSelectUser={openUserProfile}
                />
              </>
            )
          ) : null}
        </section>

        <section id="comunidad" className={sectionClass('comunidad', 'panel')}>
          {activeNav === 'comunidad' ? (
            <Suspense fallback={<PanelFallback label="Cargando comunidad…" />}>
              <ComunidadPage
                ranking={data.ranking ?? []}
                chatMessages={data.chatData ?? []}
                chatInput={chatInput}
                setChatInput={setChatInput}
                onSendMessage={handleSendMessage}
                sessionUserId={session?.user?.id ?? null}
                reactionRowsByMessage={data.reactionRowsByMessage ?? {}}
                onToggleReaction={data.toggleReaction}
                events={data.events ?? []}
                predictionActivityFeed={data.predictionActivityFeed ?? []}
                predictionActivityLog={data.predictionActivityLog ?? []}
                matches={worldCupMatches ?? []}
                communityPickProfiles={data.communityPickProfiles ?? []}
                isAdmin={Boolean(data.profile?.is_admin)}
                onCreateImportantAlert={data.createEvent}
              />
            </Suspense>
          ) : null}
        </section>

        <section id="perfil" className={sectionClass('perfil', 'panel')}>
          {activeNav === 'perfil' ? (
            <Suspense fallback={<PanelFallback label="Cargando perfil…" />}>
              <ProfilePage
                avatarUrl={avatarUrl}
                displayUser={displayUser}
                displayName={displayName}
                myCurrentRank={myCurrentRank}
                profile={profile}
                profileEdit={profileEdit}
                onToggleProfileEdit={() => setProfileEdit(!profileEdit)}
                editName={editName}
                setEditName={setEditName}
                editUsername={editUsername}
                setEditUsername={setEditUsername}
                onSaveProfile={handleSaveProfile}
                onAvatarUpload={handleAvatarUpload}
                sessionUserId={session?.user?.id}
                myProfileExtras={myProfileExtras}
                unlockedAchievementIds={unlockedAchievementIds}
                achievementCatalog={achievementCatalog}
                achievementsTotal={achievementsTotal}
                unlockedCount={unlockedCount}
                myBadges={myBadges}
                activityRows={profileActivityRows}
                onViewAllAchievements={() => openUserProfile(session.user.id)}
                onSelectPreset={handleSelectPreset}
              />
            </Suspense>
          ) : null}
        </section>

        <section id="reglas" className={sectionClass('reglas', 'panel')}>
          {activeNav === 'reglas' ? (
            <Suspense fallback={<PanelFallback label="Cargando reglas…" />}>
              <RulesPage />
            </Suspense>
          ) : null}
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
