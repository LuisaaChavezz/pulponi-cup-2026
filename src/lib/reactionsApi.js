import { resolveAvatarUrl } from './avatars';

const REACTION_SELECT_WITH_PROFILES = `
  id,
  comment_id,
  profile_id,
  emoji,
  created_at,
  profiles ( username, name, photo_url )
`;

const REACTION_SELECT_BASE = `
  id,
  comment_id,
  profile_id,
  emoji,
  created_at
`;

const REACTION_SELECT_LEGACY_WITH_PROFILES = `
  id,
  message_id,
  user_id,
  emoji,
  created_at,
  profiles ( username, name, photo_url )
`;

const REACTION_SELECT_LEGACY_BASE = `
  id,
  message_id,
  user_id,
  emoji,
  created_at
`;

function isMissingColumnError(error, columnName) {
  const msg = String(error?.message ?? error ?? '').toLowerCase();
  const code = String(error?.code ?? '');
  const col = String(columnName ?? '').toLowerCase();
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    (col && msg.includes(col) && (msg.includes('column') || msg.includes('does not exist')))
  );
}

function isMissingTableError(error) {
  const msg = String(error?.message ?? error ?? '').toLowerCase();
  const code = String(error?.code ?? '');
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('chat_reactions') ||
    (msg.includes('relation') && msg.includes('does not exist'))
  );
}

function isProfilesJoinError(error) {
  const msg = String(error?.message ?? error ?? '').toLowerCase();
  return (
    msg.includes('profiles') &&
    (msg.includes('relationship') || msg.includes('could not find') || msg.includes('schema cache'))
  );
}

export function normalizeReactionRow(row) {
  let prof = row?.profiles && typeof row.profiles === 'object' ? row.profiles : null;
  if (Array.isArray(prof)) prof = prof[0] ?? null;
  const commentId = row?.comment_id ?? row?.message_id ?? null;
  const profileId = row?.profile_id ?? row?.user_id ?? null;
  return {
    id: row.id,
    comment_id: commentId,
    profile_id: profileId,
    emoji: row.emoji,
    username: prof?.username ?? null,
    displayName: prof?.name ?? null,
    photoUrl: prof?.photo_url ?? null,
    avatarUrl: resolveAvatarUrl(prof?.photo_url),
  };
}

export function reactionCommentIdFromPayload(payload) {
  return (
    payload?.new?.comment_id ??
    payload?.new?.message_id ??
    payload?.old?.comment_id ??
    payload?.old?.message_id ??
    null
  );
}

/** Carga reacciones por comentario; tolera columnas legacy y fallos del join a profiles. */
export async function fetchReactionsForCommentIds(client, commentIds) {
  const uniq = [...new Set(commentIds)].filter(Boolean);
  if (!uniq.length) return { data: [], error: null };

  const tableNames = ['reactions', 'chat_reactions'];

  for (const table of tableNames) {
    let { data, error } = await client
      .from(table)
      .select(REACTION_SELECT_WITH_PROFILES)
      .in('comment_id', uniq);

    if (!error) return { data: data ?? [], error: null };

    if (isMissingTableError(error) && table === 'reactions') continue;

    if (isMissingColumnError(error, 'comment_id') || isMissingColumnError(error, 'profile_id')) {
      ({ data, error } = await client
        .from(table)
        .select(REACTION_SELECT_LEGACY_WITH_PROFILES)
        .in('message_id', uniq));
      if (!error) return { data: data ?? [], error: null };
    }

    if (isProfilesJoinError(error)) {
      ({ data, error } = await client
        .from(table)
        .select(REACTION_SELECT_BASE)
        .in('comment_id', uniq));
      if (!error) return { data: data ?? [], error: null };

      if (isMissingColumnError(error, 'comment_id')) {
        ({ data, error } = await client
          .from(table)
          .select(REACTION_SELECT_LEGACY_BASE)
          .in('message_id', uniq));
        if (!error) return { data: data ?? [], error: null };
      }
    }

    if (table === tableNames[tableNames.length - 1]) {
      return { data: [], error };
    }
  }

  return { data: [], error: null };
}

async function findExistingReaction(client, commentId, profileId) {
  const tables = ['reactions', 'chat_reactions'];
  const attempts = [
    { table: tables[0], commentCol: 'comment_id', profileCol: 'profile_id' },
    { table: tables[0], commentCol: 'message_id', profileCol: 'user_id' },
    { table: tables[1], commentCol: 'comment_id', profileCol: 'profile_id' },
    { table: tables[1], commentCol: 'message_id', profileCol: 'user_id' },
  ];

  for (const { table, commentCol, profileCol } of attempts) {
    const { data, error } = await client
      .from(table)
      .select('id')
      .eq(commentCol, commentId)
      .eq(profileCol, profileId)
      .maybeSingle();

    if (!error) return { table, id: data?.id ?? null, commentCol, profileCol, error: null };
    if (isMissingTableError(error) || isMissingColumnError(error, commentCol) || isMissingColumnError(error, profileCol)) {
      continue;
    }
    return { table: null, id: null, commentCol, profileCol, error };
  }

  return { table: 'reactions', id: null, commentCol: 'comment_id', profileCol: 'profile_id', error: null };
}

/** Toggle vía RPC o insert/delete directo con nombres de columna canónicos o legacy. */
export async function toggleCommentReaction(client, { commentId, profileId, emoji }) {
  const { data: rpcData, error: rpcErr } = await client.rpc('toggle_comment_reaction', {
    p_comment_id: commentId,
    p_emoji: emoji,
  });

  if (!rpcErr) {
    return { action: rpcData?.action ?? null, via: 'rpc', error: null };
  }

  const rpcMissing =
    rpcErr.code === '42883' ||
    rpcErr.code === 'PGRST202' ||
    /toggle_comment_reaction/i.test(rpcErr.message ?? '');

  if (!rpcMissing) {
    return { action: null, via: 'rpc', error: rpcErr };
  }

  const { table, id, commentCol, profileCol, error: findErr } = await findExistingReaction(
    client,
    commentId,
    profileId
  );

  if (findErr) return { action: null, via: 'direct', error: findErr };

  if (id) {
    const { error: delErr } = await client.from(table).delete().eq('id', id);
    if (delErr) return { action: null, via: 'direct', error: delErr };
    return { action: 'removed', via: 'direct', error: null };
  }

  const insertPayload = { [commentCol]: commentId, [profileCol]: profileId, emoji };
  const { error: insErr } = await client.from(table).insert(insertPayload);
  if (insErr) return { action: null, via: 'direct', error: insErr };

  return { action: 'added', via: 'direct', error: null };
}
