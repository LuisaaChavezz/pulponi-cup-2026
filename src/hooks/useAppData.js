import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { resolveAvatarUrl } from '../lib/avatars';
import { runScoringAndPulpoPipeline, refreshPulpoIndexesAfterPickScores } from '../lib/pulpoSync';
import { applyMatchFinalResultByTeams, applyMatchRescore } from '../lib/matchScoring';
import { canAdminExportPredictions } from '../lib/predictionActivity';
import { isMatchFinished, normalizeMatchId, resolveMatchForScoring } from '../lib/matchUtils';
import { syncWorldCupFixtures } from '../lib/footballApi';
import { filterWorldCupMatches } from '../lib/worldCupScope';
import { normalizeMatchRow, normalizeMatches } from '../lib/normalizeMatch';
import { formatActivityLogMessage } from '../lib/activityMessages';
import {
  loadRecentBadgeUnlockActivity,
  mapPredictionActivityRow,
  mergeActivityFeedItems,
} from '../lib/recentActivityFeed';
import {
  badgeUnlockNotificationKey,
  dismissNotification,
  isNotificationDismissed,
} from '../lib/dismissedNotifications';
import { fetchLeaderboardProfiles, fetchProfileById } from '../lib/leaderboardQuery';
import { enrichProfileWithPickScores, enrichProfilesWithPickScores } from '../lib/pickScoreStats';
import {
  buildPredictionPublicMessage,
  formatActivityDisplayName,
} from '../lib/predictionActivity';

/** Máximo de filas cargadas desde activity_log (recientes + historial en UI). */
const PREDICTION_ACTIVITY_QUERY_LIMIT = 500;
import { fetchCommunityComments, mapCommentRowToChatMessage } from '../lib/commentsLoad';
import { ensureKrakenPresentationMessage } from '../lib/krakenChatPost';
import { ACHIEVEMENT_CATALOG } from '../data/achievements';
import {
  loadAchievementCatalog,
  loadUserAchievementIds,
  loadUserBadgeRows,
  syncAllAchievements,
} from '../lib/achievementSync';
import { cacheGet, cacheSet, cacheInvalidate, cacheDelete } from '../lib/appCache';
import {
  BOOTSTRAP_READY_TIMEOUT_MS,
  markBootstrapStart,
  markBootstrapPhase,
  reportBootstrapDiagnostics,
  scheduleIdleWork,
  timedQuery,
  withTimeout,
} from '../lib/bootstrapPerf';

const MATCHES_CHUNK = 20;
const MATCHES_HARD_LIMIT = 4999;

const REACTION_SELECT = `
  id,
  comment_id,
  profile_id,
  emoji,
  created_at,
  profiles ( username, name, photo_url )
`;

function normalizeReactionRow(r) {
  let prof = r.profiles && typeof r.profiles === 'object' ? r.profiles : null;
  if (Array.isArray(prof)) prof = prof[0] ?? null;
  const commentId = r.comment_id ?? r.message_id ?? null;
  const profileId = r.profile_id ?? r.user_id ?? null;
  return {
    id: r.id,
    comment_id: commentId,
    profile_id: profileId,
    emoji: r.emoji,
    username: prof?.username ?? null,
    displayName: prof?.name ?? null,
    photoUrl: prof?.photo_url ?? null,
    avatarUrl: resolveAvatarUrl(prof?.photo_url),
  };
}

function mergeMatchesSorted(prev, incoming) {
  const map = new Map((prev ?? []).map((m) => [m.id, m]));
  for (const m of incoming ?? []) map.set(m.id, m);
  return [...map.values()].sort((a, b) => {
    const ta = a.kickoff ? new Date(a.kickoff).getTime() : 0;
    const tb = b.kickoff ? new Date(b.kickoff).getTime() : 0;
    return ta - tb;
  });
}

function normalizePicksKeys(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    out[String(key)] = value;
  }
  return out;
}

function sanitizeProfileFields(fields = {}) {
  const payload = { ...fields };
  if (payload.username != null) {
    const u = String(payload.username).trim().toLowerCase().replace(/^@+/, '');
    payload.username = u || null;
  }
  if (payload.name != null) {
    const n = String(payload.name).trim();
    payload.name = n || null;
  }
  return payload;
}

async function ensureOwnProfileRow(client, uid) {
  const { data: existing, error: readErr } = await client
    .from('profiles')
    .select('id')
    .eq('id', uid)
    .maybeSingle();

  console.log('QUERY RESULT ensureOwnProfileRow profiles.select id', existing, readErr);

  if (readErr) {
    if (readErr.code === '42501' || readErr.message?.includes('permission')) {
      console.warn('[ensureOwnProfileRow] RLS bloqueó lectura, no insertar', readErr);
      return { ok: false, error: readErr };
    }
    console.warn('[ensureOwnProfileRow] read', readErr);
    return { ok: false, error: readErr };
  }
  if (existing?.id) return { ok: true, created: false };

  console.log('QUERY BEFORE ensureOwnProfileRow profiles.insert', { uid });
  const { data, error } = await client
    .from('profiles')
    .insert({ id: uid })
    .select('*')
    .maybeSingle();

  console.log('QUERY RESULT ensureOwnProfileRow profiles.insert', data, error);

  if (error) {
    console.warn('[ensureOwnProfileRow] insert', error);
    return { ok: false, error };
  }

  console.log('[PROFILE SAVE RESULT] created missing profile row', data);
  return { ok: true, created: true, data };
}

