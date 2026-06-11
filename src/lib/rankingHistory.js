/**
 * Ranking por jornada: snapshots en Supabase y movimiento de posiciones.
 */

/** Al menos un jugador con puntos > 0 (quiniela iniciada). */
export function leaderboardHasScoredPoints(profilesOrRanked) {
  return (profilesOrRanked ?? []).some((r) => Number(r.points ?? 0) > 0);
}

/** Snapshot de jornada válido: no todos en cero. */
export function historySnapshotHasScoredPoints(historyRows) {
  return (historyRows ?? []).some((r) => Number(r.points ?? 0) > 0);
}

/** Sin movimiento (↑↓ / nuevo) — antes de puntos reales o sin jornada previa válida. */
export const MOVEMENT_INACTIVE = {
  direction: 'none',
  delta: 0,
  shortLabel: '—',
  lineLabel: '—',
};

export function selectDisplayName(profile) {
  const u = profile?.username?.trim();
  if (u) return u.charAt(0).toUpperCase() + u.slice(1);
  const n = profile?.name?.trim();
  if (n) return n.split(/\s+/)[0];
  return 'Jugador';
}

/**
 * Dense rank: mismos puntos → misma posición; la siguiente es secuencial (+1, sin saltos).
 * Ej.: 13 jugadores con 3 pts → todos #1; el siguiente con 1 pt → #2 (no #14).
 */
export function computeDenseRankPosition(sortedRows, index, pointsKey = 'points') {
  if (index <= 0) return 1;
  const cur = Number(sortedRows[index]?.[pointsKey] ?? 0);
  const prev = Number(sortedRows[index - 1]?.[pointsKey] ?? 0);
  if (cur === prev) {
    return computeDenseRankPosition(sortedRows, index - 1, pointsKey);
  }
  return computeDenseRankPosition(sortedRows, index - 1, pointsKey) + 1;
}

/** @deprecated Alias de computeDenseRankPosition (antes standard/1224). */
export const computeStandardRankPosition = computeDenseRankPosition;

/** Ordena perfiles por puntos (desc) y asigna rank_position con empates (dense rank). */
export function buildRankedLeaderboard(profiles) {
  const sorted = [...(profiles ?? [])].sort((a, b) => {
    const pa = Number(a.points ?? 0);
    const pb = Number(b.points ?? 0);
    if (pb !== pa) return pb - pa;
    const ea = Number(a.exacts ?? 0);
    const eb = Number(b.exacts ?? 0);
    if (eb !== ea) return eb - ea;
    const sa = Number(a.streak ?? 0);
    const sb = Number(b.streak ?? 0);
    if (sb !== sa) return sb - sa;
    const ua = String(a.username ?? a.name ?? '')
      .replace(/^@+/, '')
      .trim();
    const ub = String(b.username ?? b.name ?? '')
      .replace(/^@+/, '')
      .trim();
    return ua.localeCompare(ub, 'es', { sensitivity: 'base' });
  });

  let denseRank = 1;
  let prevPoints = null;

  return sorted.map((row, index) => {
    const points = Number(row.points ?? 0);
    if (index > 0 && points !== prevPoints) {
      denseRank += 1;
    }
    prevPoints = points;

    return {
      ...row,
      points,
      exacts: Number(row.exacts ?? 0),
      streak: Number(row.streak ?? 0),
      rank_position: denseRank,
    };
  });
}

/** ¿El snapshot anterior refleja el mismo orden de puestos y puntos? */
export function snapshotMatchesHistory(historyRows, rankedList) {
  if (!historyRows?.length || !rankedList?.length) return false;
  if (historyRows.length !== rankedList.length) return false;

  const byId = new Map(historyRows.map((r) => [r.profile_id, r]));
  for (const row of rankedList) {
    const prev = byId.get(row.id);
    if (!prev) return false;
    if (Number(prev.rank_position) !== row.rank_position) return false;
    if (Number(prev.points) !== row.points) return false;
  }
  return true;
}

/**
 * Compara ranking en vivo vs jornada anterior guardada.
 * @param {Array} rankedList — salida de buildRankedLeaderboard
 * @param {Array<{ profile_id, rank_position }>} previousHistory
 */
export function attachPositionMovement(rankedList, previousHistory) {
  const attachInactive = (row) => ({
    ...row,
    currentRank: row.rank_position,
    previousRank: null,
    movement: MOVEMENT_INACTIVE,
  });

  if (!leaderboardHasScoredPoints(rankedList)) {
    return (rankedList ?? []).map(attachInactive);
  }

  if (!historySnapshotHasScoredPoints(previousHistory)) {
    return (rankedList ?? []).map(attachInactive);
  }

  const prevByProfile = new Map(
    (previousHistory ?? []).map((r) => [r.profile_id, Number(r.rank_position)])
  );

  return rankedList.map((row) => {
    const currentRank = row.rank_position;
    const previousRank = prevByProfile.has(row.id) ? prevByProfile.get(row.id) : null;
    const movement =
      previousRank == null ? MOVEMENT_INACTIVE : buildMovement(currentRank, previousRank);
    return {
      ...row,
      currentRank,
      previousRank,
      movement,
    };
  });
}

export function buildMovement(currentRank, previousRank) {
  if (previousRank == null || !Number.isFinite(previousRank)) {
    return {
      direction: 'new',
      delta: 0,
      shortLabel: 'nuevo',
      lineLabel: 'nuevo en el ranking',
    };
  }

  const delta = previousRank - currentRank;

  if (delta > 0) {
    const n = delta;
    const word = n === 1 ? 'posición' : 'posiciones';
    return {
      direction: 'up',
      delta: n,
      shortLabel: `↑ ${n}`,
      lineLabel: `↑ ${n} ${word}`,
    };
  }

  if (delta < 0) {
    const n = Math.abs(delta);
    const word = n === 1 ? 'posición' : 'posiciones';
    return {
      direction: 'down',
      delta: n,
      shortLabel: `↓ ${n}`,
      lineLabel: `↓ ${n} ${word}`,
    };
  }

  return {
    direction: 'same',
    delta: 0,
    shortLabel: '—',
    lineLabel: 'se mantiene',
  };
}

/** Etiqueta tipo "Luisa ↑ 3 posiciones" */
export function formatMovementLine(profile, movement) {
  const name = selectDisplayName(profile);
  return `${name} ${movement.lineLabel}`;
}

/**
 * Resumen para bloque de perfil.
 * @param {string} userId
 * @param {Array} rankedList — con movement ya adjunto
 * @param {Array} allHistoryRows — todas las filas ranking_history del usuario
 */
export function getProfileRankingSummary(userId, rankedList, allHistoryRows) {
  const me = rankedList.find((r) => r.id === userId);
  const currentRank = me?.currentRank ?? me?.rank_position ?? null;
  const currentPoints = me?.points ?? 0;
  const scored = leaderboardHasScoredPoints(rankedList);
  const movement = scored
    ? (me?.movement ?? MOVEMENT_INACTIVE)
    : MOVEMENT_INACTIVE;

  const myHistoryRanks = (allHistoryRows ?? [])
    .filter((h) => h.profile_id === userId)
    .map((h) => Number(h.rank_position))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (scored && currentRank != null) myHistoryRanks.push(currentRank);

  const bestRank = myHistoryRanks.length ? Math.min(...myHistoryRanks) : scored ? currentRank : null;

  return {
    currentRank,
    previousRank: me?.previousRank ?? null,
    bestRank,
    currentPoints,
    movement,
    hasHistory: scored && (allHistoryRows ?? []).some((h) => h.profile_id === userId),
    movementActive: scored,
  };
}
