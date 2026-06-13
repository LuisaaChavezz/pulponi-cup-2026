import { collectMatchPickScores, parsePickScore } from './communityPicks';
import { isMatchFinished } from './matchUtils';

/** Coeficientes fórmula inicial Índice Pulpo */
export const PULPO_WEIGHTS = {
  points: 2,
  exacts: 5,
  streak: 3,
  riskyHits: 8,
  /** Consistencia: 0–100% → hasta +25 pts antes del tope */
  consistencyDivisor: 4,
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

function matchFinalScore(match) {
  if (!match || !isMatchFinished(match)) return null;
  const h = match.home_score;
  const a = match.away_score;
  if (h == null || a == null) return null;
  if (!Number.isFinite(Number(h)) || !Number.isFinite(Number(a))) return null;
  return { home: Number(h), away: Number(a) };
}

function pickCorrectWinner(pick, final) {
  const ph = Number(pick.home);
  const pa = Number(pick.away);
  if (ph > pa && final.home > final.away) return true;
  if (pa > ph && final.away > final.home) return true;
  if (ph === pa && final.home === final.away) return true;
  return false;
}

function isExactPick(pick, final) {
  return Number(pick.home) === final.home && Number(pick.away) === final.away;
}

/** Pick arriesgado: marcador exacto poco común en la comunidad (≤15% o único). */
function wasRiskyPick(matchId, home, away, communityProfiles) {
  const all = collectMatchPickScores(communityProfiles, matchId);
  if (all.length < 3) return false;

  const exactCount = all.filter((s) => s.home === home && s.away === away).length;
  const exactPct = Math.round((exactCount / all.length) * 100);
  return exactCount <= 1 || exactPct <= 15;
}

/**
 * Métricas e índice Pulpo desde pick_scores (performanceStats) + picks/partidos para riesgo.
 * Siempre recalcula el índice; no usa pulpo_index=0 persistido como valor mostrado.
 */
export function computePulpoDerivedStats({
  profile,
  picks,
  matches,
  communityPickProfiles,
  userId: _userId,
  performanceStats = null,
}) {
  const fromPickScores = performanceStats != null && performanceStats.predicted != null;
  const points = Number(fromPickScores ? performanceStats.points : profile?.points ?? 0);
  const exacts = Number(fromPickScores ? performanceStats.exacts : profile?.exacts ?? 0);
  const streak = Number(fromPickScores ? performanceStats.streak : profile?.streak ?? 0);

  let riskyHits = 0;
  let graded = fromPickScores ? Number(performanceStats.predicted ?? 0) : 0;
  let correctWinners = fromPickScores ? Number(performanceStats.correctResults ?? 0) : 0;

  const pickMap = picks && typeof picks === 'object' ? picks : {};

  for (const match of matches ?? []) {
    if (!match?.id) continue;
    const final = matchFinalScore(match);
    if (!final) continue;

    const pick = parsePickScore(pickMap[match.id]);
    if (!pick) continue;

    if (!fromPickScores) {
      graded += 1;
      if (pickCorrectWinner(pick, final)) correctWinners += 1;
    }

    if (isExactPick(pick, final) && wasRiskyPick(match.id, pick.home, pick.away, communityPickProfiles)) {
      riskyHits += 1;
    }
  }

  const consistencyPct = graded > 0 ? Math.round((correctWinners / graded) * 100) : 0;
  const consistencyBonus = Math.round(consistencyPct / PULPO_WEIGHTS.consistencyDivisor);

  const raw =
    points * PULPO_WEIGHTS.points +
    exacts * PULPO_WEIGHTS.exacts +
    streak * PULPO_WEIGHTS.streak +
    riskyHits * PULPO_WEIGHTS.riskyHits +
    consistencyBonus;

  const index = Math.min(100, Math.max(0, Math.round(raw)));
  const level = getPulpoLevel(index);
  const storedStats =
    profile?.pulpo_stats && typeof profile.pulpo_stats === 'object' ? profile.pulpo_stats : null;

  return {
    index,
    level,
    points,
    exacts,
    streak,
    riskyHits,
    consistencyPct,
    consistencyBonus,
    gradedPicks: graded,
    raw: Math.round(raw),
    syncedAt: storedStats?.computed_at ?? null,
  };
}

export function formatPulpoIndexLine(stats) {
  if (!stats) return '🐙 Índice Pulpo: —';
  return `🐙 Índice Pulpo: ${stats.index}%`;
}
