import { MOVEMENT_INACTIVE } from './rankingHistory';

/** Movimiento representativo del grupo (mejor mejora entre miembros empatados). */
export function deriveGroupMovement(members) {
  const movements = (members ?? [])
    .map((m) => m.movement)
    .filter((m) => m && m.direction && m.direction !== 'none');
  if (!movements.length) return MOVEMENT_INACTIVE;

  const score = (m) => {
    const dirScore = { up: 40, new: 30, same: 10, down: 0 }[m.direction] ?? 0;
    return dirScore + (m.delta ?? 0);
  };

  return movements.reduce((best, m) => (score(m) > score(best) ? m : best), movements[0]);
}

/** Agrupa filas rankeadas por rank_position (empates en una sola burbuja). */
export function groupRankedRowsByPosition(rows) {
  const list = rows ?? [];
  if (!list.length) return [];

  const byRank = new Map();
  for (const row of list) {
    const rank = Number(row.rank_position ?? row.currentRank ?? 0);
    if (!Number.isFinite(rank) || rank <= 0) continue;
    if (!byRank.has(rank)) byRank.set(rank, []);
    byRank.get(rank).push(row);
  }

  return [...byRank.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rank_position, members]) => {
      const sortedMembers = [...members].sort((a, b) => {
        const ua = String(a.username ?? a.name ?? '')
          .replace(/^@+/, '')
          .trim();
        const ub = String(b.username ?? b.name ?? '')
          .replace(/^@+/, '')
          .trim();
        return ua.localeCompare(ub, 'es', { sensitivity: 'base' });
      });
      const lead = sortedMembers[0];
      return {
        rank_position,
        points: Number(lead?.points ?? 0),
        exacts: Number(lead?.exacts ?? 0),
        streak: Number(lead?.streak ?? 0),
        members: sortedMembers,
        movement: deriveGroupMovement(sortedMembers),
      };
    });
}
