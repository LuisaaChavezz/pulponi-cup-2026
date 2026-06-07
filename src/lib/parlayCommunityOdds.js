import {
  collectMatchPickScores,
  getCommunityOutcomeStats,
} from './communityPicks';

function roundOdd(n) {
  return Math.round(n * 100) / 100;
}

function lerp(min, max, t) {
  const x = Math.max(0, Math.min(1, t));
  return min + (max - min) * x;
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Convierte % de tendencia comunidad a momio decimal acotado (estilo casa real). */
export function communityPctToDecimalOdds(pct) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));

  if (p >= 55) return roundOdd(lerp(1.5, 1.2, (p - 55) / 45));
  if (p >= 40) return roundOdd(lerp(2.2, 1.5, (p - 40) / 15));
  if (p >= 15) return roundOdd(lerp(3.5, 2.2, (p - 15) / 25));
  return 3.5;
}

/** Aplica margen de casa (~7%) sin superar 3.50 en ningún outcome. */
export function applyBookMargin(odds, targetOverround = 1.07) {
  const capped = {
    home: Math.min(3.5, odds.home),
    draw: Math.min(3.5, odds.draw),
    away: Math.min(3.5, odds.away),
  };
  const sum = 1 / capped.home + 1 / capped.draw + 1 / capped.away;
  if (sum >= targetOverround) return capped;
  const scale = targetOverround / sum;
  return {
    home: roundOdd(Math.min(3.5, capped.home / scale)),
    draw: roundOdd(Math.min(3.5, capped.draw / scale)),
    away: roundOdd(Math.min(3.5, capped.away / scale)),
  };
}

/** Fallback cuando no hay tendencia: tiers realistas, sin momios inflados. */
export function buildTierFallbackOdds(match) {
  const id = String(match?.id ?? `${match?.home_team}-${match?.away_team}`);
  const h = hashSeed(id);
  const homeStrength = h % 100;
  const awayStrength = (h >> 8) % 100;
  const drawBias = (h >> 16) % 40;

  let home;
  let draw;
  let away;

  if (homeStrength > awayStrength + 18) {
    home = lerp(1.2, 1.5, homeStrength / 100);
    away = lerp(2.8, 3.5, (100 - awayStrength) / 100);
    draw = lerp(2.8, 3.4, drawBias / 40);
  } else if (awayStrength > homeStrength + 18) {
    away = lerp(1.2, 1.5, awayStrength / 100);
    home = lerp(2.8, 3.5, (100 - homeStrength) / 100);
    draw = lerp(2.8, 3.4, drawBias / 40);
  } else {
    home = lerp(2.2, 3.0, homeStrength / 100);
    away = lerp(2.2, 3.0, awayStrength / 100);
    draw = lerp(2.5, 3.5, drawBias / 40);
  }

  const withMargin = applyBookMargin({ home, draw, away });

  return {
    matchId: id,
    source: 'pulponi_simulated',
    sourceLabel: 'Momio Pulponi (estimado)',
    bookmaker: null,
    ...withMargin,
  };
}

/** Momios 1X2 derivados de picks de la comunidad. */
export function buildCommunityTrendOdds(match, communityProfiles = []) {
  const id = String(match?.id ?? `${match?.home_team}-${match?.away_team}`);
  const scores = collectMatchPickScores(communityProfiles, id);
  const stats = getCommunityOutcomeStats(scores, match);

  if (!stats.sufficient) {
    return buildTierFallbackOdds(match);
  }

  const raw = {
    home: communityPctToDecimalOdds(stats.homePct),
    draw: communityPctToDecimalOdds(stats.drawPct),
    away: communityPctToDecimalOdds(stats.awayPct),
  };
  const withMargin = applyBookMargin(raw);

  return {
    matchId: id,
    source: 'pulponi_community',
    sourceLabel: 'Momio Pulponi (tendencia comunidad)',
    bookmaker: null,
    communityTotal: stats.total,
    ...withMargin,
  };
}
