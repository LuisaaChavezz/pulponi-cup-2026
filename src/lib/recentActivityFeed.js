import { resolveBadgePresentation } from '../data/achievements';
import { resolveAvatarUrl } from './avatars';
import { formatPredictionActivityMessage } from './predictionActivity';

export const ACTIVITY_TYPE_PREDICTION = 'prediction';
export const ACTIVITY_TYPE_BADGE = 'badge_unlock';

function normalizeProfile(profiles) {
  let prof = profiles;
  if (Array.isArray(prof)) prof = prof[0];
  return prof && typeof prof === 'object' ? prof : null;
}

function formatActivityUsername(prof) {
  const name = String(prof?.name ?? '').trim();
  if (name) return name.split(/\s+/)[0];
  const user = String(prof?.username ?? '').replace(/^@+/, '').trim();
  if (user) return user;
  return 'Miembro';
}

export function mapPredictionActivityRow(row, matchById, index = 0) {
  const prof = normalizeProfile(row?.profiles);
  const at = row?.created_at ? new Date(row.created_at) : null;
  return {
    id: `pred-${row?.profile_id ?? 'u'}-${row?.created_at ?? index}`,
    type: ACTIVITY_TYPE_PREDICTION,
    profile_id: row?.profile_id ?? null,
    username: formatActivityUsername(prof),
    text: formatPredictionActivityMessage(row, matchById) || 'Actividad de predicción',
    avatarUrl: resolveAvatarUrl(prof?.photo_url),
    at: at && !Number.isNaN(at.getTime()) ? at : null,
  };
}

export function mapBadgeUnlockActivityRow(row, index = 0) {
  const prof = normalizeProfile(row?.profiles);
  const badgeId = row?.badge_id ?? null;
  const display = badgeId ? resolveBadgePresentation(badgeId, row?.badges ?? null) : null;
  const earnedAt = row?.earned_at ? new Date(row.earned_at) : null;

  return {
    id: `badge-${row?.profile_id ?? 'u'}-${badgeId ?? 'b'}-${row?.earned_at ?? index}`,
    type: ACTIVITY_TYPE_BADGE,
    profile_id: row?.profile_id ?? null,
    username: formatActivityUsername(prof),
    badgeId,
    badgeName: display?.name ?? badgeId ?? 'Logro',
    badgeIcon: display?.icon ?? '🏆',
    badgeIconSrc: display?.iconSrc ?? null,
    avatarUrl: resolveAvatarUrl(prof?.photo_url),
    text: `${formatActivityUsername(prof)} desbloqueó ${display?.name ?? badgeId ?? 'un logro'}`,
    at: earnedAt && !Number.isNaN(earnedAt.getTime()) ? earnedAt : null,
  };
}

export async function loadRecentBadgeUnlockActivity(client, limit = 20) {
  if (!client) return [];

  const { data, error } = await client
    .from('user_badges')
    .select(
      'profile_id, badge_id, earned_at, profiles ( username, name, photo_url ), badges ( name, icon )'
    )
    .order('earned_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[recentActivityFeed] loadRecentBadgeUnlockActivity', error.message);
    return [];
  }

  return (data ?? []).map((row, index) => mapBadgeUnlockActivityRow(row, index));
}

export function mergeActivityFeedItems(...groups) {
  const merged = groups.flat().filter((item) => item?.at instanceof Date && !Number.isNaN(item.at.getTime()));
  merged.sort((a, b) => b.at.getTime() - a.at.getTime());
  return merged;
}
