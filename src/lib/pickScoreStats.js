/**
 * Agregados de puntuación desde public.pick_scores (fuente de verdad del ranking).
 */

import { computeStreakFromPickScores, computeWinnerStreakFromPickScores } from './scoringEngine';
import { isMatchFinished } from './matchUtils';

export function aggregatePickScoresByProfile(rows) {
  const map = new Map();
  for (const row of rows ?? []) {
    const id = String(row.profile_id ?? '');
    if (!id) continue;

    let agg = map.get(id);
    if (!agg) {
      agg = { points: 0, exacts: 0, predicted: 0, correctResults: 0 };
      map.set(id, agg);
    }

    agg.points += Number(row.points_awarded ?? 0);
    agg.predicted += 1;
    if (row.exact_hit) agg.exacts += 1;
    if (row.winner_hit) agg.correctResults += 1;
  }
  return map;
}

export function aggregatePickScoreRowsForProfile(rows) {
  const list = rows ?? [];
  const predicted = list.length;
  const correctResults = list.filter((r) => r.winner_hit).length;
  const exacts = list.filter((r) => r.exact_hit).length;
  const points = list.reduce((sum, r) => sum + Number(r.points_awarded ?? 0), 0);
  const effectiveness = predicted > 0 ? Math.round((correctResults / predicted) * 100) : 0;

  return { points, exacts, predicted, correctResults, effectiveness };
}

export function applyPickScoreAggregatesToProfiles(profiles, aggregatesMap) {
  if (!aggregatesMap?.size) {
    return (profiles ?? []).map((p) => ({ ...p, points: 0, exacts: 0 }));
  }

  return (profiles ?? []).map((profile) => {
    const agg = aggregatesMap.get(String(profile.id));
    if (!agg) {
      return { ...profile, points: 0, exacts: 0 };
    }
    return {
      ...profile,
      points: agg.points,
      exacts: agg.exacts,
    };
  });
}

/** exacts + streak + points derivados de pick_scores (fuente de verdad para ranking y logros). */
export function buildPerformanceStatsByProfile(pickScoreRows, matches = []) {
  const matchesById = new Map((matches ?? []).map((m) => [String(m.id), m]));
  const rowsByProfile = new Map();

  for (const row of pickScoreRows ?? []) {
    const pid = String(row.profile_id ?? '');
    if (!pid) continue;
    if (!rowsByProfile.has(pid)) rowsByProfile.set(pid, []);
    rowsByProfile.get(pid).push(row);
  }

  const statsByProfileId = new Map();
  const finishedMatches = (matches ?? []).filter((m) => isMatchFinished(m));

  for (const [pid, rows] of rowsByProfile) {
    statsByProfileId.set(pid, {
      points: rows.reduce((sum, r) => sum + Number(r.points_awarded ?? 0), 0),
      exacts: rows.filter((r) => r.exact_hit).length,
      streak: computeStreakFromPickScores(rows, matchesById),
      winnerStreak: computeWinnerStreakFromPickScores(rows, finishedMatches),
      predicted: rows.length,
      correctResults: rows.filter((r) => r.winner_hit).length,
    });
  }

  return statsByProfileId;
}

export function getPerformanceStatsForProfile(profileId, pickScoreRows, matches = []) {
  const map = buildPerformanceStatsByProfile(pickScoreRows, matches);
  return (
    map.get(String(profileId)) ?? {
      points: 0,
      exacts: 0,
      streak: 0,
      winnerStreak: 0,
      predicted: 0,
      correctResults: 0,
    }
  );
}

export function applyPerformanceStatsToProfiles(profiles, statsByProfileId) {
  if (!statsByProfileId?.size) return profiles ?? [];

  return (profiles ?? []).map((profile) => {
    const stats = statsByProfileId.get(String(profile.id));
    if (!stats) return profile;
    return {
      ...profile,
      points: stats.points,
      exacts: stats.exacts,
      streak: stats.streak,
    };
  });
}

export async function fetchPickScoreAggregates(client) {
  if (!client) return { map: new Map(), error: null };

  const { data, error } = await client
    .from('pick_scores')
    .select('profile_id, points_awarded, exact_hit, winner_hit');

  if (error) return { map: new Map(), error };

  return { map: aggregatePickScoresByProfile(data ?? []), error: null };
}

/** Partidos del Mundial ya puntuados (global): COUNT(DISTINCT match_id) en pick_scores. */
export async function fetchDistinctPlayedMatchCount(client) {
  if (!client) return { count: 0, error: null };

  const { data, error } = await client.from('pick_scores').select('match_id');
  if (error) return { count: 0, error };

  const distinct = new Set(
    (data ?? []).map((row) => String(row.match_id ?? '').trim()).filter(Boolean)
  );
  return { count: distinct.size, error: null };
}

export async function enrichProfilesWithPickScores(client, profiles) {
  const { map, error } = await fetchPickScoreAggregates(client);
  if (error) {
    console.warn('[pickScoreStats] fetch aggregates', error.message);
    return profiles ?? [];
  }
  return applyPickScoreAggregatesToProfiles(profiles, map);
}

export async function enrichProfileWithPickScores(client, profile, matches = []) {
  if (!client || !profile?.id) return profile;

  const { data, error } = await client
    .from('pick_scores')
    .select('profile_id, match_id, points_awarded, exact_hit, winner_hit')
    .eq('profile_id', profile.id);

  if (error) {
    console.warn('[pickScoreStats] fetch profile scores', error.message);
    return profile;
  }

  const rows = data ?? [];
  const performanceStats = getPerformanceStatsForProfile(profile.id, rows, matches);
  return {
    ...profile,
    points: performanceStats.points,
    exacts: performanceStats.exacts,
    streak: performanceStats.streak,
  };
}
