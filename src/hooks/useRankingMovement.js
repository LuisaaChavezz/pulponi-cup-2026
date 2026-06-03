import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  attachPositionMovement,
  buildRankedLeaderboard,
  getProfileRankingSummary,
} from '../lib/rankingHistory';
import {
  loadJornadaComparison,
  loadProfileHistoryRows,
  maybeCaptureRankingSnapshot,
} from '../lib/rankingSnapshot';

async function fetchLeaderboard() {
  return supabase
    .from('profiles')
    .select('id, username, name, photo_url, points, exacts, streak')
    .order('points', { ascending: false });
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

  const refresh = useCallback(async () => {
    if (!userId) return;

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
    const withMovement = attachPositionMovement(ranked, comparison.previousHistory);
    setRows(withMovement);

    const prevLabel = comparison.previousJornada?.label ?? comparison.latestJornada?.label ?? null;
    setJornadaLabel(prevLabel);

    const historyRows = await loadProfileHistoryRows(userId);
    setProfileSummary(getProfileRankingSummary(userId, withMovement, historyRows));
    setLoading(false);
  }, [userId]);

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
      await maybeCaptureRankingSnapshot();
      if (cancelled) return;
      await refresh();
    })();

    const channel = supabase
      .channel(`ranking-movement-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        async () => {
          await maybeCaptureRankingSnapshot();
          await refresh();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  const top5 = useMemo(() => rows.slice(0, 5), [rows]);
  const rest = useMemo(() => rows.slice(5), [rows]);

  return {
    rows,
    top5,
    rest,
    loading,
    tablesMissing,
    profileSummary,
    jornadaLabel,
    refresh,
  };
}
