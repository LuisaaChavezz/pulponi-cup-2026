import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { resolveAvatarUrl } from '../lib/avatars';
import { DEMO_ACTIVITY, DEMO_CHAT, DEMO_MATCHES } from '../data/demoData';
import { isFootballApiConfigured, syncWorldCupFixtures } from '../lib/footballApi';
import { normalizeMatchRow, normalizeMatches } from '../lib/normalizeMatch';
import { formatActivityLogMessage } from '../lib/activityMessages';
import { isAllowedChatReactionEmoji } from '../constants/chatReactions';

export function useAppData(session) {
  const userId = session?.user?.id;

  const [profile, setProfile] = useState(null);
  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchSyncNotice, setMatchSyncNotice] = useState(null);
  const syncInFlightRef = useRef(false);
  const [picks, setPicks] = useState({});
  const [chatData, setChatData] = useState(DEMO_CHAT);
  const [activity, setActivity] = useState(DEMO_ACTIVITY);
  const [ranking, setRanking] = useState([]);
  const [badges, setBadges] = useState([]);
  const [events, setEvents] = useState([]);
  const [latestPredictions, setLatestPredictions] = useState([]);
  const matchesRef = useRef([]);
  const [reactionRowsByMessage, setReactionRowsByMessage] = useState({});

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
    } else if (!isFootballApiConfigured()) {
      const demo = normalizeMatches(DEMO_MATCHES);
      setMatches(demo);
      count = demo.length;
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
      return next.sort((a, b) => {
        const ta = a.kickoff ? new Date(a.kickoff).getTime() : 0;
        const tb = b.kickoff ? new Date(b.kickoff).getTime() : 0;
        return ta - tb;
      });
    });
  }, []);

  const loadRanking = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, username, name, photo_url, points, exacts, streak')
      .order('points', { ascending: false })
      .limit(20);
    setRanking(data ?? []);
  }, []);

  const loadActivity = useCallback(async () => {
    const { data } = await supabase
      .from('activity_log')
      .select('action, payload, created_at, profiles(username, photo_url)')
      .order('created_at', { ascending: false })
      .limit(8);

    const matchById = new Map(matches.map((m) => [m.id, m]));

    if (data?.length) {
      setActivity(
        data.map((row) => ({
          text: formatActivityLogMessage(row, matchById),
          avatarUrl: resolveAvatarUrl(row.profiles?.photo_url),
        }))
      );
    }
  }, [matches]);

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

  const loadBadges = useCallback(async () => {
    const { data } = await supabase.from('badges').select(`
      id, name, description, icon,
      user_badges ( earned_at, profiles ( username, name ) )
    `);
    if (data?.length) setBadges(data);
  }, []);

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

  const loadLatestPredictions = useCallback(async () => {
    if (!userId) {
      setLatestPredictions([]);
      return;
    }
    const { data, error } = await supabase
      .from('activity_log')
      .select('profile_id, action, payload, created_at, profiles ( username, name, photo_url )')
      .in('action', ['prediction_made', 'prediction_changed'])
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      console.warn('[loadLatestPredictions]', error?.message ?? error);
      setLatestPredictions([]);
      return;
    }
    const matchById = new Map(matchesRef.current.map((m) => [String(m.id), m]));
    const seen = new Set();
    const out = [];
    for (const row of data || []) {
      const pid = row.profile_id;
      if (!pid || seen.has(pid)) continue;
      seen.add(pid);
      let prof = row.profiles;
      if (Array.isArray(prof)) prof = prof[0];
      const p = row.payload && typeof row.payload === 'object' ? row.payload : {};
      const mid = p.match_id != null ? String(p.match_id) : null;
      const m = mid ? matchById.get(mid) : null;
      const home = p.home_team ?? m?.home_team ?? 'Local';
      const away = p.away_team ?? m?.away_team ?? 'Visitante';
      const hp = p.home_pick;
      const ap = p.away_pick;
      const adv = p.advances_team;
      const whenRaw = p.updated_at || row.created_at;
      const at = whenRaw ? new Date(whenRaw) : new Date(row.created_at);
      out.push({
        profile_id: pid,
        username: prof?.username ?? null,
        name: prof?.name ?? null,
        photoUrl: prof?.photo_url ?? null,
        avatarUrl: resolveAvatarUrl(prof?.photo_url),
        matchId: mid,
        matchLabel: `${home} vs ${away}`,
        home_pick: hp,
        away_pick: ap,
        scoreLabel: hp != null && ap != null ? `${hp}–${ap}` : '—',
        advances_team: adv != null && String(adv).trim() ? String(adv).trim() : null,
        at,
      });
    }
    out.sort((a, b) => (a.username || '').localeCompare(b.username || '', 'es', { sensitivity: 'base' }));
    setLatestPredictions(out);
  }, [userId]);

  const loadLatestPredictionsRef = useRef(loadLatestPredictions);
  loadLatestPredictionsRef.current = loadLatestPredictions;

  const refreshAll = useCallback(async () => {
    await loadProfile();
    await syncWorldCupAndReload();
    loadRanking();
    loadActivity();
    loadComments();
    loadBadges();
    loadEvents();
    loadLatestPredictions();
  }, [
    loadProfile,
    syncWorldCupAndReload,
    loadRanking,
    loadActivity,
    loadComments,
    loadBadges,
    loadEvents,
    loadLatestPredictions,
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
      loadEventsRef.current();
      loadLatestPredictionsRef.current();
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

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
    if (!userId) return;
    const entry = {
      home_pick: homePick,
      away_pick: awayPick,
      advances_team: advancesTeam,
      updated_at: new Date().toISOString(),
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
    } else {
      setPicks(nextPicks);
      saved = true;
    }

    if (!saved) return;

    const m = matches.find((x) => x.id === matchId);
    const hadPick = picks[matchId] != null;
    await logActivityEvent(hadPick ? 'prediction_changed' : 'prediction_made', {
      match_id: matchId,
      home_team: m?.home_team ?? null,
      away_team: m?.away_team ?? null,
      ...entry,
    });
    void loadLatestPredictionsRef.current();
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
    latestPredictions,
    loadLatestPredictions,
    savePick,
    sendComment,
    toggleReaction,
    reactionRowsByMessage,
    updateProfile,
    createEvent,
    refreshAll,
    setActivity,
    setPicks,
  };
}
