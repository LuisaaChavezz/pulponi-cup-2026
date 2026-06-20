const KRAKEN_LATEST_MESSAGE_ID_KEY = 'kraken_latest_message_id';
const KRAKEN_LAST_SEEN_MESSAGE_ID_KEY = 'kraken_last_seen_message_id';

export function getKrakenLatestMessageId() {
  try {
    return localStorage.getItem(KRAKEN_LATEST_MESSAGE_ID_KEY);
  } catch {
    return null;
  }
}

export function setKrakenLatestMessageId(messageId) {
  if (!messageId) return;
  try {
    localStorage.setItem(KRAKEN_LATEST_MESSAGE_ID_KEY, String(messageId));
  } catch (e) {
    console.warn('[krakenUnreadStorage] latest write failed', e?.message ?? e);
  }
}

export function getKrakenLastSeenMessageId() {
  try {
    return localStorage.getItem(KRAKEN_LAST_SEEN_MESSAGE_ID_KEY);
  } catch {
    return null;
  }
}

export function hasUnreadKrakenMessages() {
  const latestId = getKrakenLatestMessageId();
  const seenId = getKrakenLastSeenMessageId();
  return Boolean(latestId && latestId !== seenId);
}

/** Marca como visto el último mensaje Kraken (p. ej. al abrir Comunidad desde el FAB). */
export function markKrakenMessagesSeen() {
  const latestId = getKrakenLatestMessageId();
  if (!latestId) return;
  try {
    localStorage.setItem(KRAKEN_LAST_SEEN_MESSAGE_ID_KEY, latestId);
  } catch (e) {
    console.warn('[krakenUnreadStorage] seen write failed', e?.message ?? e);
  }
}
