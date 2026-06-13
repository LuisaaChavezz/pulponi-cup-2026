import { collectMatchPickScores, parsePickScore } from './communityPicks';
import { buildRankedLeaderboard } from './rankingHistory';
import { ACHIEVEMENT_CATALOG } from '../data/achievements';

const ACTIVE_RULES = ACHIEVEMENT_CATALOG.filter((a) => a.active);

function resolvePerformanceStats(profile, statsByProfileId) {
  const derived = statsByProfileId?.get?.(String(profile?.id));
  return {
    exacts: derived?.exacts ?? Number(profile?.exacts ?? 0),
    streak: derived?.streak ?? Number(profile?.streak ?? 0),
  };
}

export const PULPO_FUTBOLERO_OFICIAL_ID = 'pulpo-futbolero-oficial';

/** Arranque del Mundial 2026 — desbloqueo automático al abrir la app. */
export function isWorldCupKickoffOrLater(now = new Date()) {
  const threshold = new Date(2026, 5, 11);
  threshold.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return today >= threshold;
}

function pickFromProfile(profile, matchId) {
  const raw = profile?.picks?.[matchId] ?? profile?.picks?.[String(matchId)];
  return parsePickScore(raw);
}

/**
 * ¿Exacto acertado con marcador elegido por <5% de la comunidad?
 */
export function profileHasRiskyExactHit(profileId, pickScoreRows, communityProfiles) {
  const exactRows = (pickScoreRows ?? []).filter((r) => r.profile_id === profileId && r.exact_hit);
  if (!exactRows.length) return false;

  for (const row of exactRows) {
    const matchId = String(row.match_id);
    const prof = communityProfiles?.find((p) => p.id === profileId);
    const pick = pickFromProfile(prof, matchId);
    if (!pick) continue;

    const scores = collectMatchPickScores(communityProfiles, matchId);
    if (scores.length < 3) continue;

    const exactCount = scores.filter((s) => s.home === pick.home && s.away === pick.away).length;
    const pct = Math.round((exactCount / scores.length) * 100);
    if (exactCount <= 1 || pct < 5) return true;
  }

  return false;
}

/**
 * Top 5 en las últimas N jornadas guardadas.
 */
export function isTop5ForJornadas(profileId, rankingHistoryRows, jornadaIds, required = 3) {
  if (!profileId || !jornadaIds?.length || jornadaIds.length < required) return false;

  const recent = jornadaIds.slice(0, required);
  for (const jid of recent) {
    const row = (rankingHistoryRows ?? []).find(
      (r) => r.profile_id === profileId && Number(r.jornada_id) === Number(jid)
    );
    if (!row || Number(row.rank_position) > 5) return false;
  }
  return true;
}

/**
 * Devuelve IDs de logros activos que el perfil cumple ahora.
 */
export function evaluateAchievementIdsForProfile(profile, context = {}) {
  const {
    rankedProfiles = [],
    pickScoreRows = [],
    communityProfiles = [],
    rankingHistoryRows = [],
    recentJornadaIds = [],
    statsByProfileId = null,
  } = context;

  const earned = [];
  const { exacts, streak } = resolvePerformanceStats(profile, statsByProfileId);
  const pulpoIndex = Number(profile?.pulpo_index ?? 0);
  const ranked = rankedProfiles.length ? rankedProfiles : buildRankedLeaderboard([profile]);
  const me = ranked.find((r) => r.id === profile.id);
  const rank = me?.rank_position ?? null;

  if (exacts >= 1) earned.push('francotirador');
  if (exacts >= 3) earned.push('francotirador-pro');
  if (exacts >= 5) earned.push('maestro-marcador');
  if (streak >= 3) earned.push('enrachado');
  if (streak >= 5) earned.push('imparable');
  if (rank === 1) earned.push('rey-del-pulpo');
  if (pulpoIndex >= 90) earned.push('pulpo-legendario');
  if (isTop5ForJornadas(profile.id, rankingHistoryRows, recentJornadaIds, 3)) {
    earned.push('analista');
  }
  if (profileHasRiskyExactHit(profile.id, pickScoreRows, communityProfiles)) {
    earned.push('pick-salvaje');
  }
  if (isWorldCupKickoffOrLater()) {
    earned.push(PULPO_FUTBOLERO_OFICIAL_ID);
  }

  return earned.filter((id) => ACTIVE_RULES.some((a) => a.id === id));
}

export function buildAchievementGrants(profiles, context, existingKeys = new Set()) {
  const grants = [];

  for (const profile of profiles ?? []) {
    if (!profile?.id) continue;
    const earnedIds = evaluateAchievementIdsForProfile(profile, context);
    for (const badgeId of earnedIds) {
      const key = `${profile.id}:${badgeId}`;
      if (existingKeys.has(key)) continue;
      grants.push({ profile_id: profile.id, badge_id: badgeId });
    }
  }

  return grants;
}
