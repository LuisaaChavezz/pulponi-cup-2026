/** Mínimo de predicciones válidas en un partido para mostrar tendencia. */
export const MIN_COMMUNITY_PICKS = 3;

const INSUFFICIENT_MSG = 'Todavía no hay suficientes picks para calcular tendencia.';

export function getInsufficientMessage() {
  return INSUFFICIENT_MSG;
}

/** @param {unknown} pick */
export function parsePickScore(pick) {
  if (!pick || typeof pick !== 'object') return null;
  const h = Math.round(Number(pick.home_pick ?? pick.home ?? pick.local));
  const a = Math.round(Number(pick.away_pick ?? pick.away ?? pick.visitante));
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

/**
 * Predicción de penales de un pick (solo válida si trae ganador o marcador).
 * @param {unknown} pick
 * @returns {{ winner: string|null, home: number|null, away: number|null } | null}
 */
export function parsePenaltyPick(pick) {
  if (!pick || typeof pick !== 'object') return null;
  const winner = String(pick.penalty_winner ?? '').trim() || null;
  const rawHome = pick.penalty_home;
  const rawAway = pick.penalty_away;
  const home = rawHome === '' || rawHome == null ? null : Math.round(Number(rawHome));
  const away = rawAway === '' || rawAway == null ? null : Math.round(Number(rawAway));
  const validHome = Number.isInteger(home) && home >= 0 ? home : null;
  const validAway = Number.isInteger(away) && away >= 0 ? away : null;
  if (!winner && validHome == null && validAway == null) return null;
  return { winner, home: validHome, away: validAway };
}

/** Etiqueta legible de un pick (2-1, etc.). */
export function formatPickPredictionLabel(pick) {
  if (!pick) return null;
  if (typeof pick === 'string') return pick.trim() || null;
  if (Array.isArray(pick)) return `${pick[0]}-${pick[1]}`;
  if (typeof pick === 'object') {
    const parsed = parsePickScore(pick);
    if (parsed) return `${parsed.home}-${parsed.away}`;
    const home = pick.home_pick ?? pick.home ?? pick.local;
    const away = pick.away_pick ?? pick.away ?? pick.visitante;
    if (home != null && away != null) return `${home}-${away}`;
  }
  return null;
}

export function getPickForMatchId(picks, matchId, match = null) {
  if (!picks || typeof picks !== 'object') return null;

  const keys = new Set();
  if (matchId != null && matchId !== '') keys.add(String(matchId));
  if (match?.id != null) keys.add(String(match.id));
  if (match?.official_id) keys.add(String(match.official_id));

  for (const key of keys) {
    if (picks[key] != null) return picks[key];
    const numeric = Number(key);
    if (Number.isFinite(numeric) && picks[numeric] != null) return picks[numeric];
  }

  for (const [pickKey, value] of Object.entries(picks)) {
    if (keys.has(String(pickKey))) return value;
  }

  return null;
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
export function collectMatchPickScores(profileRows, matchId, match = null) {
  const scores = [];
  if (!matchId || !Array.isArray(profileRows)) return scores;

  for (const row of profileRows) {
    const pick = getPickForMatchId(row.picks, matchId, match);
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
export function getCommunityOutcomeStats(scores, match, { minPicks = MIN_COMMUNITY_PICKS } = {}) {
  const total = scores.length;
  if (total < minPicks) {
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

/** Tendencia 1X2 siempre visible en UI (0% si aún no hay picks). */
export function getCommunityOutcomeStatsDisplay(scores, match) {
  const homeLabel = match?.home_team ?? 'Local';
  const awayLabel = match?.away_team ?? 'Visitante';
  const total = scores?.length ?? 0;

  if (!total) {
    return {
      sufficient: true,
      total: 0,
      homeLabel,
      awayLabel,
      homePct: 0,
      drawPct: 0,
      awayPct: 0,
    };
  }

  const stats = getCommunityOutcomeStats(scores, match, { minPicks: 1 });
  if (stats.sufficient) return stats;

  return {
    sufficient: true,
    total,
    homeLabel,
    awayLabel,
    homePct: 0,
    drawPct: 0,
    awayPct: 0,
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

/**
 * Agrupa picks por marcador exacto y calcula % de votos.
 * @param {Array<{ picks?: Record<string, unknown> }>} profileRows
 */
export function aggregateVoteDistribution(profileRows, matchId, match = null) {
  const predictions = {};
  let total = 0;

  for (const profile of profileRows ?? []) {
    const pick = getPickForMatchId(profile.picks, matchId, match);
    const pred = formatPickPredictionLabel(pick);
    if (!pred) continue;
    predictions[pred] = (predictions[pred] || 0) + 1;
    total += 1;
  }

  if (!total) {
    return { total: 0, sufficient: false, items: [] };
  }

  const items = Object.entries(predictions)
    .sort((a, b) => b[1] - a[1])
    .map(([prediction, count]) => ({
      prediction,
      count,
      percentage: Math.round((count / total) * 100),
    }));

  return {
    total,
    sufficient: total > 0,
    items,
  };
}

export function aggregateVoteDistributionFromScores(scores) {
  const predictions = {};
  let total = 0;

  for (const score of scores ?? []) {
    const pred = formatScoreLabel(score.home, score.away);
    predictions[pred] = (predictions[pred] || 0) + 1;
    total += 1;
  }

  if (!total) {
    return { total: 0, sufficient: false, items: [] };
  }

  const items = Object.entries(predictions)
    .sort((a, b) => b[1] - a[1])
    .map(([prediction, count]) => ({
      prediction,
      count,
      percentage: Math.round((count / total) * 100),
    }));

  return {
    total,
    sufficient: total > 0,
    items,
  };
}

function scoreKey(home, away) {
  return formatScoreLabel(home, away);
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

/** Tendencia general (1X2) + distribución de votos por marcador. */
export function buildCommunityGeneralInsights(scores, match, profileRows = null, { minPicks = 1 } = {}) {
  const voteDistribution = profileRows?.length
    ? aggregateVoteDistribution(profileRows, match?.id, match)
    : aggregateVoteDistributionFromScores(scores);

  return {
    outcome: getCommunityOutcomeStats(scores, match, { minPicks }),
    voteDistribution,
    total: scores?.length ?? voteDistribution.total ?? 0,
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

/** Partidos con al menos una predicción (tendencia siempre visible en UI). */
export function listMatchesForCommunityTrends(profileRows, matches, { minPicks = 1 } = {}) {
  const list = Array.isArray(matches) ? matches : [];
  return list.filter((m) => {
    const scores = collectMatchPickScores(profileRows, m.id, m);
    return scores.length >= minPicks;
  });
}
