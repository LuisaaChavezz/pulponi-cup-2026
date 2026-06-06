import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { resolveAvatarUrl } from '../lib/avatars';
import { runScoringAndPulpoPipeline } from '../lib/pulpoSync';
import { isMatchFinished } from '../lib/matchUtils';
import { isFootballApiConfigured, syncWorldCupFixtures } from '../lib/footballApi';
import { normalizeMatchRow, normalizeMatches } from '../lib/normalizeMatch';
import { formatActivityLogMessage } from '../lib/activityMessages';
import {
  buildPredictionPublicMessage,
  formatActivityDisplayName,
  formatPredictionActivityMessage,
  isPredictionActivityAction,
} from '../lib/predictionActivity';

/** Máximo de filas cargadas desde activity_log (recientes + historial en UI). */
const PREDICTION_ACTIVITY_QUERY_LIMIT = 500;
import { isAllowedChatReactionEmoji } from '../constants/chatReactions';
import { ACHIEVEMENT_CATALOG } from '../data/achievements';
import {
  loadAchievementCatalog,
  loadUserAchievementIds,
  syncAllAchievements,
} from '../lib/achievementSync';

export function useAppData(session) {
  const userId = session?.user?.id;

  const [profile, setProfile] = useState(null);
  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
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
  const [achievementCatalog, setAchievementCatalog] = useState(ACHIEVEMENT_CATALOG);
  const [userAchievementIds, setUserAchievementIds] = useState([]);
  const [pendingUnlock, setPendingUnlock] = useState(null);

  const loadProfile = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) {
      setProfile(data);
      if (data.picks && typeof data.picks === 'object') setPicks(data.picks);
    }
  }, [userId]);

  const loadMatches = useCallback(async ({ finishLoading = true } = {}) => {
    const { data, error } = await supabase.from('matches').select('*').order('kickoff', { ascending: true });
    if (error) {
      console.warn('[loadMatches]', error?.message ?? error);
      if (finishLoading) setMatchesLoading(false);
      return 0;
    }
    let count = 0;
    if (data?.length) {
      const normalized = normalizeMatches(data);
      setMatches(normalized);
      count = normalized.length;
    } else {
      setMatches([]);
    }
    if (finishLoading || !isFootballApiConfigured()) {
      setMatchesLoading(false);
    }
    return count;
  }, []);

  const reloadMatches = useCallback(async () => {
    const n = await loadMatches({ finishLoading: true });
    setMatchesLoading(false);
    return n;
  }, [loadMatches]);

  const syncWorldCupAndReload = useCallback(async () => {
    if (!userId || syncInFlightRef.current) return;

    syncInFlightRef.current = true;
    setMatchesLoading(true);
    setMatchSyncNotice(null);

    let timeoutId;
    timeoutId = window.setTimeout(() => {
      setMatchesLoading(false);
      setMatchSyncNotice('No se pudo sincronizar, usando calendario provisional.');
    }, 8000);

    try {
      console.log('[SYNC START]');
      try {
        const result = await syncWorldCupFixtures();
        if (result?.skipped) {
          console.log('[SYNC]', 'skipped', result?.source ?? '', result?.existing ?? 0);
        }
      } catch (error) {
        console.warn('[SYNC]', error?.message ?? error);
      }
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
      try {
        const n = await reloadMatches();
        if (n > 0) setMatchSyncNotice(null);
        if (n > 0) await runScoringPipelineRef.current?.();
      } catch (e) {
        console.warn('[reloadMatches]', e?.message ?? e);
      }
      setMatchesLoading(false);
      syncInFlightRef.current = false;
    }
  }, [userId, reloadMatches]);

  const onFootballSynced = useCallback(async () => {
    await reloadMatches();
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

  const loadRanking = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, name, photo_url, points, exacts, streak')
        .order('points', { ascending: false });
      if (error) {
        console.warn('[loadRanking]', error.message);
        setRanking([]);
        return;
      }
      setRanking(data ?? []);
    } catch (e) {
      console.warn('[loadRanking]', e?.message ?? e);
      setRanking([]);
    }
  }, []);

  const loadCommunityPicks = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('profiles').select('id, username, name, photo_url, picks');
      if (error) {
        console.warn('[communityPicks]', error?.message ?? error);
        setCommunityPickProfiles([]);
        return [];
      }
      const rows = (data ?? []).filter(
        (r) => r?.picks && typeof r.picks === 'object' && Object.keys(r.picks).length > 0
      );
      setCommunityPickProfiles(rows);
      communityPickProfilesRef.current = rows;
      return rows;
    } catch (e) {
      console.warn('[communityPicks]', e?.message ?? e);
      setCommunityPickProfiles([]);
      return [];
    }
  }, []);

  const loadActivity = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('activity_log')
        .select('action, payload, created_at, profiles(username, photo_url)')
        .order('created_at', { ascending: false })
        .limit(8);

      if (error) {
        console.warn('[loadActivity]', error.message);
        setActivity([]);
        return;
      }

      const matchList = Array.isArray(matches) ? matches : [];
      const matchById = new Map(matchList.map((m) => [String(m.id), m]));

      if (data?.length) {
        setActivity(
          data.map((row) => ({
            text: formatActivityLogMessage(row, matchById) || 'Actividad reciente',
            avatarUrl: resolveAvatarUrl(row.profiles?.photo_url),
          }))
        );
      } else {
        setActivity([]);
      }
    } catch (e) {
      console.warn('[loadActivity]', e?.message ?? e);
      setActivity([]);
    }
  }, [matches]);

  const loadBadges = useCallback(async () => {
    try {
      const catalog = await loadAchievementCatalog(supabase);
      if (catalog?.length) setAchievementCatalog(catalog);

      const { data, error } = await supabase.from('badges').select(`
      id, name, description, icon,
      user_badges ( earned_at, profiles ( username, name ) )
    `);
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
      return;
    }
    const ids = await loadUserAchievementIds(supabase, userId);
    setUserAchievementIds(ids);
  }, [userId]);

  const syncAchievementsForProfiles = useCallback(
    async (profiles) => {
      if (!userId) return null;
      const previous = new Set(userAchievementIds);
      const result = await syncAllAchievements(supabase, {
        profiles,
        communityProfiles: communityPickProfiles,
        userId,
      });
      await refreshUserAchievements();
      await loadBadges();

      const fresh = await loadUserAchievementIds(supabase, userId);
      const newly = fresh.filter((id) => !previous.has(id));
      if (newly.length) {
        setPendingUnlock({ badgeId: newly[0] });
        loadActivity();
      }
      return result;
    },
    [userId, userAchievementIds, communityPickProfiles, refreshUserAchievements, loadBadges, loadActivity]
  );

  const runScoringPipeline = useCallback(
    async (matchList) => {
      if (!userId || scoringInFlightRef.current) return;
      const list = matchList ?? matchesRef.current;
      if (!list.some((m) => isMatchFinished(m))) return;

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
    console.log('[ACTIVITY]', type, safePayload);
    const { error } = await supabase.from('activity_log').insert({
      profile_id: userId,
      action: type,
      payload: safePayload,
    });
    if (error) console.error('[ACTIVITY] insert failed', error);
    else loadActivity();
  }

  const reloadReactionsForCommentIds = useCallback(async (commentIds) => {
    const uniq = [...new Set(commentIds)].filter(Boolean);
    if (!uniq.length) return;
    const { data, error } = await supabase.from('reactions').select(`
        id,
        comment_id,
        profile_id,
        emoji,
        created_at,
        profiles ( username, name, photo_url )
      `).in('comment_id', uniq);
    if (error) {
      console.error('[REACTION ERROR]', error);
      return;
    }

    const normalizeRow = (r) => {
      let prof = r.profiles && typeof r.profiles === 'object' ? r.profiles : null;
      if (Array.isArray(prof)) prof = prof[0] ?? null;
      return {
        id: r.id,
        comment_id: r.comment_id,
        profile_id: r.profile_id,
        emoji: r.emoji,
        username: prof?.username ?? null,
        displayName: prof?.name ?? null,
        photoUrl: prof?.photo_url ?? null,
        avatarUrl: resolveAvatarUrl(prof?.photo_url),
      };
    };

    const normalized = (data || []).map(normalizeRow);

    for (const cid of uniq) {
      const users = normalized
        .filter((r) => r.comment_id === cid)
        .map((r) => ({
          profile_id: r.profile_id,
          emoji: r.emoji,
          username: r.username,
          handle: r.username ? `@${r.username}` : '@anon',
        }));
      console.log('[REACTION USERS]', users);
    }

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
    const { data, error } = await supabase
      .from('comments')
      .select('id, body, created_at, profiles(username, name, photo_url)')
      .order('created_at', { ascending: true })
      .limit(80);

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

    setChatData(
      data.map((c) => ({
        id: c.id,
        user: c.profiles?.username ? `@${c.profiles.username}` : '@anon',
        photoUrl: c.profiles?.photo_url ?? null,
        avatarUrl: resolveAvatarUrl(c.profiles?.photo_url),
        time: new Date(c.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
        body: c.body,
      }))
    );

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
      const { data, error } = await supabase
        .from('activity_log')
        .select('profile_id, action, payload, created_at, profiles ( username, name, photo_url )')
        .in('action', [
          'prediction_created',
          'prediction_updated',
          'prediction_made',
          'prediction_changed',
        ])
        .order('created_at', { ascending: false })
        .limit(PREDICTION_ACTIVITY_QUERY_LIMIT);

      if (error) {
        console.warn('[loadPredictionFeeds]', error?.message ?? error);
        setPredictionActivityFeed([]);
        setPredictionActivityLog([]);
        return;
      }

      const rows = Array.isArray(data) ? data : [];
      const matchList = Array.isArray(matchesRef.current) ? matchesRef.current : [];
      const matchById = new Map(matchList.map((m) => [String(m.id), m]));

      const feed = rows
        .map((row, index) => {
          let prof = row?.profiles;
          if (Array.isArray(prof)) prof = prof[0];
          const at = row?.created_at ? new Date(row.created_at) : null;
          return {
            id: `${row?.profile_id ?? 'u'}-${row?.created_at ?? index}`,
            profile_id: row?.profile_id ?? null,
            text: formatPredictionActivityMessage(row, matchById) || 'Actividad de predicción',
            avatarUrl: resolveAvatarUrl(prof?.photo_url),
            at: at && !Number.isNaN(at.getTime()) ? at : null,
          };
        })
        .sort((a, b) => (b.at?.getTime?.() ?? 0) - (a.at?.getTime?.() ?? 0));

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
  ]);

  const loginBootstrapGenRef = useRef(0);
  const loadProfileRef = useRef(loadProfile);
  loadProfileRef.current = loadProfile;
  const syncWorldCupAndReloadRef = useRef(syncWorldCupAndReload);
  syncWorldCupAndReloadRef.current = syncWorldCupAndReload;
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

  // Login: una sola pasada por userId (evita re-sync por deps inestables / Strict Mode duplicado)
  useEffect(() => {
    if (!userId) {
      loginBootstrapGenRef.current = 0;
      return;
    }

    let cancelled = false;
    const gen = ++loginBootstrapGenRef.current;

    (async () => {
      await loadProfileRef.current();
      if (cancelled || gen !== loginBootstrapGenRef.current) return;
      await syncWorldCupAndReloadRef.current();
      if (cancelled || gen !== loginBootstrapGenRef.current) return;
      loadRankingRef.current();
      loadActivityRef.current();
      loadCommentsRef.current();
      loadBadgesRef.current();
      refreshUserAchievementsRef.current();
      loadEventsRef.current();
      await loadCommunityPicks();
      loadPredictionFeedsRef.current();
      void runScoringPipelineRef.current?.();
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, loadCommunityPicks]);

  useEffect(() => {
    if (!userId) return;

    const picksChannel = supabase
      .channel('profiles-picks-community')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        async () => {
          try {
            await loadCommunityPicks();
            void loadPredictionFeedsRef.current();
          } catch (e) {
            console.warn('[profiles-picks realtime]', e?.message ?? e);
          }
        }
      )
      .subscribe();

    const activityPredChannel = supabase
      .channel('activity-log-predictions')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activity_log' },
        (payload) => {
          const action = payload.new?.action;
          if (isPredictionActivityAction(action)) {
            void loadPredictionFeedsRef.current();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(picksChannel);
      supabase.removeChannel(activityPredChannel);
    };
  }, [userId, loadCommunityPicks]);

  useEffect(() => {
    if (!userId) return;

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
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('[REACTION ERROR]', new Error('reactions realtime CHANNEL_ERROR'));
        }
      });

    return () => {
      supabase.removeChannel(rxChannel);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('matches-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setMatches((prev) => prev.filter((m) => m.id !== payload.old.id));
            return;
          }
          if (payload.new) applyMatchRow(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, applyMatchRow]);

  async function savePick(matchId, homePick, awayPick, advancesTeam = null) {
    if (!userId) return { ok: false, error: 'Sin sesión' };
    const prevPick = picks[matchId];
    const hadPick = prevPick != null;
    const nowIso = new Date().toISOString();
    const entry = {
      home_pick: homePick,
      away_pick: awayPick,
      advances_team: advancesTeam,
      created_at: prevPick?.created_at ?? nowIso,
      updated_at: nowIso,
    };
    const nextPicks = { ...picks, [matchId]: entry };
    const updatePayload = { picks: nextPicks };
    const { error } = await supabase.from('profiles').update(updatePayload).eq('id', userId);
    let saved = false;
    if (error) {
      const { error: err2 } = await supabase.from('profiles').update({}).eq('id', userId);
      if (!err2) {
        setPicks(nextPicks);
        saved = true;
      }
      console.warn('picks column may need ALTER TABLE:', error.message);
      if (!saved) return { ok: false, error: error.message ?? 'No se pudo guardar' };
    } else {
      setPicks(nextPicks);
      saved = true;
    }

    const m = matches.find((x) => x.id === matchId);
    const pickAction = hadPick ? 'updated' : 'created';
    const actionType = hadPick ? 'prediction_updated' : 'prediction_created';
    const displayName = formatActivityDisplayName(profile);
    const public_message = buildPredictionPublicMessage(
      displayName,
      pickAction,
      m?.home_team,
      m?.away_team
    );

    await logActivityEvent(actionType, {
      match_id: matchId,
      home_team: m?.home_team ?? null,
      away_team: m?.away_team ?? null,
      pick_action: pickAction,
      public_message,
      created_at: entry.created_at,
      updated_at: entry.updated_at,
    });
    void loadPredictionFeedsRef.current();
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
          console.log('[REACTION DELETE]', { comment_id: commentId, profile_id: userId, emoji });
          const { error: delErr } = await supabase.from('reactions').delete().eq('id', existing.id);
          if (delErr) {
            console.error('[REACTION ERROR]', delErr);
            return;
          }
        } else {
          console.log('[REACTION INSERT]', { comment_id: commentId, profile_id: userId, emoji });
          const { error: insErr } = await supabase.from('reactions').insert({
            comment_id: commentId,
            profile_id: userId,
            emoji,
          });
          if (insErr) {
            console.error('[REACTION ERROR]', insErr);
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
    if (!userId) return;
    const { error } = await supabase.from('profiles').update(fields).eq('id', userId);
    if (!error) {
      await loadProfile();
      const act = options.activity;
      if (act?.type) {
        await logActivityEvent(act.type, act.payload ?? {});
      }
    }
    return error;
  }

  async function createEvent(event) {
    if (!userId || !profile?.is_admin) return { error: { message: 'No autorizado' } };
    const res = await supabase.from('events').insert({ ...event, created_by: userId });
    if (!res.error) await loadEvents();
    return res;
  }

  return {
    profile,
    matches,
    matchesLoading,
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
    loadCommunityPicks,
    savePick,
    sendComment,
    toggleReaction,
    reactionRowsByMessage,
    updateProfile,
    createEvent,
    refreshAll,
    setActivity,
    setPicks,
    achievementCatalog,
    userAchievementIds,
    pendingUnlock,
    dismissPendingUnlock: () => setPendingUnlock(null),
    refreshUserAchievements,
  };
}
