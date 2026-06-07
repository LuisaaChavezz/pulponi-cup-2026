import { decimalToAmerican } from './parlayCalculator';
import {
  collectMatchPickScores,
  getCommunityOutcomeStats,
} from './communityPicks';

const FAVORITE_ORDER = ['home', 'draw', 'away'];

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

/** Momio americano → decimal (interno). */
export function americanToDecimal(american) {
  const a = Math.round(Number(american));
  if (!Number.isFinite(a) || a === 0 || (a > -100 && a < 100)) return null;
  if (a >= 100) return roundOdd(1 + a / 100);
  return roundOdd(1 + 100 / Math.abs(a));
}

/** Tendencias casi iguales (p. ej. 33/33/33): sin favorito claro. */
export function isThreeWayTrendTie(homePct, drawPct, awayPct, tolerance = 2) {
  const max = Math.max(homePct, drawPct, awayPct);
  const min = Math.min(homePct, drawPct, awayPct);
  return max - min <= tolerance;
}

/** Favorita = mayor %; empate → prioridad local > empate > visitante. */
export function resolveFavoriteOutcome(homePct, drawPct, awayPct) {
  if (isThreeWayTrendTie(homePct, drawPct, awayPct)) {
    return { tie: true, key: null, pct: homePct };
  }

  const pcts = { home: homePct, draw: drawPct, away: awayPct };
  const maxPct = Math.max(homePct, drawPct, awayPct);
  for (const key of FAVORITE_ORDER) {
    if (pcts[key] === maxPct) return { tie: false, key, pct: maxPct };
  }

  return { tie: false, key: 'home', pct: homePct };
}

/** Momio americano negativo para la opción más probable. */
export function favoritePctToAmerican(pct) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  if (p >= 100) return -500;
  if (p >= 90) return -420;
  if (p >= 67) return Math.round(lerp(-200, -420, (p - 67) / 23));
  if (p >= 50) return Math.round(lerp(-110, -200, (p - 50) / 17));
  if (p >= 38) return Math.round(lerp(-105, -110, (p - 38) / 12));
  return -110;
}

/** Momio americano positivo para no favoritos. */
export function underdogPctToAmerican(pct, threeWayTie = false) {
  if (threeWayTie) return 180;

  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  if (p <= 0) return 350;
  if (p <= 8) return 320;
  if (p <= 15) return 300;
  if (p <= 22) return 280;
  if (p <= 30) return 220;
  if (p <= 38) return 250;
  return 200;
}

/**
 * Deriva 3 momios decimales desde % comunidad (local / empate / visitante).
 * La favorita siempre lleva momio americano negativo salvo empate triple.
 */
export function buildOddsFromTrendPcts(homePct, drawPct, awayPct) {
  const tie = isThreeWayTrendTie(homePct, drawPct, awayPct);
  if (tie) {
    const even = americanToDecimal(180);
    return { home: even, draw: even, away: even };
  }

  const favorite = resolveFavoriteOutcome(homePct, drawPct, awayPct);
  const pcts = { home: homePct, draw: drawPct, away: awayPct };

  const decimals = {};
  for (const key of FAVORITE_ORDER) {
    const american =
      key === favorite.key
        ? favoritePctToAmerican(favorite.pct)
        : underdogPctToAmerican(pcts[key], false);
    decimals[key] = americanToDecimal(american);
  }

  return decimals;
}

export function parlayOddsHaveFavorite(odds) {
  return FAVORITE_ORDER.some((key) => {
    const american = decimalToAmerican(odds?.[key]);
    return american != null && american < 0;
  });
}

/** Valida fila 1X2 antes de renderizar parlay. */
export function validateParlayMatchOdds(odds, trendPcts = null) {
  if (!odds) return false;

  for (const key of FAVORITE_ORDER) {
    const value = Number(odds[key]);
    if (!Number.isFinite(value) || value <= 1) return false;
  }

  const tie = trendPcts
    ? isThreeWayTrendTie(trendPcts.home, trendPcts.draw, trendPcts.away)
    : false;

  if (tie) return true;
  return parlayOddsHaveFavorite(odds);
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

function finalizeParlayOdds(raw, trendPcts = null) {
  let next = applyBookMargin(raw);

  if (validateParlayMatchOdds(next, trendPcts)) {
    return next;
  }

  const rebuilt = trendPcts
    ? buildOddsFromTrendPcts(trendPcts.home, trendPcts.draw, trendPcts.away)
    : {
        home: americanToDecimal(-110),
        draw: americanToDecimal(220),
        away: americanToDecimal(220),
      };

  next = applyBookMargin(rebuilt);

  if (!validateParlayMatchOdds(next, trendPcts) && !trendPcts) {
    next = applyBookMargin({
      home: americanToDecimal(-110),
      draw: americanToDecimal(220),
      away: americanToDecimal(220),
    });
  }

  return next;
}

/** Fallback sin tendencia: favorito ligero según seed del partido. */
export function buildTierFallbackOdds(match) {
  const id = String(match?.id ?? `${match?.home_team}-${match?.away_team}`);
  const favoriteKey = FAVORITE_ORDER[hashSeed(id) % FAVORITE_ORDER.length];

  const americans = { home: 220, draw: 220, away: 220 };
  americans[favoriteKey] = -110;

  const raw = {
    home: americanToDecimal(americans.home),
    draw: americanToDecimal(americans.draw),
    away: americanToDecimal(americans.away),
  };

  const { home, draw, away } = finalizeParlayOdds(raw, null);

  return {
    matchId: id,
    source: 'pulponi_simulated',
    sourceLabel: 'Momio Pulponi (estimado)',
    bookmaker: null,
    home,
    draw,
    away,
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

  const trendPcts = {
    home: stats.homePct,
    draw: stats.drawPct,
    away: stats.awayPct,
  };

  const raw = buildOddsFromTrendPcts(trendPcts.home, trendPcts.draw, trendPcts.away);
  const { home, draw, away } = finalizeParlayOdds(raw, trendPcts);

  return {
    matchId: id,
    source: 'pulponi_community',
    sourceLabel: 'Momio Pulponi (tendencia comunidad)',
    bookmaker: null,
    communityTotal: stats.total,
    trendPcts,
    home,
    draw,
    away,
  };
}

/** @deprecated Usar buildOddsFromTrendPcts — conservado por compatibilidad interna. */
export function communityPctToDecimalOdds(pct) {
  return americanToDecimal(favoritePctToAmerican(pct)) ?? 3.5;
}
