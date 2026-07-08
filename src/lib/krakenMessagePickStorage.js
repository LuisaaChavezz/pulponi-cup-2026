import { pickRandom } from './krakenMessageCatalog';

export const KRAKEN_MSG_KEYS = {
  tied: (today) => `kraken_msg_tied_${today}`,
  danger: (today) => `kraken_msg_danger_${today}`,
  safe: (weekKey) => `kraken_msg_safe_${weekKey}`,
  before: (matchId) => `kraken_msg_before_${matchId}`,
  after: (matchId) => `kraken_msg_after_${matchId}`,
  throne: (nuevoProfileId) => `kraken_msg_throne_${nuevoProfileId}`,
  privateTied: (today) => `kraken_msg_private_tied_${today}`,
  privateDanger: (today) => `kraken_msg_private_danger_${today}`,
  privateSafe: (weekKey) => `kraken_msg_private_safe_${weekKey}`,
  privateNewKing: (profileId) => `kraken_msg_private_new_king_${profileId}`,
  privateLostThrone: (profileId) => `kraken_msg_private_lost_throne_${profileId}`,
  daily: (today, matchKey) => `kraken_msg_daily_${today}_${matchKey}`,
};

function readStorage(key) {
  if (!key) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  if (!key || value == null) return;
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn('[krakenMessagePickStorage] write failed', key, e?.message ?? e);
  }
}

/** Plantilla de texto Kraken estable entre refrescos (guarda el string con placeholders). */
export function pickStableTemplate(storageKey, templates) {
  if (!templates?.length) return '';
  if (!storageKey) return pickRandom(templates) ?? '';

  const cached = readStorage(storageKey);
  if (cached && templates.includes(cached)) return cached;

  const picked = pickRandom(templates) ?? '';
  if (picked) writeStorage(storageKey, picked);
  return picked;
}

/** Mensaje privado { title, body } estable entre refrescos. */
export function pickStablePrivateMessage(storageKey, messages) {
  if (!messages?.length) return null;
  if (!storageKey) return pickRandom(messages);

  const cached = readStorage(storageKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      const match = messages.find((m) => m.title === parsed?.title && m.body === parsed?.body);
      if (match) return match;
    } catch {
      /* ignore invalid cache */
    }
  }

  const picked = pickRandom(messages);
  if (picked) {
    writeStorage(storageKey, JSON.stringify({ title: picked.title, body: picked.body }));
  }
  return picked ?? null;
}
