import {
  BANNER_DANGER,
  BANNER_THRONE_CHANGE,
  BANNER_TIED,
  pickRandom,
  resolveMessage,
} from './krakenMessageCatalog';

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

export function buildBannerText(mode, vars) {
  const templates =
    mode === BANNER_MODE.THRONE_CHANGE
      ? BANNER_THRONE_CHANGE
      : mode === BANNER_MODE.TIED
        ? BANNER_TIED
        : BANNER_DANGER;
  return resolveMessage(pickRandom(templates), vars);
}

export function buildPublicBannerText(mode, vars) {
  return buildBannerText(mode, vars);
}

export function resolveKrakenMessageText(text, vars) {
  return resolveMessage(text, vars);
}
