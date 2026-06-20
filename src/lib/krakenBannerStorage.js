import { getDayOfYear } from './krakenAlertStorage';
import { krakenProfileFirstName } from './krakenProfileNames';

export const KRAKEN_BANNER_SEEN_KEY = 'kraken_banner_seen';
export const KRAKEN_BANNER_DAY_KEY = 'kraken_banner_day';

export function wasKrakenBannerSeenToday(now = new Date()) {
  try {
    return localStorage.getItem(KRAKEN_BANNER_SEEN_KEY) === now.toDateString();
  } catch {
    return false;
  }
}

export function markKrakenBannerSeenToday(now = new Date()) {
  try {
    localStorage.setItem(KRAKEN_BANNER_SEEN_KEY, now.toDateString());
  } catch (e) {
    console.warn('[krakenBannerStorage] seen write failed', e?.message ?? e);
  }
}

/** DANGER: día sí, día no según día del año. */
export function shouldShowDangerKrakenBanner(now = new Date()) {
  try {
    const today = getDayOfYear(now);
    const lastRaw = localStorage.getItem(KRAKEN_BANNER_DAY_KEY);
    if (!lastRaw) return true;
    const last = Number(lastRaw);
    if (Number.isNaN(last)) return true;
    if (today === last) return false;
    if (today === last + 1) return false;
    return true;
  } catch {
    return true;
  }
}

export function markKrakenBannerDangerDay(now = new Date()) {
  try {
    localStorage.setItem(KRAKEN_BANNER_DAY_KEY, String(getDayOfYear(now)));
  } catch (e) {
    console.warn('[krakenBannerStorage] day write failed', e?.message ?? e);
  }
}

export function profileDisplayName(row, fallback) {
  return krakenProfileFirstName(row, fallback);
}
