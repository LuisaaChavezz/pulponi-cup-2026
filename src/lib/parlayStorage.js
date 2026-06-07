const STORAGE_KEY = 'pulponi_parlays_v1';

function readAll(userId) {
  if (!userId || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return Array.isArray(parsed[userId]) ? parsed[userId] : [];
  } catch {
    return [];
  }
}

function writeAll(userId, rows) {
  if (!userId || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[userId] = rows;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    /* ignore quota / private mode */
  }
  return rows;
}

export function loadUserParlays(userId) {
  return readAll(userId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function saveUserParlay(userId, parlay) {
  const rows = readAll(userId);
  rows.unshift(parlay);
  writeAll(userId, rows.slice(0, 50));
  return rows;
}

export function createParlayId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `parlay-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
