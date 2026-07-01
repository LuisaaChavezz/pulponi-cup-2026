export { MESSAGES_BEFORE, MESSAGES_AFTER, resolveMessage as resolveMatchMessage, pickRandom as pickRandomKrakenMatchMessage } from './krakenMessageCatalog';

export const KRAKEN_MATCH_MODE = {
  BEFORE: 'before',
  AFTER: 'after',
};

export function splitKrakenMatchEmoji(text) {
  const raw = String(text ?? '').trim();
  const match = raw.match(/^(\p{Extended_Pictographic}(?:\uFE0F)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F)?)*)\s*(.*)$/u);
  if (!match) {
    return { emoji: null, body: raw };
  }
  return {
    emoji: match[1] || '🦑',
    body: match[2] || raw,
  };
}
