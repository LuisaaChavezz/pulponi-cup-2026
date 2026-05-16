/** Emojis permitidos en reacciones del chat (orden fijo UI). */
export const CHAT_REACTION_EMOJIS = ['❤️', '😂', '🔥', '😭', '👀', '🐙', '⚽'];

const ALLOWED = new Set(CHAT_REACTION_EMOJIS);

export function isAllowedChatReactionEmoji(emoji) {
  return typeof emoji === 'string' && ALLOWED.has(emoji);
}
