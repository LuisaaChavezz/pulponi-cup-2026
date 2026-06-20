export function getDayOfYear(now = new Date()) {
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now - start) / 86400000);
}

export function getWeekOfYearKey(now = new Date()) {
  const year = now.getFullYear();
  const oneJan = new Date(year, 0, 1);
  const week = Math.ceil(((now - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);
  return `${year}-${week}`;
}

export function wasKrakenSent(key) {
  if (!key) return false;
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function markKrakenSent(key) {
  if (!key) return;
  try {
    localStorage.setItem(key, '1');
  } catch (e) {
    console.warn('[krakenMessageStorage] write failed', key, e?.message ?? e);
  }
}

export function throneChangeKey(nuevoId) {
  return `kraken_throne_change_${nuevoId}`;
}

export function tiedKey(dateStr) {
  return `kraken_tied_${dateStr}`;
}

export function dangerKey(dayOfYear) {
  return `kraken_danger_${dayOfYear}`;
}

export function wasPublicDangerSentInLast2Days(now = new Date()) {
  const today = getDayOfYear(now);
  return wasKrakenSent(dangerKey(today)) || wasKrakenSent(dangerKey(today - 1));
}

export function markPublicDangerSent(now = new Date()) {
  markKrakenSent(dangerKey(getDayOfYear(now)));
}

export function beforeMatchKey(matchId) {
  return `kraken_before_${matchId}`;
}

export function afterMatchKey(matchId) {
  return `kraken_after_${matchId}`;
}

export function safeKey(weekKey) {
  return `kraken_safe_${weekKey}`;
}

export function privateDangerKey(dayOfYear) {
  return `kraken_private_danger_${dayOfYear}`;
}

export function wasPrivateDangerSentInLast2Days(now = new Date()) {
  const today = getDayOfYear(now);
  return wasKrakenSent(privateDangerKey(today)) || wasKrakenSent(privateDangerKey(today - 1));
}

export function markPrivateDangerSent(now = new Date()) {
  markKrakenSent(privateDangerKey(getDayOfYear(now)));
}

export function privateTiedKey(dateStr) {
  return `kraken_private_tied_${dateStr}`;
}

export function newKingKey(profileId) {
  return `kraken_new_king_${profileId}`;
}

export function lostThroneKey(profileId) {
  return `kraken_lost_throne_${profileId}`;
}
