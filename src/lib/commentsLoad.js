import { resolveAvatarUrl } from './avatars';
import { KRAKEN_PROFILE_ID, KRAKEN_USERNAME } from './krakenProfile';

const COMMENTS_SELECT_WITH_KRAKEN =
  'id, profile_id, body, created_at, is_kraken, profiles(username, name, photo_url)';

const COMMENTS_SELECT_BASE =
  'id, profile_id, body, created_at, profiles(username, name, photo_url)';

export function isMissingKrakenColumnError(error) {
  const msg = String(error?.message ?? error ?? '').toLowerCase();
  const code = String(error?.code ?? '');
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    msg.includes('is_kraken') ||
    (msg.includes('column') && msg.includes('does not exist'))
  );
}

export function mapCommentRowToChatMessage(row) {
  const username = row?.profiles?.username;
  const isKraken =
    Boolean(row?.is_kraken) ||
    row?.profile_id === KRAKEN_PROFILE_ID ||
    username === KRAKEN_USERNAME;

  return {
    id: row.id,
    profileId: row.profile_id ?? null,
    user: isKraken
      ? `@${username || KRAKEN_USERNAME}`
      : username
        ? `@${username}`
        : '@anon',
    photoUrl: isKraken ? null : (row.profiles?.photo_url ?? null),
    avatarUrl: isKraken ? null : resolveAvatarUrl(row.profiles?.photo_url),
    isKraken,
    time: new Date(row.created_at).toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    body: row.body,
  };
}

/** Carga comentarios del chat; si falta is_kraken en BD, reintenta sin esa columna. */
export async function fetchCommunityComments(client, { limit = 80 } = {}) {
  const baseQuery = () =>
    client.from('comments').select(COMMENTS_SELECT_WITH_KRAKEN).order('created_at', { ascending: true }).limit(limit);

  let { data, error } = await baseQuery();

  if (error && isMissingKrakenColumnError(error)) {
    console.warn('[fetchCommunityComments] is_kraken missing, falling back', error.message ?? error);
    ({ data, error } = await client
      .from('comments')
      .select(COMMENTS_SELECT_BASE)
      .order('created_at', { ascending: true })
      .limit(limit));
  }

  return { data: data ?? [], error };
}
