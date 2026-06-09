import { supabase } from './supabase';
import { ACHIEVEMENT_CATALOG } from '../data/achievements';
import { buildAchievementGrants } from './achievementEngine';
import { buildRankedLeaderboard } from './rankingHistory';
import { fetchLeaderboardProfiles, LEADERBOARD_ACHIEVEMENT_COLUMNS } from './leaderboardQuery';

export const PARLAY_TODO_O_NADA_ID = 'parlay-todo-o-nada';
export const QUINIELA_ACEPTASTE_EL_RETO_ID = 'quiniela-aceptaste-el-reto';

function normalizeAchievementUsername(username) {
  return String(username ?? '')
    .replace(/^@+/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const QUINIELA_INSCRITO_USERNAMES = new Set(
  ['pirata12', 'luisaachavezz', 'góngora', 'gongora', 'itsmariachavez'].map((u) =>
    normalizeAchievementUsername(u)
  )
);
const PARLAY_INSCRITO_USERNAMES = new Set(
  ['jcpe', 'luisaachavezz', 'góngora', 'gongora', 'itsmariachavez'].map((u) =>
    normalizeAchievementUsername(u)
  )
);

/**
 * Al iniciar sesión: compara profile.username del usuario y desbloquea logros de inscripción.
 */
export async function syncEnrollmentAchievementsForUser(client, userId, username = null) {
  if (!userId) return { inserted: 0, newUnlocks: [] };

  let rawUsername = username;
  if (!rawUsername) {
    const { data, error } = await client
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.warn('[achievementSync] enrollment profile', error.message);
      return { inserted: 0, newUnlocks: [] };
    }
    rawUsername = data?.username ?? '';
  }

  const normalized = normalizeAchievementUsername(rawUsername);
  console.log('[achievementSync] enrollment username compare', {
    userId,
    rawUsername,
    normalized,
  });

  const quinielaMatch = QUINIELA_INSCRITO_USERNAMES.has(normalized);
  const parlayMatch = PARLAY_INSCRITO_USERNAMES.has(normalized);
  console.log('[achievementSync] enrollment match', { quinielaMatch, parlayMatch });

  const targetBadgeIds = [];
  if (quinielaMatch) targetBadgeIds.push(QUINIELA_ACEPTASTE_EL_RETO_ID);
  if (parlayMatch) targetBadgeIds.push(PARLAY_TODO_O_NADA_ID);
  if (!targetBadgeIds.length) return { inserted: 0, newUnlocks: [] };

  const grants = targetBadgeIds.map((badge_id) => ({ profile_id: userId, badge_id }));
  console.log('[achievementSync] user_badges insert attempt', {
    username: rawUsername,
    profile_id: userId,
    badge_ids: targetBadgeIds,
  });

  const result = await upsertUserBadgeRows(client, grants);
  console.log('[achievementSync] user_badges upsert result', {
    username: rawUsername,
    profile_id: userId,
    badge_ids: targetBadgeIds,
    inserted: result.inserted ?? 0,
    newUnlocks: result.newUnlocks ?? [],
    data: result.data ?? null,
    error: result.error ?? null,
    errorDetail: result.errorDetail ?? null,
  });
  const newUnlocks = result.newUnlocks ?? [];

  for (const unlock of newUnlocks) {
    await client.from('activity_log').insert({
      profile_id: userId,
      action: 'badge_unlocked',
      payload: { badge_id: unlock.badge_id },
    });
  }

  return result;
}

async function loadPickScores(client) {
  const { data, error } = await client
    .from('pick_scores')
    .select('profile_id, match_id, exact_hit, winner_hit');
  if (error) {
    console.warn('[achievementSync] pick_scores', error.message);
    return [];
  }
  return data ?? [];
}

async function loadRankingHistoryContext(client) {
  try {
    const { data: jornadas, error: jErr } = await client
      .from('ranking_jornadas')
      .select('id')
      .order('id', { ascending: false })
      .limit(3);
    if (jErr) throw jErr;

    const ids = (jornadas ?? []).map((j) => j.id);
    if (!ids.length) return { rankingHistoryRows: [], recentJornadaIds: [] };

    const { data: history, error: hErr } = await client
      .from('ranking_history')
      .select('profile_id, jornada_id, rank_position')
      .in('jornada_id', ids);
    if (hErr) throw hErr;

    return { rankingHistoryRows: history ?? [], recentJornadaIds: ids };
  } catch (e) {
    console.warn('[achievementSync] ranking history', e?.message ?? e);
    return { rankingHistoryRows: [], recentJornadaIds: [] };
  }
}

/** Inserta logros en user_badges (profile_id, badge_id, earned_at) sin duplicar. */
async function upsertUserBadgeRows(client, rows) {
  if (!rows?.length) return { inserted: 0, newUnlocks: [] };

  const payload = rows.map(({ profile_id, badge_id }) => ({
    profile_id,
    badge_id,
    earned_at: new Date().toISOString(),
  }));

  const { data, error } = await client
    .from('user_badges')
    .insert(payload, { onConflict: 'profile_id,badge_id', ignoreDuplicates: true })
    .select('profile_id, badge_id, earned_at');

  if (error) {
    console.error(
      '═══════════════════════════════════════════════════════════════',
      '\n🚨 ERROR AL INSERTAR user_badges — DESBLOQUEO DE LOGROS FALLÓ 🚨',
      '\n═══════════════════════════════════════════════════════════════',
      '\nmessage:', error.message,
      '\ncode:', error.code,
      '\ndetails:', error.details,
      '\nhint:', error.hint,
      '\npayload:', payload,
      '\nerror completo:', error,
      '\n═══════════════════════════════════════════════════════════════'
    );
    return {
      inserted: 0,
      newUnlocks: [],
      error: error.message,
      errorDetail: {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        raw: error,
      },
    };
  }

  const newUnlocks = Array.isArray(data) ? data : [];
  return { inserted: newUnlocks.length, newUnlocks, data, error: null };
}

async function loadExistingUserBadgeKeys(client) {
  const { data, error } = await client.from('user_badges').select('profile_id, badge_id');
  if (error) {
    console.warn('[achievementSync] user_badges', error.message);
    return new Set();
  }
  return new Set((data ?? []).map((r) => `${r.profile_id}:${r.badge_id}`));
}

async function grantAchievements(client, grants) {
  if (!grants.length) return { inserted: 0, newUnlocks: [] };

  const { data, error } = await client.rpc('grant_user_achievements', { grants });

  if (!error) {
    const newUnlocks = data?.new_unlocks ?? [];
    return {
      inserted: Number(data?.inserted ?? newUnlocks.length ?? 0),
      newUnlocks: Array.isArray(newUnlocks) ? newUnlocks : [],
    };
  }

  if (!/function.*does not exist|42883|PGRST202|not find/i.test(String(error.message ?? error))) {
    console.warn('[achievementSync] RPC grant_user_achievements', error.message);
    return { inserted: 0, newUnlocks: [], error: error.message };
  }

  let inserted = 0;
  const newUnlocks = [];
  for (const row of grants) {
    const { error: insErr } = await client.from('user_badges').insert(row);
    if (!insErr) {
      inserted += 1;
      newUnlocks.push(row);
    } else if (!/duplicate|unique|23505/i.test(String(insErr.message ?? insErr))) {
      console.warn('[achievementSync] user_badges insert', insErr.message);
    }
  }
  return { inserted, newUnlocks, fallback: true };
}

/**
 * Evalúa y persiste logros para todos los perfiles con datos reales.
 * @returns {{ inserted: number, newUnlocks: Array, newForUser: Array }}
 */
export async function syncAllAchievements(
  client = supabase,
  { profiles, communityProfiles, userId, username } = {}
) {
  let profs = profiles;
  if (!profs?.length) {
    const { data } = await fetchLeaderboardProfiles(client, LEADERBOARD_ACHIEVEMENT_COLUMNS);
    profs = data ?? [];
  }

  let community = communityProfiles ?? [];
  if (!community.length) {
    const { data } = await fetchLeaderboardProfiles(client, 'id, picks');
    community = data ?? [];
  }

  const [pickScoreRows, existingKeys, historyCtx] = await Promise.all([
    loadPickScores(client),
    loadExistingUserBadgeKeys(client),
    loadRankingHistoryContext(client),
  ]);

  const rankedProfiles = buildRankedLeaderboard(profs);
  const context = {
    rankedProfiles,
    pickScoreRows,
    communityProfiles: community,
    ...historyCtx,
  };

  const engineGrants = buildAchievementGrants(profs, context, existingKeys);
  const engineResult = await grantAchievements(client, engineGrants);

  const engineNewForUser = (engineResult.newUnlocks ?? []).filter((r) => r.profile_id === userId);
  if (engineNewForUser.length) {
    for (const unlock of engineNewForUser) {
      await client.from('activity_log').insert({
        profile_id: userId,
        action: 'badge_unlocked',
        payload: { badge_id: unlock.badge_id },
      });
    }
  }

  const enrollmentResult = userId
    ? await syncEnrollmentAchievementsForUser(client, userId, username)
    : { inserted: 0, newUnlocks: [] };

  const newUnlocks = [...(engineResult.newUnlocks ?? []), ...(enrollmentResult.newUnlocks ?? [])];
  const newForUser = [...engineNewForUser, ...(enrollmentResult.newUnlocks ?? [])];

  return {
    inserted: Number(engineResult.inserted ?? 0) + Number(enrollmentResult.inserted ?? 0),
    newUnlocks,
    newForUser,
  };
}

export async function loadUserAchievementIds(client, userId) {
  if (!userId) return [];
  const { data, error } = await client
    .from('user_badges')
    .select('badge_id, earned_at')
    .eq('profile_id', userId)
    .order('earned_at', { ascending: false });

  if (error) {
    console.warn('[achievementSync] loadUserAchievementIds', error.message);
    return [];
  }
  return (data ?? []).map((r) => r.badge_id);
}

export async function loadAchievementCatalog(client) {
  const { data, error } = await client
    .from('badges')
    .select('id, name, description, icon')
    .order('id', { ascending: true });

  if (error || !data?.length) return null;
  return data.map((row) => {
    const staticDef = ACHIEVEMENT_CATALOG.find((a) => a.id === row.id);
    return {
      id: row.id,
      name: row.name,
      icon: row.icon ?? staticDef?.icon ?? '🏆',
      description: row.description ?? staticDef?.description ?? '',
      requirement: staticDef?.requirement ?? '',
      active: staticDef?.active !== false,
    };
  });
}
