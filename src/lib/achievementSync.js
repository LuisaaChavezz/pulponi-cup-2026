import { supabase } from './supabase';
import { buildAchievementGrants } from './achievementEngine';
import { buildRankedLeaderboard } from './rankingHistory';
import { fetchLeaderboardProfiles, LEADERBOARD_ACHIEVEMENT_COLUMNS } from './leaderboardQuery';

export const PARLAY_TODO_O_NADA_ID = 'parlay-todo-o-nada';
export const QUINIELA_ACEPTASTE_EL_RETO_ID = 'quiniela-aceptaste-el-reto';

const PARLAY_INSCRITO_USERNAMES = new Set(['jcpe', 'luisaachavezz', 'gongora']);
const QUINIELA_INSCRITO_USERNAMES = new Set(['pirata12', 'luisaachavezz', 'gongora']);

function normalizeAchievementUsername(username) {
  return String(username ?? '')
    .replace(/^@+/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Logros por lista de inscritos (parlay / quiniela). */
export function buildUsernameAchievementGrants(profiles, existingKeys = new Set()) {
  const grants = [];

  for (const profile of profiles ?? []) {
    if (!profile?.id) continue;
    const user = normalizeAchievementUsername(profile.username);
    if (!user) continue;

    if (PARLAY_INSCRITO_USERNAMES.has(user)) {
      const key = `${profile.id}:${PARLAY_TODO_O_NADA_ID}`;
      if (!existingKeys.has(key)) {
        grants.push({ profile_id: profile.id, badge_id: PARLAY_TODO_O_NADA_ID });
      }
    }

    if (QUINIELA_INSCRITO_USERNAMES.has(user)) {
      const key = `${profile.id}:${QUINIELA_ACEPTASTE_EL_RETO_ID}`;
      if (!existingKeys.has(key)) {
        grants.push({ profile_id: profile.id, badge_id: QUINIELA_ACEPTASTE_EL_RETO_ID });
      }
    }
  }

  return grants;
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
  { profiles, communityProfiles, userId } = {}
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

  const grants = [
    ...buildAchievementGrants(profs, context, existingKeys),
    ...buildUsernameAchievementGrants(profs, existingKeys),
  ];
  const result = await grantAchievements(client, grants);

  const newForUser = (result.newUnlocks ?? []).filter((r) => r.profile_id === userId);

  if (newForUser.length) {
    for (const unlock of newForUser) {
      await client.from('activity_log').insert({
        profile_id: userId,
        action: 'badge_unlocked',
        payload: { badge_id: unlock.badge_id },
      });
    }
  }

  return { ...result, newForUser };
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
    .select('id, name, description, icon, requirement_text, sort_order, active')
    .order('sort_order', { ascending: true });

  if (error || !data?.length) return null;
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    icon: row.icon ?? '🏆',
    description: row.description ?? '',
    requirement: row.requirement_text ?? '',
    active: row.active !== false,
  }));
}
