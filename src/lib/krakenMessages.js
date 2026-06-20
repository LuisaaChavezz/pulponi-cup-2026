export {
  KRAKEN_MODE,
  KRAKEN_MESSAGES_SAFE,
  KRAKEN_MESSAGES_DANGER,
  KRAKEN_MESSAGES_TIED,
  KRAKEN_MESSAGES_NEW_KING,
  KRAKEN_MESSAGES_LOST_THRONE,
  getPrivateMessagesForMode as getKrakenMessagesForMode,
  resolveKrakenMode,
} from './krakenMessageCatalog';

export function getKrakenAlertCta(mode) {
  switch (mode) {
    case 'new_king':
      return '¡Voy por él! 🦑';
    case 'lost_throne':
      return 'Voy a recuperarlo 🦑';
    default:
      return 'Defenderé mi trono 🦑';
  }
}
