import {
  BANNER_DANGER,
  BANNER_THRONE_CHANGE,
  BANNER_TIED,
  pickRandom,
  resolveMessage,
} from './krakenMessageCatalog';
import { KRAKEN_MSG_KEYS, pickStableTemplate } from './krakenMessagePickStorage';

export {
  BANNER_DANGER,
  BANNER_TIED,
  BANNER_THRONE_CHANGE,
  resolveMessage,
  pickRandom as pickRandomBannerMessage,
} from './krakenMessageCatalog';

export const BANNER_MODE = {
  THRONE_CHANGE: 'throne_change',
  TIED: 'tied',
  DANGER: 'danger',
};

export function buildBannerText(mode, vars, { today = new Date().toDateString(), nuevoProfileId } = {}) {
  const templates =
    mode === BANNER_MODE.THRONE_CHANGE
      ? BANNER_THRONE_CHANGE
      : mode === BANNER_MODE.TIED
        ? BANNER_TIED
        : BANNER_DANGER;

  const storageKey =
    mode === BANNER_MODE.THRONE_CHANGE
      ? KRAKEN_MSG_KEYS.throne(nuevoProfileId ?? 'unknown')
      : mode === BANNER_MODE.TIED
        ? KRAKEN_MSG_KEYS.tied(today)
        : KRAKEN_MSG_KEYS.danger(today);

  return resolveMessage(pickStableTemplate(storageKey, templates), vars);
}

export function buildPublicBannerText(mode, vars) {
  return buildBannerText(mode, vars);
}

export function resolveKrakenMessageText(text, vars) {
  return resolveMessage(text, vars);
}
