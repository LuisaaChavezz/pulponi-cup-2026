export const PULPO_INDEX_WEIGHTS = {
  exactRate: 0.5,
  winnerRate: 0.3,
  streakMultiplier: 5,
  streakCap: 20,
};

export const PULPO_LEVELS = [
  { min: 86, max: 100, title: 'Pulpo Supremo', slug: 'supremo' },
  { min: 61, max: 85, title: 'Pulpo visionario', slug: 'visionario' },
  { min: 31, max: 60, title: 'Pulpo peligroso', slug: 'peligroso' },
  { min: 0, max: 30, title: 'Pulpo en entrenamiento', slug: 'entrenamiento' },
];

export function getPulpoLevel(index) {
  const n = Math.max(0, Math.min(100, Math.round(Number(index) || 0)));
  const tier = PULPO_LEVELS.find((t) => n >= t.min && n <= t.max) ?? PULPO_LEVELS[PULPO_LEVELS.length - 1];
  return { index: n, ...tier };
}

/**
 * Índice Pulpo:
 * exactos/ganadores/total desde pick_scores; racha_actual = profiles.streak
 * ROUND((exactos/total×100×0.5) + (ganadores/total×100×0.3) + LEAST(racha×5, 20))
 */
export function computePulpoIndexFromPickScores({
  exacts = 0,
  winners = 0,
  totalPicks = 0,
  currentStreak = 0,
} = {}) {
  const total = Number(totalPicks) || 0;
  if (total <= 0) return 0;

  const exactCount = Number(exacts) || 0;
  const winnerCount = Number(winners) || 0;
  const streak = Number(currentStreak) || 0;

  const exactTerm = (exactCount / total) * 100 * PULPO_INDEX_WEIGHTS.exactRate;
  const winnerTerm = (winnerCount / total) * 100 * PULPO_INDEX_WEIGHTS.winnerRate;
  const streakTerm = Math.min(
    streak * PULPO_INDEX_WEIGHTS.streakMultiplier,
    PULPO_INDEX_WEIGHTS.streakCap
  );

  const raw = exactTerm + winnerTerm + streakTerm;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

/**
 * Métricas e índice Pulpo desde pick_scores (performanceStats).
 */
export function computePulpoDerivedStats({
  profile,
  performanceStats = null,
}) {
  const fromPickScores = performanceStats != null && performanceStats.predicted != null;

  const points = Number(fromPickScores ? performanceStats.points : profile?.points ?? 0);
  const exacts = Number(fromPickScores ? performanceStats.exacts : profile?.exacts ?? 0);
  const winners = Number(fromPickScores ? performanceStats.correctResults : 0);
  const totalPicks = Number(fromPickScores ? performanceStats.predicted : 0);
  const streak = Number(profile?.streak ?? 0);

  const exactTerm =
    totalPicks > 0 ? Math.round((exacts / totalPicks) * 100 * PULPO_INDEX_WEIGHTS.exactRate) : 0;
  const winnerTerm =
    totalPicks > 0 ? Math.round((winners / totalPicks) * 100 * PULPO_INDEX_WEIGHTS.winnerRate) : 0;
  const streakTerm = Math.min(
    streak * PULPO_INDEX_WEIGHTS.streakMultiplier,
    PULPO_INDEX_WEIGHTS.streakCap
  );

  const index = fromPickScores
    ? computePulpoIndexFromPickScores({
        exacts,
        winners,
        totalPicks,
        currentStreak: streak,
      })
    : Math.min(100, Math.max(0, Math.round(Number(profile?.pulpo_index ?? 0))));

  const level = getPulpoLevel(index);
  const storedStats =
    profile?.pulpo_stats && typeof profile.pulpo_stats === 'object' ? profile.pulpo_stats : null;

  return {
    index,
    level,
    points,
    exacts,
    winners,
    totalPicks,
    streak,
    exactTerm,
    winnerTerm,
    streakTerm,
    raw: exactTerm + winnerTerm + streakTerm,
    syncedAt: storedStats?.computed_at ?? null,
  };
}

export function formatPulpoIndexLine(stats) {
  if (!stats) return '🐙 Índice Pulpo: —';
  return `🐙 Índice Pulpo: ${stats.index}%`;
}
