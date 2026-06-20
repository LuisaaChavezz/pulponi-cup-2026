import { KRAKEN_MODE } from './krakenMessages';

export const KRAKEN_ALERT_SEEN_KEY = 'kraken_alert_seen';
export const KRAKEN_ALERT_DAY_KEY = 'kraken_alert_day';
export const KRAKEN_ALERT_WEEK_KEY = 'kraken_alert_week';
export const KRAKEN_MSG_INDEX_KEY = 'kraken_msg_index';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('[krakenAlertStorage] write failed', key, e?.message ?? e);
  }
}

function writeString(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn('[krakenAlertStorage] write failed', key, e?.message ?? e);
  }
}

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

/** Empate en la cima: una vez al día. */
export function shouldShowTiedKrakenAlert(now = new Date()) {
  try {
    return localStorage.getItem(KRAKEN_ALERT_SEEN_KEY) !== now.toDateString();
  } catch {
    return true;
  }
}

/** Diferencia <= 2: día sí, día no. */
export function shouldShowDangerKrakenAlert(now = new Date()) {
  try {
    const today = getDayOfYear(now);
    const lastRaw = localStorage.getItem(KRAKEN_ALERT_DAY_KEY);
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

/** Diferencia > 2: una vez por semana. */
export function shouldShowSafeKrakenAlert(now = new Date()) {
  try {
    return localStorage.getItem(KRAKEN_ALERT_WEEK_KEY) !== getWeekOfYearKey(now);
  } catch {
    return true;
  }
}

export function markKrakenAlertShownForMode(mode, now = new Date()) {
  switch (mode) {
    case KRAKEN_MODE.TIED:
    case KRAKEN_MODE.NEW_KING:
    case KRAKEN_MODE.LOST_THRONE:
      writeString(KRAKEN_ALERT_SEEN_KEY, now.toDateString());
      break;
    case KRAKEN_MODE.DANGER:
      writeString(KRAKEN_ALERT_DAY_KEY, String(getDayOfYear(now)));
      break;
    case KRAKEN_MODE.SAFE:
      writeString(KRAKEN_ALERT_WEEK_KEY, getWeekOfYearKey(now));
      break;
    default:
      break;
  }
}

export function shouldShowKrakenAlertForMode(mode, now = new Date()) {
  switch (mode) {
    case KRAKEN_MODE.NEW_KING:
    case KRAKEN_MODE.LOST_THRONE:
      return true;
    case KRAKEN_MODE.TIED:
      return shouldShowTiedKrakenAlert(now);
    case KRAKEN_MODE.DANGER:
      return shouldShowDangerKrakenAlert(now);
    case KRAKEN_MODE.SAFE:
      return shouldShowSafeKrakenAlert(now);
    default:
      return false;
  }
}

/** Mensaje aleatorio sin repetir hasta agotar la lista del modo actual. */
export function pickKrakenMessage(messages, mode) {
  const usedKey = `kraken_msg_used_${mode}`;
  let used = readJson(usedKey, []);
  if (!Array.isArray(used)) used = [];

  if (used.length >= messages.length) {
    used = [];
  }

  const available = messages.map((_, index) => index).filter((index) => !used.includes(index));
  const pickedIndex = available[Math.floor(Math.random() * available.length)];
  used.push(pickedIndex);

  writeJson(usedKey, used);
  writeString(KRAKEN_MSG_INDEX_KEY, String(pickedIndex));

  return messages[pickedIndex];
}
