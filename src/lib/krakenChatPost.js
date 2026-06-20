import { getDayOfYear } from './krakenAlertStorage';
import {
  krakenChatBannerKey,
  krakenChatMatchKey,
  krakenChatThroneKey,
  markKrakenChatSent,
  wasKrakenChatSent,
} from './krakenChatStorage';
import { BANNER_MODE } from './krakenBannerMessages';
import { KRAKEN_PROFILE_ID } from './krakenProfile';
import { isMissingKrakenColumnError } from './commentsLoad';
import { supabase } from './supabase';

const KRAKEN_CHAT_MATCH_FALLBACK = 'general';

async function insertKrakenComment(body, matchId) {
  const baseRow = {
    profile_id: KRAKEN_PROFILE_ID,
    match_id: matchId ?? KRAKEN_CHAT_MATCH_FALLBACK,
    body: body.trim(),
  };

  let { error } = await supabase.from('comments').insert({ ...baseRow, is_kraken: true });

  if (error && isMissingKrakenColumnError(error)) {
    ({ error } = await supabase.from('comments').insert(baseRow));
  }

  if (error) {
    console.warn('[krakenChatPost] insert failed', error.message ?? error);
    return false;
  }

  return true;
}

export async function postKrakenChatMessage({ content, matchId = null, storageKey }) {
  const text = String(content ?? '').trim();
  if (!text || !storageKey || wasKrakenChatSent(storageKey)) {
    return false;
  }

  const ok = await insertKrakenComment(text, matchId);
  if (ok) {
    markKrakenChatSent(storageKey);
  }
  return ok;
}

export async function syncKrakenMatchChatMessage({ phase, matchId, content }) {
  if (!matchId || !phase) return false;
  return postKrakenChatMessage({
    content,
    matchId,
    storageKey: krakenChatMatchKey(matchId, phase),
  });
}

export async function syncKrakenBannerChatMessage({ mode, content, currentElegidoId, now = new Date() }) {
  let storageKey;

  if (mode === BANNER_MODE.THRONE_CHANGE) {
    storageKey = krakenChatThroneKey(currentElegidoId);
  } else if (mode === BANNER_MODE.TIED) {
    storageKey = krakenChatBannerKey('tied', now.toDateString());
  } else {
    storageKey = krakenChatBannerKey('danger', String(getDayOfYear(now)));
  }

  return postKrakenChatMessage({
    content,
    matchId: null,
    storageKey,
  });
}
