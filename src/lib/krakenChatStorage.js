export function wasKrakenChatSent(storageKey) {
  if (!storageKey) return false;
  try {
    return localStorage.getItem(storageKey) === '1';
  } catch {
    return false;
  }
}

export function markKrakenChatSent(storageKey) {
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, '1');
  } catch (e) {
    console.warn('[krakenChatStorage] write failed', e?.message ?? e);
  }
}

export function krakenChatMatchKey(matchId, phase) {
  return `kraken_chat_${matchId}_${phase}`;
}

export function krakenChatThroneKey(currentElegidoId) {
  return `kraken_chat_throne_${currentElegidoId}`;
}

export function krakenChatBannerKey(mode, dateKey) {
  return `kraken_chat_banner_${mode}_${dateKey}`;
}
