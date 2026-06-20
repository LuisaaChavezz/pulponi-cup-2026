import { supabase } from './supabase';

export function formatKrakenPrivateContent({ title, body }) {
  const t = String(title ?? '').trim();
  const b = String(body ?? '').trim();
  if (t && b) return `${t}\n\n${b}`;
  return t || b;
}

export function parseKrakenPrivateContent(content) {
  const raw = String(content ?? '').trim();
  if (!raw) return { title: '', body: '' };
  const split = raw.indexOf('\n\n');
  if (split === -1) return { title: raw, body: '' };
  return {
    title: raw.slice(0, split).trim(),
    body: raw.slice(split + 2).trim(),
  };
}

export async function fetchUnseenKrakenPrivateMessages(profileId) {
  if (!profileId) return { data: [], error: null };

  const { data, error } = await supabase
    .from('kraken_private_messages')
    .select('id, content, created_at')
    .eq('profile_id', profileId)
    .eq('seen', false)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[krakenPrivateMessages] fetch failed', error.message ?? error);
    return { data: [], error };
  }

  return { data: data ?? [], error: null };
}

export async function insertKrakenPrivateMessage(profileId, content) {
  const text = String(content ?? '').trim();
  if (!profileId || !text) return { data: null, error: null };

  const { data, error } = await supabase
    .from('kraken_private_messages')
    .insert({ profile_id: profileId, content: text })
    .select('id, content, created_at')
    .single();

  if (error) {
    console.warn('[krakenPrivateMessages] insert failed', error.message ?? error);
  }

  return { data, error };
}

export async function markKrakenPrivateMessageSeen(messageId) {
  if (!messageId) return { error: null };

  const { error } = await supabase
    .from('kraken_private_messages')
    .update({ seen: true })
    .eq('id', messageId);

  if (error) {
    console.warn('[krakenPrivateMessages] mark seen failed', error.message ?? error);
  }

  return { error };
}
