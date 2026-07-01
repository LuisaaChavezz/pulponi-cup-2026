/** 7 emojis Pulponi para reacciones del chat (orden fijo UI). */
export const CHAT_REACTION_EMOJIS = ['❤️', '😂', '🔥', '😭', '🐙', '👀', '⚽️'];

const ALLOWED = new Set(CHAT_REACTION_EMOJIS);

/** Normaliza variantes legacy (p. ej. ⚽ sin FE0F → ⚽️). */
export function normalizeReactionEmoji(emoji) {
  if (emoji === '⚽') return '⚽️';
  return emoji;
}

export function isAllowedChatReactionEmoji(emoji) {
  return typeof emoji === 'string' && ALLOWED.has(normalizeReactionEmoji(emoji));
}
