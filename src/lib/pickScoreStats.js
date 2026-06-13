/**
 * Agregados de puntuación desde public.pick_scores (fuente de verdad del ranking).
 */

import { computeStreakFromPickScores } from './scoringEngine';

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

/** exacts + streak derivados de pick_scores (fuente de verdad para logros). */
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
  for (const [pid, rows] of rowsByProfile) {
    statsByProfileId.set(pid, {
      exacts: rows.filter((r) => r.exact_hit).length,
      streak: computeStreakFromPickScores(rows, matchesById),
    });
  }

  return statsByProfileId;
}

export function applyPerformanceStatsToProfiles(profiles, statsByProfileId) {
  if (!statsByProfileId?.size) return profiles ?? [];

  return (profiles ?? []).map((profile) => {
    const stats = statsByProfileId.get(String(profile.id));
    if (!stats) return profile;
    return { ...profile, exacts: stats.exacts, streak: stats.streak };
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

export async function enrichProfilesWithPickScores(client, profiles) {
  const { map, error } = await fetchPickScoreAggregates(client);
  if (error) {
    console.warn('[pickScoreStats] fetch aggregates', error.message);
    return profiles ?? [];
  }
  return applyPickScoreAggregatesToProfiles(profiles, map);
}

export async function enrichProfileWithPickScores(client, profile) {
  if (!client || !profile?.id) return profile;

  const { data, error } = await client
    .from('pick_scores')
    .select('profile_id, points_awarded, exact_hit, winner_hit')
    .eq('profile_id', profile.id);

  if (error) {
    console.warn('[pickScoreStats] fetch profile scores', error.message);
    return profile;
  }

  const agg = aggregatePickScoreRowsForProfile(data ?? []);
  return {
    ...profile,
    points: agg.points,
    exacts: agg.exacts,
  };
}
