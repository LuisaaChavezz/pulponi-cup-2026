import { useEffect, useState } from 'react';
import { getProfileRankingSummary, buildRankedLeaderboard, attachPositionMovement } from '../lib/rankingHistory';
import { loadJornadaComparison, loadProfileHistoryRows } from '../lib/rankingSnapshot';
import { fetchLeaderboardProfiles } from '../lib/leaderboardQuery';
import { supabase } from '../lib/supabase';

export default function ProfileRankingSummary({ userId }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setSummary(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      const [{ data: profiles }, comparison] = await Promise.all([
        fetchLeaderboardProfiles(supabase),
        loadJornadaComparison(),
      ]);

      if (cancelled) return;

      const ranked = buildRankedLeaderboard(profiles ?? []);
      const withMovement = attachPositionMovement(ranked, comparison.previousHistory);
      const historyRows = await loadProfileHistoryRows(userId);
      setSummary(getProfileRankingSummary(userId, withMovement, historyRows));
      setLoading(false);
    })();

    const channel = supabase
      .channel(`profile-ranking-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        void (async () => {
          const { data: profiles } = await fetchLeaderboardProfiles(supabase);
          const comparison = await loadJornadaComparison();
          const ranked = buildRankedLeaderboard(profiles ?? []);
          const withMovement = attachPositionMovement(ranked, comparison.previousHistory);
          const historyRows = await loadProfileHistoryRows(userId);
          if (!cancelled) setSummary(getProfileRankingSummary(userId, withMovement, historyRows));
        })();
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  if (loading) {
    return (
      <div className="profile-ranking-summary profile-ranking-summary--loading">
        <p className="profile-ranking-summary__muted">Cargando tu ranking…</p>
      </div>
    );
  }

  if (!summary) return null;

  const mov = summary.movement;
  const showMovement = summary.movementActive && mov?.direction !== 'none';
  const movClass =
    mov?.direction === 'up'
      ? 'profile-ranking-summary__change--up'
      : mov?.direction === 'down'
        ? 'profile-ranking-summary__change--down'
        : 'profile-ranking-summary__change--same';

  return (
    <div className="profile-ranking-summary" aria-label="Resumen de ranking">
      <p className="profile-ranking-summary__title">Tu ranking Pulponi</p>
      <div className="profile-ranking-summary__grid">
        <div className="profile-ranking-summary__cell">
          <b>{summary.currentRank != null ? `#${summary.currentRank}` : '—'}</b>
          <span>Posición actual</span>
        </div>
        <div className="profile-ranking-summary__cell">
          <b>{summary.bestRank != null ? `#${summary.bestRank}` : '—'}</b>
          <span>Mejor posición</span>
        </div>
        <div className="profile-ranking-summary__cell">
          <b className={showMovement ? movClass : undefined}>{showMovement ? mov?.lineLabel : '—'}</b>
          <span>Cambio reciente</span>
        </div>
        <div className="profile-ranking-summary__cell">
          <b>{summary.currentPoints}</b>
          <span>Puntos actuales</span>
        </div>
      </div>
      {!summary.movementActive ? (
        <p className="profile-ranking-summary__hint">
          El historial de posiciones comenzará cuando se registren los primeros puntos.
        </p>
      ) : !summary.hasHistory && summary.currentRank != null ? (
        <p className="profile-ranking-summary__hint">
          Tu historial de jornadas se irá guardando cuando cambie el ranking.
        </p>
      ) : null}
    </div>
  );
}
