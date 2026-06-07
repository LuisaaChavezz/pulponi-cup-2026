/** Mínimo de predicciones válidas en un partido para mostrar tendencia. */
export const MIN_COMMUNITY_PICKS = 3;

const INSUFFICIENT_MSG = 'Todavía no hay suficientes picks para calcular tendencia.';

export function getInsufficientMessage() {
  return INSUFFICIENT_MSG;
}

/** @param {unknown} pick */
export function parsePickScore(pick) {
  if (!pick || typeof pick !== 'object') return null;
  const h = Math.round(Number(pick.home_pick));
  const a = Math.round(Number(pick.away_pick));
  if (
    !Number.isFinite(h) ||
    !Number.isFinite(a) ||
    !Number.isInteger(h) ||
    !Number.isInteger(a) ||
    h < 0 ||
    a < 0
  ) {
    return null;
  }
  return { home: h, away: a };
}

export function outcomeFromScore(home, away) {
  if (home > away) return 'home';
  if (away > home) return 'away';
  return 'draw';
}

/**
 * @param {Array<{ id: string, picks?: Record<string, unknown> }>} profileRows
 * @param {string} matchId
 */
export function collectMatchPickScores(profileRows, matchId) {
  const scores = [];
  if (!matchId || !Array.isArray(profileRows)) return scores;

  for (const row of profileRows) {
    const pick = row.picks?.[matchId];
    const parsed = parsePickScore(pick);
    if (parsed) scores.push(parsed);
  }
  return scores;
}

/**
 * Picks de la comunidad + borrador del usuario (sin duplicar su fila guardada).
 * @param {string | undefined} userId
 */
export function collectThermometerScores(profileRows, matchId, userId, homePick, awayPick) {
  const others = userId ? profileRows.filter((r) => r.id !== userId) : profileRows;
  const scores = collectMatchPickScores(others, matchId);
  const draft = parsePickScore({ home_pick: homePick, away_pick: awayPick });
  if (draft) scores.push(draft);
  return scores;
}

/**
 * Predicción de la comunidad: % local / empate / visitante.
 * @param {Array<{ home: number, away: number }>} scores
 * @param {{ home_team?: string, away_team?: string }} match
 */
export function getCommunityOutcomeStats(scores, match) {
  const total = scores.length;
  if (total < MIN_COMMUNITY_PICKS) {
    return { sufficient: false, total, message: INSUFFICIENT_MSG };
  }

  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;

  for (const s of scores) {
    const o = outcomeFromScore(s.home, s.away);
    if (o === 'home') homeWins += 1;
    else if (o === 'away') awayWins += 1;
    else draws += 1;
  }

  const pct = (n) => Math.round((n / total) * 100);

  return {
    sufficient: true,
    total,
    homeLabel: match?.home_team ?? 'Local',
    awayLabel: match?.away_team ?? 'Visitante',
    homePct: pct(homeWins),
    drawPct: pct(draws),
    awayPct: pct(awayWins),
  };
}

/**
 * Termómetro Pulponi para un marcador concreto.
 * @param {Array<{ home: number, away: number }>} scores
 * @param {number} homePick
 * @param {number} awayPick
 */
export function getPickThermometer(scores, homePick, awayPick) {
  const total = scores.length;
  if (total < MIN_COMMUNITY_PICKS) {
    return { sufficient: false, total, message: INSUFFICIENT_MSG };
  }

  const h = Math.floor(Number(homePick));
  const a = Math.floor(Number(awayPick));
  if (!Number.isFinite(h) || !Number.isFinite(a) || h < 0 || a < 0) {
    return { sufficient: false, total, message: null };
  }

  const myOutcome = outcomeFromScore(h, a);
  let outcomeCount = 0;

  for (const s of scores) {
    if (outcomeFromScore(s.home, s.away) === myOutcome) outcomeCount += 1;
  }

  const outcomePct = Math.round((outcomeCount / total) * 100);

  if (outcomePct >= 40) {
    return {
      sufficient: true,
      kind: 'popular',
      emoji: '🔥',
      label: 'Alineado con la mayoría',
      detail: `${outcomePct}% de la comunidad eligió el mismo resultado general`,
      outcomePct,
      total,
    };
  }

  if (outcomePct <= 20) {
    return {
      sufficient: true,
      kind: 'uncommon',
      emoji: '🐙',
      label: 'Tendencia minoritaria',
      detail: `solo ${outcomePct}% comparte este resultado general`,
      outcomePct,
      total,
    };
  }

  return {
    sufficient: true,
    kind: 'neutral',
    emoji: '🐙',
    label: 'En la media',
    detail: `${outcomePct}% de la comunidad eligió el mismo resultado general`,
    outcomePct,
    total,
  };
}

function scoreKey(home, away) {
  return `${home}-${away}`;
}

function formatScoreLabel(home, away) {
  return `${home}-${away}`;
}

/**
 * Marcador exacto más repetido en la comunidad.
 * @param {Array<{ home: number, away: number }>} scores
 */
export function getMostChosenScore(scores) {
  if (!scores?.length) return null;

  const counts = new Map();
  for (const s of scores) {
    const key = scoreKey(s.home, s.away);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let bestKey = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestKey = key;
    }
  }

  if (!bestKey) return null;
  const [home, away] = bestKey.split('-').map((n) => Number(n));
  return {
    home,
    away,
    count: bestCount,
    label: formatScoreLabel(home, away),
  };
}

/**
 * Marcador exacto menos elegido (pick más arriesgado de la comunidad).
 * @param {Array<{ home: number, away: number }>} scores
 */
export function getRiskiestCommunityPick(scores) {
  if (!scores?.length || scores.length < MIN_COMMUNITY_PICKS) return null;

  const counts = new Map();
  for (const s of scores) {
    const key = scoreKey(s.home, s.away);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let riskyKey = null;
  let riskyCount = Infinity;
  for (const [key, count] of counts) {
    if (count < riskyCount) {
      riskyCount = count;
      riskyKey = key;
    }
  }

  if (!riskyKey) return null;
  const [home, away] = riskyKey.split('-').map((n) => Number(n));
  return {
    home,
    away,
    count: riskyCount,
    label: formatScoreLabel(home, away),
  };
}

/** Solo tendencia general (1X2 %), sin marcadores exactos ni picks individuales. */
export function buildCommunityGeneralInsights(scores, match) {
  return {
    outcome: getCommunityOutcomeStats(scores, match),
    total: scores?.length ?? 0,
  };
}

/**
 * @deprecated Usar buildCommunityGeneralInsights en UI pública.
 */
export function buildCommunityMatchInsights(scores, match) {
  return {
    ...buildCommunityGeneralInsights(scores, match),
    mostChosen: getMostChosenScore(scores),
    riskiest: getRiskiestCommunityPick(scores),
  };
}

export function hasSufficientCommunityTrends(scores, match) {
  return getCommunityOutcomeStats(scores, match).sufficient;
}

/** Partidos con al menos MIN_COMMUNITY_PICKS para mostrar tendencia general. */
export function listMatchesForCommunityTrends(profileRows, matches) {
  const list = Array.isArray(matches) ? matches : [];
  return list.filter((m) => {
    const scores = collectMatchPickScores(profileRows, m.id);
    return hasSufficientCommunityTrends(scores, m);
  });
}
