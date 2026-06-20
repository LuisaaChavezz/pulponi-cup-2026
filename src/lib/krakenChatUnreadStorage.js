const KRAKEN_CHAT_LAST_SEEN_ID_KEY = 'pulponi_kraken_chat_last_seen_id';

export function getKrakenChatLastSeenId() {
  try {
    return localStorage.getItem(KRAKEN_CHAT_LAST_SEEN_ID_KEY);
  } catch {
    return null;
  }
}

export function markKrakenChatSeen(messageId) {
  if (!messageId) return;
  try {
    localStorage.setItem(KRAKEN_CHAT_LAST_SEEN_ID_KEY, String(messageId));
  } catch (e) {
    console.warn('[krakenChatUnreadStorage] write failed', e?.message ?? e);
  }
}

export function hasUnreadKrakenChat(chatMessages = []) {
  const krakenRows = chatMessages.filter((m) => m?.isKraken && m?.id);
  if (!krakenRows.length) return false;

  const latestId = String(krakenRows[krakenRows.length - 1].id);
  const seenId = getKrakenChatLastSeenId();
  if (!seenId) return true;
  return latestId !== seenId;
}

export function latestKrakenChatMessageId(chatMessages = []) {
  const krakenRows = chatMessages.filter((m) => m?.isKraken && m?.id);
  if (!krakenRows.length) return null;
  return krakenRows[krakenRows.length - 1].id;
}
