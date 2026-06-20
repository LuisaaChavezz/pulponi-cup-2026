export const KRAKEN_ALERT_SEEN_KEY = 'kraken_alert_seen';

export function getKrakenAlertSeenDate() {
  try {
    return localStorage.getItem(KRAKEN_ALERT_SEEN_KEY);
  } catch {
    return null;
  }
}

export function wasKrakenAlertSeenToday(now = new Date()) {
  return getKrakenAlertSeenDate() === now.toDateString();
}

export function markKrakenAlertSeenToday(now = new Date()) {
  try {
    localStorage.setItem(KRAKEN_ALERT_SEEN_KEY, now.toDateString());
  } catch (e) {
    console.warn('[krakenAlertStorage] write failed', e?.message ?? e);
  }
}