export function useAppData(session) {
  const userId = session?.user?.id;

  const [profile, setProfile] = useState(null);
  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesFullyLoaded, setMatchesFullyLoaded] = useState(false);
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const [bootstrapError, setBootstrapError] = useState(null);
  const [bootstrapRetryKey, setBootstrapRetryKey] = useState(0);
  const matchesFullyLoadedRef = useRef(false);
  const loadingMoreMatchesRef = useRef(false);
  const loadAllMatchesPromiseRef = useRef(null);
  const [matchSyncNotice, setMatchSyncNotice] = useState(null);
  const syncInFlightRef = useRef(false);
  const scoringInFlightRef = useRef(false);
  const runScoringPipelineRef = useRef(null);
  const [picks, setPicks] = useState({});
  const [chatData, setChatData] = useState([]);
  const [activity, setActivity] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [badges, setBadges] = useState([]);
  const [events, setEvents] = useState([]);
  const [predictionActivityFeed, setPredictionActivityFeed] = useState([]);
  const [predictionActivityLog, setPredictionActivityLog] = useState([]);
  const matchesRef = useRef([]);
  const predictionActivityLogRef = useRef([]);
  const communityPickProfilesRef = useRef([]);
  const [reactionRowsByMessage, setReactionRowsByMessage] = useState({});
  /** Perfiles con picks para Termómetro / comunidad (Supabase real). */
  const [communityPickProfiles, setCommunityPickProfiles] = useState([]);
  /** Todos los perfiles visibles en Inicio (public.profiles). */
  const [communityProfiles, setCommunityProfiles] = useState([]);
  const [achievementCatalog, setAchievementCatalog] = useState(ACHIEVEMENT_CATALOG);
  const [userAchievementIds, setUserAchievementIds] = useState([]);
  const [userBadgeRows, setUserBadgeRows] = useState([]);
  const [pendingUnlock, setPendingUnlock] = useState(null);

  const loadProfile = useCallback(async () => {
    if (!userId) return null;

    console.log('[AUTH USER]', { id: userId, email: session?.user?.email ?? null });

    const cached = cacheGet(`profile:${userId}`);
    if (cached && (cached.username || cached.name)) {
      setProfile(cached);
      if (cached.picks && typeof cached.picks === 'object') {
        setPicks(normalizePicksKeys(cached.picks));
      }
    }

    await ensureOwnProfileRow(supabase, userId);

    const { data, error } = await fetchProfileById(supabase, userId, { source: 'profiles' });
    console.log('QUERY RESULT loadProfile profiles.select', data, error);
    if (error) {
      console.warn('[loadProfile]', error.message, error);
      return null;
    }
    if (!data) {
      console.warn('[loadProfile] sin fila de perfil para', userId);
      return null;
    }
    const normalizedPicks = normalizePicksKeys(data.picks);
    const row = { ...data, picks: normalizedPicks };
    const enriched = await enrichProfileWithPickScores(supabase, row, matchesRef.current ?? []);
    cacheSet(`profile:${userId}`, enriched, 120_000);
    setProfile(enriched);
    setPicks(normalizedPicks);
    return enriched;
  }, [userId, session?.user?.email]);

  const loadMatchesChunk = useCallback(
    async ({ offset = 0, limit = MATCHES_CHUNK, append = false, finishLoading = true } = {}) => {
      const { data, error } = await timedQuery(`matches[${offset}-${offset + limit - 1}]`, () =>
        supabase
          .from('matches')
          .select('*')
          .order('kickoff', { ascending: true })
          .range(offset, offset + limit - 1)
      );
      if (error) {
        console.warn('[loadMatchesChunk]', error?.message ?? error);
        if (finishLoading) setMatchesLoading(false);
        return 0;
      }
      const rows = data?.length ? filterWorldCupMatches(normalizeMatches(data)) : [];

      if (append) {
        setMatches((prev) => mergeMatchesSorted(prev, rows));
      } else {
        setMatches(rows);
        matchesRef.current = rows;
      }
      if (finishLoading) setMatchesLoading(false);
      return rows.length;
    },
    []
  );

  const loadAllMatchesComplete = useCallback(async (options = {}) => {
    const silent = Boolean(options.silent);
    if (loadAllMatchesPromiseRef.current) {
      return loadAllMatchesPromiseRef.current;
    }

    const promise = (async () => {
      if (!silent) {
        loadingMoreMatchesRef.current = true;
        setMatchesLoading(true);
      }
      try {
        const { data, error } = await timedQuery('matches:all', () =>
          supabase
            .from('matches')
            .select('*')
            .order('kickoff', { ascending: true })
            .range(0, MATCHES_HARD_LIMIT - 1)
        );
        if (error) {
          console.warn('[loadAllMatchesComplete]', error?.message ?? error);
          return matchesRef.current.length;
        }
        const rows = data?.length ? filterWorldCupMatches(normalizeMatches(data)) : [];

        if (rows.length) {
          setMatches(rows);
          matchesRef.current = rows;
        }

        matchesFullyLoadedRef.current = true;
        setMatchesFullyLoaded(true);
        return rows.length;
      } finally {
        if (!silent) {
          loadingMoreMatchesRef.current = false;
          setMatchesLoading(false);
        }
        loadAllMatchesPromiseRef.current = null;
      }
    })();

    loadAllMatchesPromiseRef.current = promise;
    return promise;
  }, []);

  const ensureAllMatchesLoaded = loadAllMatchesComplete;

  const reloadMatches = useCallback(async (options = {}) => {
    const silent = Boolean(options?.silent);
    loadAllMatchesPromiseRef.current = null;
    if (!silent) {
      matchesFullyLoadedRef.current = false;
      setMatchesFullyLoaded(false);
    }
    return loadAllMatchesComplete(silent ? { silent: true } : {});
  }, [loadAllMatchesComplete]);

  const reloadMatchesRef = useRef(reloadMatches);
  reloadMatchesRef.current = reloadMatches;

  const syncWorldCupBackground = useCallback(async () => {
    if (!userId || syncInFlightRef.current) return;

    syncInFlightRef.current = true;
    setMatchSyncNotice(null);

    let timeoutId;
    timeoutId = window.setTimeout(() => {
      setMatchSyncNotice('No se pudo sincronizar, usando calendario provisional.');
    }, 8000);

    try {
      console.log('[SYNC START]');
      try {
        const result = await timedQuery('syncWorldCup', () => syncWorldCupFixtures());
        if (result?.skipped) {
          console.log('[SYNC]', 'skipped', result?.source ?? '', result?.existing ?? 0);
        }
      } catch (error) {
        console.warn('[SYNC]', error?.message ?? error);
      }
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
      try {
        cacheInvalidate('matches:');
        matchesFullyLoadedRef.current = false;
        setMatchesFullyLoaded(false);
        const n = await loadMatchesChunk({
          offset: 0,
          limit: MATCHES_CHUNK,
          append: false,
          finishLoading: false,
        });
        if (n > 0) setMatchSyncNotice(null);
        void loadAllMatchesComplete();
        if (n > 0) await runScoringPipelineRef.current?.();
      } catch (e) {
        console.warn('[reloadMatches]', e?.message ?? e);
      }
      syncInFlightRef.current = false;
    }
  }, [userId, loadMatchesChunk, loadAllMatchesComplete]);

  const syncWorldCupAndReload = syncWorldCupBackground;

  const onFootballSynced = useCallback(async () => {
    await reloadMatches({ silent: true });
    const list = matchesRef.current ?? [];
    if (list.some((m) => isMatchFinished(m))) {
      await runScoringPipelineRef.current?.(list);
    }
  }, [reloadMatches]);

  const applyMatchRow = useCallback((row) => {
    if (!row?.id) return;
    const normalized = normalizeMatchRow(row);
    setMatches((prev) => {
      const idx = prev.findIndex((m) => m.id === normalized.id);
      const next = idx >= 0 ? [...prev] : [...prev, normalized];
      if (idx >= 0) next[idx] = { ...next[idx], ...normalized };
      const sorted = next.sort((a, b) => {
        const ta = a.kickoff ? new Date(a.kickoff).getTime() : 0;
        const tb = b.kickoff ? new Date(b.kickoff).getTime() : 0;
        return ta - tb;
      });
      if (isMatchFinished(normalized)) {
        void runScoringPipelineRef.current?.(sorted);
      }
      return sorted;
    });
  }, []);

  const applyMatchRowRef = useRef(applyMatchRow);
  applyMatchRowRef.current = applyMatchRow;

  const loadRanking = useCallback(async () => {
    cacheDelete('ranking');
    try {
      const { data, error } = await timedQuery('ranking', () => fetchLeaderboardProfiles(supabase));
      if (error) {
        console.warn('[loadRanking]', error.message);
        setRanking([]);
        return;
      }
      const rows = data ?? [];
      setRanking(rows);
    } catch (e) {
      console.warn('[loadRanking]', e?.message ?? e);
      setRanking([]);
    }
  }, []);

  const loadCommunityPicks = useCallback(async () => {
    const cached = cacheGet('community-picks');
    if (cached) {
      setCommunityPickProfiles(cached);
      communityPickProfilesRef.current = cached;
      return cached;
    }
    try {
      const { data, error } = await timedQuery('communityPicks', () =>
        supabase.from('profiles').select('id, username, name, photo_url, picks')
      );
      if (error) {
        console.warn('[communityPicks]', error?.message ?? error);
        setCommunityPickProfiles([]);
        return [];
      }
      const rows = (data ?? []).filter(
        (r) => r?.picks && typeof r.picks === 'object' && Object.keys(r.picks).length > 0
      );
      cacheSet('community-picks', rows, 90_000);
      setCommunityPickProfiles(rows);
      communityPickProfilesRef.current = rows;
      return rows;
    } catch (e) {
      console.warn('[communityPicks]', e?.message ?? e);
      setCommunityPickProfiles([]);
      return [];
    }
  }, []);

  const loadCommunityProfiles = useCallback(async () => {
    try {
      const { data, error } = await timedQuery('communityProfiles', () =>
        supabase
          .from('profiles')
          .select('id, username, name, photo_url, points')
          .order('username', { ascending: true, nullsFirst: false })
      );
      if (error) {
        console.warn('[loadCommunityProfiles]', error?.message ?? error);
        const fallback = await fetchLeaderboardProfiles(supabase);
        setCommunityProfiles(fallback.data ?? []);
        return fallback.data ?? [];
      }
      const rows = data ?? [];
      const enriched = await enrichProfilesWithPickScores(supabase, rows);
      setCommunityProfiles(enriched);
      return enriched;
    } catch (e) {
      console.warn('[loadCommunityProfiles]', e?.message ?? e);
      setCommunityProfiles([]);
      return [];
    }
  }, []);

  const loadActivity = useCallback(async () => {
    try {
      const { data, error } = await timedQuery('activity', () =>
        supabase
          .from('activity_log')
          .select('profile_id, action, payload, created_at, profiles(username, name, photo_url)')
          .order('created_at', { ascending: false })
          .limit(8)
      );

      if (error) {
        console.warn('[loadActivity]', error.message);
        setActivity([]);
        return;
      }

      const matchList = Array.isArray(matchesRef.current) ? matchesRef.current : [];
      const matchById = new Map(matchList.map((m) => [String(m.id), m]));

      if (data?.length) {
        setActivity(
          data.map((row) => {
            let prof = row.profiles;
            if (Array.isArray(prof)) prof = prof[0];
            return {
              text: formatActivityLogMessage(row, matchById) || 'Actividad reciente',
              avatarUrl: resolveAvatarUrl(prof?.photo_url),
            };
          })
        );
      } else {
        setActivity([]);
      }
    } catch (e) {
      console.warn('[loadActivity]', e?.message ?? e);
      setActivity([]);
    }
  }, []);

  const loadBadges = useCallback(async () => {
    try {
      const catalog = await loadAchievementCatalog(supabase);
      if (catalog?.length) setAchievementCatalog(catalog);

      const { data, error } = await supabase
        .from('badges')
        .select('id, name, description, icon');
      if (error) {
        console.warn('[loadBadges]', error.message);
        return;
      }
      if (data?.length) setBadges(data);
    } catch (e) {
      console.warn('[loadBadges]', e?.message ?? e);
    }
  }, []);

  const refreshUserAchievements = useCallback(async () => {
    if (!userId) {
      setUserAchievementIds([]);
      setUserBadgeRows([]);
      return;
    }
    const rows = await loadUserBadgeRows(supabase, userId);
    setUserBadgeRows(rows);
    setUserAchievementIds(rows.map((row) => row.badge_id));
  }, [userId]);

  const syncAchievementsForProfiles = useCallback(
    async (profiles, usernameOverride = null) => {
      if (!userId) return null;
      const username = usernameOverride ?? profile?.username ?? null;
      console.log('INTENTANDO DESBLOQUEAR LOGROS', { userId, username });
      const previous = new Set(await loadUserAchievementIds(supabase, userId));
      const result = await syncAllAchievements(supabase, {
        profiles,
        communityProfiles: communityPickProfiles,
        userId,
        username,
      });
      await refreshUserAchievements();
      await loadBadges();

      const fresh = await loadUserAchievementIds(supabase, userId);
      const newly = fresh.filter((id) => !previous.has(id));
      const firstNew = newly.find(
        (badgeId) => !isNotificationDismissed(badgeUnlockNotificationKey(userId, badgeId))
      );
      if (firstNew) {
        setPendingUnlock({ badgeId: firstNew });
        loadActivity();
        void loadPredictionFeedsRef.current?.();
      }
      return result;
    },
    [userId, profile?.username, communityPickProfiles, refreshUserAchievements, loadBadges, loadActivity]
  );

  const runScoringPipeline = useCallback(
    async (matchList) => {
      if (!userId || scoringInFlightRef.current) return;
      const list = matchList ?? matchesRef.current;
      const hasFinished = list.some((m) => isMatchFinished(m));

      if (!hasFinished) {
        await syncAchievementsForProfiles();
        return;
      }

      scoringInFlightRef.current = true;
      try {
        const result = await runScoringAndPulpoPipeline(supabase, {
          matches: list,
          captureRanking: true,
        });

        if (result?.profiles?.length) {
          setCommunityPickProfiles(
            result.profiles.filter(
              (r) => r.picks && typeof r.picks === 'object' && Object.keys(r.picks).length > 0
            )
          );
        }

        const me = result?.profiles?.find((p) => p.id === userId);
        if (me) {
          setProfile((prev) => ({ ...prev, ...me }));
        } else {
          await loadProfile();
        }

        cacheInvalidate('ranking');
        await loadRanking();
        await syncAchievementsForProfiles(result?.profiles);
        loadActivity();
      } catch (e) {
        console.warn('[scoringPipeline]', e?.message ?? e);
      } finally {
        scoringInFlightRef.current = false;
      }
    },
    [userId, loadProfile, loadRanking, loadActivity, syncAchievementsForProfiles]
  );

  runScoringPipelineRef.current = runScoringPipeline;

  async function logActivityEvent(type, payload = {}) {
    if (!userId) return;
    const safePayload = payload && typeof payload === 'object' ? payload : {};
    console.log('[AUTH USER]', { id: userId });
    console.log('[ACTIVITY]', type, safePayload);

    const { data: activityRows, error } = await supabase
      .from('activity_log')
      .insert({
        profile_id: userId,
        action: type,
        payload: safePayload,
      })
      .select('id, action, payload, created_at');

    console.log('QUERY RESULT activity_log.insert', activityRows, error);

    const data = activityRows?.[0] ?? null;
    if (error) {
      console.error('[ACTIVITY] insert failed', error);
      return { ok: false, error };
    }

    loadActivity();
    void loadPredictionFeedsRef.current?.();
    return { ok: true, data };
  }

  const reloadReactionsForCommentIds = useCallback(async (commentIds) => {
    const uniq = [...new Set(commentIds)].filter(Boolean);
    if (!uniq.length) return;
    const { data, error } = await supabase
      .from('reactions')
      .select(REACTION_SELECT)
      .in('comment_id', uniq);
    if (error) {
      console.error('[REACTION ERROR]', error);
      return;
    }

    const normalized = (data || []).map(normalizeReactionRow);

    setReactionRowsByMessage((prev) => {
      const next = { ...prev };
      for (const cid of uniq) {
        next[cid] = normalized.filter((r) => r.comment_id === cid);
      }
      return next;
    });
  }, []);

  const reloadReactionsRef = useRef(reloadReactionsForCommentIds);
  reloadReactionsRef.current = reloadReactionsForCommentIds;

  const loadComments = useCallback(async () => {
    await ensureKrakenPresentationMessage();
    const { data, error } = await timedQuery('comments', () => fetchCommunityComments(supabase));

    if (error) {
      console.error('[loadComments] comments query failed', error);
      setChatData([]);
      setReactionRowsByMessage({});
      return;
    }

    if (!data?.length) {
      setChatData([]);
      setReactionRowsByMessage({});
      return;
    }

    setChatData(data.map(mapCommentRowToChatMessage));

    const ids = data.map((c) => c.id);
    await reloadReactionsForCommentIds(ids);
  }, [reloadReactionsForCommentIds]);

  useEffect(() => {
    matchesRef.current = matches;
  }, [matches]);

  const loadEvents = useCallback(async () => {
    const { data, error } = await supabase.from('events').select('*').order('event_date', { ascending: false });
    if (error) {
      console.warn('[loadEvents]', error?.message ?? error);
      setEvents([]);
      return;
    }
    setEvents(data ?? []);
  }, []);

  useEffect(() => {
    predictionActivityLogRef.current = predictionActivityLog;
  }, [predictionActivityLog]);

  useEffect(() => {
    communityPickProfilesRef.current = communityPickProfiles;
  }, [communityPickProfiles]);

  const loadPredictionFeeds = useCallback(async () => {
    if (!userId) {
      setPredictionActivityFeed([]);
      setPredictionActivityLog([]);
      return;
    }
    try {
      const matchList = Array.isArray(matchesRef.current) ? matchesRef.current : [];
      const matchById = new Map(matchList.map((m) => [String(m.id), m]));

      const [predictionResult, badgeRows] = await Promise.all([
        timedQuery('predictionFeeds', () =>
          supabase
            .from('activity_log')
            .select('profile_id, action, payload, created_at, profiles ( username, name, photo_url )')
            .in('action', [
              'prediction_created',
              'prediction_updated',
              'prediction_made',
              'prediction_changed',
            ])
            .order('created_at', { ascending: false })
            .limit(PREDICTION_ACTIVITY_QUERY_LIMIT)
        ),
        loadRecentBadgeUnlockActivity(supabase, PREDICTION_ACTIVITY_QUERY_LIMIT),
      ]);

      const { data, error } = predictionResult;
      if (error) {
        console.warn('[loadPredictionFeeds]', error?.message ?? error);
        setPredictionActivityFeed([]);
        setPredictionActivityLog([]);
        return;
      }

      const rows = Array.isArray(data) ? data : [];
      const predictionItems = rows.map((row, index) => mapPredictionActivityRow(row, matchById, index));
      const feed = mergeActivityFeedItems(predictionItems, badgeRows).slice(0, PREDICTION_ACTIVITY_QUERY_LIMIT);

      setPredictionActivityFeed(feed);
      setPredictionActivityLog(rows);
    } catch (e) {
      console.warn('[loadPredictionFeeds]', e?.message ?? e);
      setPredictionActivityFeed([]);
      setPredictionActivityLog([]);
    }
  }, [userId]);

  const loadPredictionFeedsRef = useRef(loadPredictionFeeds);
  loadPredictionFeedsRef.current = loadPredictionFeeds;

  const refreshAll = useCallback(async () => {
    await loadProfile();
    await syncWorldCupAndReload();
    loadRanking();
    loadActivity();
    loadComments();
    loadBadges();
    loadEvents();
    await loadCommunityPicks();
    loadCommunityProfiles();
    loadPredictionFeeds();
  }, [
    loadProfile,
    syncWorldCupAndReload,
    loadRanking,
    loadActivity,
    loadComments,
    loadBadges,
    loadEvents,
    loadPredictionFeeds,
    loadCommunityPicks,
    loadCommunityProfiles,
  ]);

  const loginBootstrapGenRef = useRef(0);
  const loadProfileRef = useRef(loadProfile);
  loadProfileRef.current = loadProfile;
  const loadRankingRef = useRef(loadRanking);
  loadRankingRef.current = loadRanking;
  const loadActivityRef = useRef(loadActivity);
  loadActivityRef.current = loadActivity;
  const loadCommentsRef = useRef(loadComments);
  loadCommentsRef.current = loadComments;
  const loadBadgesRef = useRef(loadBadges);
  loadBadgesRef.current = loadBadges;
  const refreshUserAchievementsRef = useRef(refreshUserAchievements);
  refreshUserAchievementsRef.current = refreshUserAchievements;
  const loadEventsRef = useRef(loadEvents);
  loadEventsRef.current = loadEvents;
  const loadMatchesChunkRef = useRef(loadMatchesChunk);
  loadMatchesChunkRef.current = loadMatchesChunk;
  const loadAllMatchesCompleteRef = useRef(loadAllMatchesComplete);
  loadAllMatchesCompleteRef.current = loadAllMatchesComplete;
  const syncWorldCupBackgroundRef = useRef(syncWorldCupBackground);
  syncWorldCupBackgroundRef.current = syncWorldCupBackground;

  const syncAchievementsForProfilesRef = useRef(syncAchievementsForProfiles);
  syncAchievementsForProfilesRef.current = syncAchievementsForProfiles;

  const loadSecondaryData = useCallback(async () => {
    await Promise.all([
      loadCommunityPicks(),
      loadCommunityProfiles(),
      loadPredictionFeeds(),
      loadActivity(),
      loadBadges(),
      refreshUserAchievements(),
    ]);
    await syncAchievementsForProfilesRef.current?.();
    markBootstrapPhase('fase2');
    reportBootstrapDiagnostics('Fase 2 (secundaria)');
  }, [
    loadCommunityPicks,
    loadCommunityProfiles,
    loadPredictionFeeds,
    loadActivity,
    loadBadges,
    refreshUserAchievements,
  ]);

  const loadDeferredData = useCallback(async () => {
    await loadAllMatchesComplete();
    void syncWorldCupBackgroundRef.current?.();
    loadEventsRef.current?.();
    markBootstrapPhase('fase3');
    reportBootstrapDiagnostics('Fase 3 (resto)');
  }, [loadAllMatchesComplete]);

  const loadSecondaryDataRef = useRef(loadSecondaryData);
  loadSecondaryDataRef.current = loadSecondaryData;
  const loadDeferredDataRef = useRef(loadDeferredData);
  loadDeferredDataRef.current = loadDeferredData;

  const retryBootstrap = useCallback(() => {
    setBootstrapError(null);
    setBootstrapRetryKey((key) => key + 1);
  }, []);

  // Login: fase crítica primero; secundaria y resto en idle
  useEffect(() => {
    if (!userId) {
      loginBootstrapGenRef.current = 0;
      setBootstrapReady(false);
      setBootstrapError(null);
      matchesFullyLoadedRef.current = false;
      setMatchesFullyLoaded(false);
      return;
    }

    let cancelled = false;
    const gen = ++loginBootstrapGenRef.current;
    markBootstrapStart();
    setBootstrapReady(false);
    setBootstrapError(null);

    const finishBootstrap = ({ partial = false, message = null } = {}) => {
      if (cancelled || gen !== loginBootstrapGenRef.current) return;
      setBootstrapReady(true);
      setMatchesLoading(false);
      if (partial || message) {
        setBootstrapError(
          message ?? 'Algunos datos no cargaron a tiempo. Puedes reintentar sin cerrar sesión.'
        );
      } else {
        setBootstrapError(null);
      }
      markBootstrapPhase('fase1');
      reportBootstrapDiagnostics('Fase 1 (crítica)');
    };

    const safetyTimer = window.setTimeout(() => {
      console.warn('[bootstrap] safety timeout — showing app with partial data');
      finishBootstrap({ partial: true });
    }, BOOTSTRAP_READY_TIMEOUT_MS);

    (async () => {
      setMatchesLoading(matchesRef.current.length === 0);

      let bootProfile = null;
      let phaseError = null;
      try {
        const phaseResult = await withTimeout(
          Promise.all([
            timedQuery('profile', async () => {
              bootProfile = await loadProfileRef.current();
            }),
            timedQuery('ranking', () => loadRankingRef.current()),
            timedQuery('comments', () => loadCommentsRef.current()),
            timedQuery('communityProfiles', () => loadCommunityProfiles()),
            timedQuery('matches:initial', () =>
              loadMatchesChunkRef.current({
                offset: 0,
                limit: MATCHES_CHUNK,
                append: false,
                finishLoading: true,
              })
            ),
          ]),
          BOOTSTRAP_READY_TIMEOUT_MS - 500,
          'bootstrap:phase1'
        );
        if (phaseResult === undefined) {
          phaseError = 'La carga inicial tardó demasiado.';
        }
      } catch (e) {
        phaseError = e?.message ?? 'Error al cargar datos iniciales';
        console.warn('[bootstrap] phase1 error', phaseError);
      }

      if (cancelled || gen !== loginBootstrapGenRef.current) return;

      finishBootstrap(
        phaseError ? { partial: true, message: `${phaseError} Puedes reintentar.` } : {}
      );
      window.clearTimeout(safetyTimer);

      console.log('🚀 LLAMANDO ACHIEVEMENTS LOGIN');
      void timedQuery('achievements:login', () =>
        withTimeout(
          Promise.resolve(
            syncAchievementsForProfilesRef.current?.(undefined, bootProfile?.username ?? null)
          ),
          8000,
          'achievements:login'
        )
      );

      scheduleIdleWork(() => {
        if (cancelled || gen !== loginBootstrapGenRef.current) return;
        void loadSecondaryDataRef.current?.();
      });

      scheduleIdleWork(() => {
        if (cancelled || gen !== loginBootstrapGenRef.current) return;
        void loadDeferredDataRef.current?.();
      }, { delayMs: 400 });
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(safetyTimer);
    };
  }, [userId, bootstrapRetryKey]);

  useEffect(() => {
    if (!userId) return;

    const commentsChannel = supabase
      .channel('comments-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments' },
        () => {
          void loadCommentsRef.current?.();
        }
      )
      .subscribe();

    const rxChannel = supabase
      .channel('reactions-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reactions' },
        (payload) => {
          const cid = payload.new?.comment_id;
          if (cid) void reloadReactionsRef.current([cid]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'reactions' },
        (payload) => {
          const cid = payload.old?.comment_id;
          if (cid) void reloadReactionsRef.current([cid]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'reactions' },
        (payload) => {
          const cid = payload.new?.comment_id ?? payload.old?.comment_id;
          if (cid) void reloadReactionsRef.current([cid]);
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('[REACTION ERROR]', new Error('reactions realtime CHANNEL_ERROR'));
        }
      });

    const matchesChannel = supabase
      .channel('matches-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches' },
        (payload) => {
          if (payload.new) applyMatchRowRef.current?.(payload.new);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'matches' },
        (payload) => {
          if (payload.new) applyMatchRowRef.current?.(payload.new);
        }
      )
      .subscribe();

    const pickScoresChannel = supabase
      .channel('pick-scores-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pick_scores' },
        () => {
          void (async () => {
            const refresh = await refreshPulpoIndexesAfterPickScores(supabase, {
              matches: matchesRef.current,
            });
            void loadRankingRef.current?.();
            void loadProfileRef.current?.();
            void syncAchievementsForProfilesRef.current?.(refresh?.profiles);
          })();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(commentsChannel);
      supabase.removeChannel(rxChannel);
      supabase.removeChannel(matchesChannel);
      supabase.removeChannel(pickScoresChannel);
    };
  }, [userId]);

  // Al volver a la pestaña, traer kickoffs actualizados desde Supabase (sin caché local).
  useEffect(() => {
    if (!userId) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void reloadMatchesRef.current?.({ silent: true });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId]);

  async function savePick(matchId, homePick, awayPick, advancesTeam = null) {
    if (!userId) return { ok: false, error: 'Sin sesión' };

    const matchKey = String(matchId);
    const home = Math.round(Number(homePick));
    const away = Math.round(Number(awayPick));
    if (
      !Number.isFinite(home) ||
      !Number.isFinite(away) ||
      !Number.isInteger(home) ||
      !Number.isInteger(away) ||
      home < 0 ||
      away < 0
    ) {
      return { ok: false, error: 'Solo se permiten goles enteros (0, 1, 2…).' };
    }

    const prevPick = picks[matchKey] ?? picks[matchId];
    const hadPick = prevPick != null;
    const nowIso = new Date().toISOString();
    const entry = {
      home_pick: home,
      away_pick: away,
      advances_team: advancesTeam,
      created_at: prevPick?.created_at ?? nowIso,
      updated_at: nowIso,
    };
    const nextPicks = { ...normalizePicksKeys(picks), [matchKey]: entry };
    const updatePayload = { picks: nextPicks };

    console.log('[AUTH USER]', { id: userId, email: session?.user?.email ?? null });
    console.log('[PREDICTION SAVE PAYLOAD]', { profile_id: userId, match_id: matchKey, updatePayload });

    await ensureOwnProfileRow(supabase, userId);

    console.log('QUERY BEFORE savePick profiles.update', { userId, matchKey });

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ picks: nextPicks })
      .eq('id', userId);

    console.log('QUERY RESULT savePick profiles.update', null, updateError);

    if (updateError) {
      console.error('[savePick] update failed', updateError);
      return { ok: false, error: updateError.message ?? 'No se pudo guardar la predicción' };
    }

    cacheInvalidate(`profile:${userId}`);

    const { data: reloaded, error: reloadError } = await supabase
      .from('profiles')
      .select('id, picks, name, username, photo_url, points, exacts, streak')
      .eq('id', userId)
      .maybeSingle();

    console.log('QUERY RESULT savePick profiles.reload', reloaded, reloadError);

    if (reloadError) {
      return { ok: false, error: reloadError.message ?? 'No se pudo verificar la predicción' };
    }

    if (!reloaded) {
      console.error('[savePick] perfil no encontrado tras update', { userId, matchKey });
      return {
        ok: false,
        error:
          'No se pudo guardar: tu perfil no se actualizó. Ejecuta supabase/profiles_persistence_policies.sql en Supabase.',
      };
    }

    const persistedPicks = normalizePicksKeys(reloaded.picks ?? {});
    if (!persistedPicks[matchKey]) {
      console.error('[savePick] persistencia no confirmada para match', matchKey, persistedPicks);
      return {
        ok: false,
        error:
          'La predicción no persistió en Supabase (RLS UPDATE). Ejecuta supabase/profiles_persistence_policies.sql.',
      };
    }

    const row = { ...reloaded, picks: persistedPicks };
    setPicks(persistedPicks);
    setProfile((prev) => (prev ? { ...prev, ...row } : row));
    cacheSet(`profile:${userId}`, row, 120_000);

    console.log('[PREDICTION SAVE RESULT]', {
      profile_id: userId,
      match_id: matchKey,
      pick: persistedPicks[matchKey],
    });

    const m = matches.find((x) => String(x.id) === matchKey);
    const pickAction = hadPick ? 'updated' : 'created';
    const actionType = hadPick ? 'prediction_updated' : 'prediction_created';
    const displayName = formatActivityDisplayName(row);
    const public_message = buildPredictionPublicMessage(
      displayName,
      pickAction,
      m?.home_team,
      m?.away_team
    );

    const activityResult = await logActivityEvent(actionType, {
      match_id: matchKey,
      home_team: m?.home_team ?? null,
      away_team: m?.away_team ?? null,
      pick_action: pickAction,
      public_message,
      created_at: entry.created_at,
      updated_at: entry.updated_at,
    });

    if (activityResult?.error) {
      console.warn('[savePick] activity_log insert failed', activityResult.error);
    } else {
      setPredictionActivityFeed((prev) => {
        const optimistic = {
          id: `pick-${userId}-${matchKey}-${Date.now()}`,
          profile_id: userId,
          text: public_message,
          avatarUrl: resolveAvatarUrl(row.photo_url),
          at: new Date(),
        };
        return [optimistic, ...(prev ?? []).filter((item) => item.text !== optimistic.text)].slice(
          0,
          PREDICTION_ACTIVITY_QUERY_LIMIT
        );
      });
    }

    await loadPredictionFeedsRef.current?.();
    cacheInvalidate('community-picks');
    void loadCommunityPicks();
    return { ok: true, isUpdate: hadPick };
  }

  async function sendComment(body, matchId) {
    if (!userId || !body.trim()) return;
    const m = matches.find((x) => x.id === matchId);
    const { error } = await supabase.from('comments').insert({
      profile_id: userId,
      match_id: matchId,
      body: body.trim(),
    });
    if (error) {
      console.error('[sendComment] insert failed', error, { matchId });
      return;
    }
    await logActivityEvent('comment', {
      match_id: matchId,
      home_team: m?.home_team ?? null,
      away_team: m?.away_team ?? null,
      body: body.trim(),
    });
    loadComments();
  }

  const toggleReaction = useCallback(
    async (commentId, emoji) => {
      if (!userId) {
        console.warn('[toggleReaction] sin sesión');
        return;
      }
      if (!isAllowedChatReactionEmoji(emoji)) {
        console.warn('[toggleReaction] emoji no permitido', emoji);
        return;
      }

      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('toggle_comment_reaction', {
          p_comment_id: commentId,
          p_emoji: emoji,
        });

        if (!rpcErr) {
          if (rpcData?.action === 'added') {
            await logActivityEvent('chat_reaction', { comment_id: commentId, emoji });
          }
          await reloadReactionsForCommentIds([commentId]);
          return;
        }

        const rpcMissing =
          rpcErr.code === '42883' ||
          rpcErr.code === 'PGRST202' ||
          /toggle_comment_reaction/i.test(rpcErr.message ?? '');

        if (!rpcMissing) {
          if (rpcErr.code === '23505') {
            console.error(
              '[REACTION ERROR] UNIQUE incorrecto en reactions — ejecuta supabase/fix_reactions_unique_constraint.sql',
              rpcErr
            );
          } else {
            console.error('[REACTION ERROR]', rpcErr);
          }
          return;
        }

        const { data: existing, error: selErr } = await supabase
          .from('reactions')
          .select('id')
          .eq('comment_id', commentId)
          .eq('profile_id', userId)
          .eq('emoji', emoji)
          .maybeSingle();

        if (selErr) {
          console.error('[REACTION ERROR]', selErr);
          return;
        }

        if (existing?.id) {
          const { error: delErr } = await supabase.from('reactions').delete().eq('id', existing.id);
          if (delErr) {
            console.error('[REACTION ERROR]', delErr);
            return;
          }
        } else {
          const { error: insErr } = await supabase.from('reactions').insert({
            comment_id: commentId,
            profile_id: userId,
            emoji,
          });

          if (insErr) {
            if (insErr.code === '23505') {
              console.error(
                '[REACTION ERROR] UNIQUE incorrecto en reactions — ejecuta supabase/fix_reactions_unique_constraint.sql',
                insErr
              );
            } else {
              console.error('[REACTION ERROR]', insErr);
            }
            return;
          }
          await logActivityEvent('chat_reaction', { comment_id: commentId, emoji });
        }

        await reloadReactionsForCommentIds([commentId]);
      } catch (e) {
        console.error('[REACTION ERROR]', e);
      }
    },
    [userId, reloadReactionsForCommentIds]
  );

  async function updateProfile(fields, options = {}) {
    if (!userId) return { message: 'Sin sesión' };

    const payload = sanitizeProfileFields(fields);
    console.log('[AUTH USER]', { id: userId, email: session?.user?.email ?? null });
    console.log('[PROFILE SAVE PAYLOAD]', payload);

    await ensureOwnProfileRow(supabase, userId);

    console.log('QUERY BEFORE updateProfile profiles.update', { userId, payload });

    const { data: updatedRows, error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', userId)
      .select('*');

    console.log('QUERY RESULT updateProfile profiles.update', updatedRows, error);

    const data = updatedRows?.[0] ?? null;
    console.log('[PROFILE SAVE RESULT]', data, error);

    if (error) return error;
    if (!data) {
      return {
        message:
          'No se pudo guardar el perfil (0 filas). Ejecuta supabase/profiles_persistence_policies.sql en Supabase.',
      };
    }

    cacheInvalidate(`profile:${userId}`);
    if (data) {
      const row = { ...data, picks: normalizePicksKeys(data.picks) };
      cacheSet(`profile:${userId}`, row, 120_000);
      setProfile(row);
      if (row.picks) setPicks(row.picks);
    } else {
      await loadProfile();
    }

    const act = options.activity;
    if (act?.type) {
      await logActivityEvent(act.type, act.payload ?? {});
    }

    return null;
  }

  async function createEvent(event) {
    if (!userId || !profile?.is_admin) return { error: { message: 'No autorizado' } };
    const res = await supabase.from('events').insert({ ...event, created_by: userId });
    if (!res.error) await loadEvents();
    return res;
  }

  const applyManualMatchResult = useCallback(
    async (homeTeam, awayTeam, homeScore, awayScore, matchId, rescore = false) => {
      const allowed =
        profile?.is_admin || canAdminExportPredictions(profile?.username ?? null);
      if (!userId || !allowed) return { error: 'No autorizado' };

      const homeName = String(homeTeam ?? '').trim();
      const awayName = String(awayTeam ?? '').trim();
      if (!homeName || !awayName) return { error: 'teams_required' };

      const resolvedMatchId = normalizeMatchId(
        resolveMatchForScoring(matchId, matchesRef.current).dbId || matchId
      );
      if (!resolvedMatchId) return { error: 'match_id_required' };

      await loadAllMatchesComplete();

      try {
        const applyResult = rescore
          ? await applyMatchRescore(supabase, resolvedMatchId, homeScore, awayScore, {
              matches: matchesRef.current,
            })
          : await applyMatchFinalResultByTeams(
              supabase,
              homeName,
              awayName,
              homeScore,
              awayScore,
              {
                matchId: resolvedMatchId,
                matches: matchesRef.current,
                profiles: communityPickProfilesRef.current,
              }
            );

        if (applyResult?.error) return applyResult;

        cacheInvalidate('matches:');
        await loadAllMatchesComplete();

        const pipeline = await runScoringAndPulpoPipeline(supabase, {
          matches: matchesRef.current,
          captureRanking: true,
          skipScoring: true,
        });

        if (pipeline?.profiles?.length) {
          setCommunityPickProfiles(
            pipeline.profiles.filter(
              (r) => r.picks && typeof r.picks === 'object' && Object.keys(r.picks).length > 0
            )
          );
        }

        const me = pipeline?.profiles?.find((p) => p.id === userId);
        if (me) {
          setProfile((prev) => ({ ...prev, ...me }));
        } else {
          await loadProfile();
        }

        cacheInvalidate('ranking');
        await loadRanking();
        await syncAchievementsForProfiles(pipeline?.profiles);
        loadActivity();

        return {
          ...applyResult,
          score: pipeline?.score,
          pulpo: pipeline?.pulpo,
        };
      } catch (e) {
        console.warn('[applyManualMatchResult]', e?.message ?? e);
        return { error: e?.message ?? 'Error al puntuar' };
      }
    },
    [
      userId,
      profile?.is_admin,
      profile?.username,
      loadAllMatchesComplete,
      loadProfile,
      loadRanking,
      loadActivity,
      syncAchievementsForProfiles,
    ]
  );

  return {
    profile,
    matches,
    matchesLoading,
    matchesFullyLoaded,
    bootstrapReady,
    bootstrapError,
    retryBootstrap,
    ensureAllMatchesLoaded,
    loadSecondaryData,
    matchSyncNotice,
    applyMatchRow,
    reloadMatches,
    syncWorldCupAndReload,
    onFootballSynced,
    picks,
    chatData,
    activity,
    ranking,
    badges,
    events,
    predictionActivityFeed: predictionActivityFeed ?? [],
    predictionActivityLog: predictionActivityLog ?? [],
    loadPredictionFeeds,
    loadLatestPredictions: loadPredictionFeeds,
    communityPickProfiles,
    communityProfiles,
    loadCommunityPicks,
    loadCommunityProfiles,
    savePick,
    sendComment,
    toggleReaction,
    reactionRowsByMessage,
    updateProfile,
    createEvent,
    applyManualMatchResult,
    refreshAll,
    setActivity,
    setPicks,
    achievementCatalog,
    userAchievementIds,
    userBadgeRows,
    pendingUnlock,
    dismissPendingUnlock: () => {
      setPendingUnlock((current) => {
        if (current?.badgeId && userId) {
          dismissNotification(badgeUnlockNotificationKey(userId, current.badgeId));
        }
        return null;
      });
    },
    refreshUserAchievements,
  };
}
