import { getDayOfYear } from './krakenAlertStorage';
import {
  krakenChatBannerKey,
  krakenChatMatchKey,
  krakenChatPresentationKey,
  krakenChatThroneKey,
  markKrakenChatSent,
  wasKrakenChatSent,
} from './krakenChatStorage';
import { BANNER_MODE } from './krakenBannerMessages';
import { KRAKEN_PRESENTATION_MESSAGE, KRAKEN_PROFILE_ID } from './krakenProfile';
import { isMissingKrakenColumnError } from './commentsLoad';
import { setKrakenLatestMessageId } from './krakenChatUnreadStorage';
import { supabase } from './supabase';

const KRAKEN_CHAT_MATCH_FALLBACK = 'general';

async function insertKrakenComment(body, matchId) {
  const baseRow = {
    profile_id: KRAKEN_PROFILE_ID,
    match_id: matchId ?? KRAKEN_CHAT_MATCH_FALLBACK,
    body: body.trim(),
  };

  let { data, error } = await supabase
    .from('comments')
    .insert({ ...baseRow, is_kraken: true })
    .select('id')
    .single();

  if (error && isMissingKrakenColumnError(error)) {
    ({ data, error } = await supabase.from('comments').insert(baseRow).select('id').single());
  }

  if (error) {
    console.warn('[krakenChatPost] insert failed', error.message ?? error);
    return null;
  }

  if (data?.id) {
    setKrakenLatestMessageId(data.id);
  }

  return data?.id ?? null;
}

async function krakenPresentationExists() {
  let { data, error } = await supabase.from('comments').select('id').eq('is_kraken', true).limit(1);

  if (error && isMissingKrakenColumnError(error)) {
    ({ data, error } = await supabase
      .from('comments')
      .select('id')
      .eq('profile_id', KRAKEN_PROFILE_ID)
      .limit(1));
  }

  if (error) {
    console.warn('[ensureKrakenPresentationMessage] check failed', error.message ?? error);
    return null;
  }

  return Boolean(data?.length);
}

/** Inserta el mensaje de presentación una sola vez (tabla comments). No bloquea el chat si falla. */
export async function ensureKrakenPresentationMessage() {
  const storageKey = krakenChatPresentationKey();
  if (wasKrakenChatSent(storageKey)) return false;

  const exists = await krakenPresentationExists();
  if (exists === null) return false;
  if (exists) {
    markKrakenChatSent(storageKey);
    return false;
  }

  const insertedId = await insertKrakenComment(KRAKEN_PRESENTATION_MESSAGE, KRAKEN_CHAT_MATCH_FALLBACK);
  if (insertedId) {
    markKrakenChatSent(storageKey);
  }
  return Boolean(insertedId);
}

export async function postKrakenChatMessage({ content, matchId = null, storageKey }) {
  const text = String(content ?? '').trim();
  if (!text || !storageKey || wasKrakenChatSent(storageKey)) {
    return false;
  }

  const insertedId = await insertKrakenComment(text, matchId);
  if (insertedId) {
    markKrakenChatSent(storageKey);
  }
  return Boolean(insertedId);
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
