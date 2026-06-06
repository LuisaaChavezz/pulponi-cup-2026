/**
 * Ranking por jornada: snapshots en Supabase y movimiento de posiciones.
 */

export function selectDisplayName(profile) {
  const u = profile?.username?.trim();
  if (u) return u.charAt(0).toUpperCase() + u.slice(1);
  const n = profile?.name?.trim();
  if (n) return n.split(/\s+/)[0];
  return 'Jugador';
}

/** Ordena perfiles por puntos (desc) y asigna rank_position 1..n */
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

  return sorted.map((row, index) => ({
    ...row,
    points: Number(row.points ?? 0),
    exacts: Number(row.exacts ?? 0),
    streak: Number(row.streak ?? 0),
    rank_position: index + 1,
  }));
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
  const prevByProfile = new Map(
    (previousHistory ?? []).map((r) => [r.profile_id, Number(r.rank_position)])
  );

  return rankedList.map((row) => {
    const currentRank = row.rank_position;
    const previousRank = prevByProfile.has(row.id) ? prevByProfile.get(row.id) : null;
    const movement = buildMovement(currentRank, previousRank);
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
  const movement = me?.movement ?? buildMovement(currentRank, null);

  const myHistoryRanks = (allHistoryRows ?? [])
    .filter((h) => h.profile_id === userId)
    .map((h) => Number(h.rank_position))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (currentRank != null) myHistoryRanks.push(currentRank);

  const bestRank = myHistoryRanks.length ? Math.min(...myHistoryRanks) : currentRank;

  return {
    currentRank,
    previousRank: me?.previousRank ?? null,
    bestRank,
    currentPoints,
    movement,
    hasHistory: (allHistoryRows ?? []).some((h) => h.profile_id === userId),
  };
}
