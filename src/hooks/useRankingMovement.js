import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchLeaderboardProfiles } from '../lib/leaderboardQuery';
import {
  attachPositionMovement,
  buildRankedLeaderboard,
  getProfileRankingSummary,
  leaderboardHasScoredPoints,
} from '../lib/rankingHistory';
import {
  loadJornadaComparison,
  loadProfileHistoryRows,
  maybeCaptureRankingSnapshot,
} from '../lib/rankingSnapshot';

async function fetchLeaderboard() {
  return fetchLeaderboardProfiles(supabase);
}

/** Canal realtime compartido para RankingMovement en la pestaña Ranking. */
const rankingRealtime = {
  channel: null,
  userId: null,
  listeners: new Set(),
};

async function notifyRankingRealtimeListeners() {
  try {
    await maybeCaptureRankingSnapshot();
  } catch (error) {
    console.warn('[useRankingMovement] snapshot after realtime', error?.message ?? error);
  }

  for (const listener of rankingRealtime.listeners) {
    try {
      await listener();
    } catch (error) {
      console.warn('[useRankingMovement] listener error', error?.message ?? error);
    }
  }
}

function teardownRankingRealtimeChannel() {
  if (!rankingRealtime.channel) return;
  try {
    supabase.removeChannel(rankingRealtime.channel);
  } catch (error) {
    console.warn('[useRankingMovement] removeChannel', error?.message ?? error);
  }
  rankingRealtime.channel = null;
  rankingRealtime.userId = null;
}

function ensureRankingRealtimeChannel(userId) {
  if (!userId) return;

  if (rankingRealtime.channel && rankingRealtime.userId !== userId) {
    teardownRankingRealtimeChannel();
  }

  if (rankingRealtime.channel) return;

  rankingRealtime.userId = userId;

  try {
    const channel = supabase
      .channel(`ranking-movement-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          void notifyRankingRealtimeListeners();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pick_scores' },
        () => {
          void notifyRankingRealtimeListeners();
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('[useRankingMovement] realtime CHANNEL_ERROR');
        }
      });

    rankingRealtime.channel = channel;
  } catch (error) {
    console.warn('[useRankingMovement] realtime setup failed', error?.message ?? error);
    rankingRealtime.channel = null;
    rankingRealtime.userId = null;
  }
}

function attachRankingRealtimeListener(userId, listener) {
  if (!userId || typeof listener !== 'function') return () => {};

  rankingRealtime.listeners.add(listener);
  ensureRankingRealtimeChannel(userId);

  return () => {
    rankingRealtime.listeners.delete(listener);
    if (rankingRealtime.listeners.size === 0) {
      teardownRankingRealtimeChannel();
    }
  };
}

/**
 * Leaderboard en vivo + movimiento vs jornada anterior en Supabase.
 */
export function useRankingMovement(session) {
  const userId = session?.user?.id;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tablesMissing, setTablesMissing] = useState(false);
  const [profileSummary, setProfileSummary] = useState(null);
  const [jornadaLabel, setJornadaLabel] = useState(null);
  const [movementActive, setMovementActive] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;

    try {
      const [{ data: profiles, error }, comparison] = await Promise.all([
        fetchLeaderboard(),
        loadJornadaComparison(),
      ]);

      if (error) {
        console.error('[useRankingMovement]', error);
        setRows([]);
        setLoading(false);
        return;
      }

      setTablesMissing(comparison.tablesMissing);

      const ranked = buildRankedLeaderboard(profiles ?? []);
      const scored = leaderboardHasScoredPoints(ranked);
      setMovementActive(scored);

      const withMovement = attachPositionMovement(ranked, comparison.previousHistory);
      setRows(withMovement);

      const prevLabel =
        scored && comparison.previousJornada?.label ? comparison.previousJornada.label : null;
      setJornadaLabel(prevLabel);

      const historyRows = await loadProfileHistoryRows(userId);
      setProfileSummary(getProfileRankingSummary(userId, withMovement, historyRows));
    } catch (error) {
      console.warn('[useRankingMovement] refresh failed', error?.message ?? error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!userId) {
      setRows([]);
      setProfileSummary(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        await maybeCaptureRankingSnapshot();
      } catch (error) {
        console.warn('[useRankingMovement] initial snapshot', error?.message ?? error);
      }
      if (cancelled) return;
      await refreshRef.current();
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;

    return attachRankingRealtimeListener(userId, () => refreshRef.current());
  }, [userId]);

  return {
    rows,
    loading,
    tablesMissing,
    profileSummary,
    jornadaLabel,
    movementActive,
    refresh,
  };
}
