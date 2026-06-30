/**
 * Agregados derivados de public.pick_scores (efectividad, rachas, índice Pulpo).
 * El leaderboard usa profiles.points / profiles.exacts en Supabase como fuente de verdad.
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

export function applyPickScoreAggregatesToProfiles(profiles, aggregatesMap, { overwriteTotals = false } = {}) {
  if (!overwriteTotals) return profiles ?? [];

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

/** exacts + racha consecutiva (streak) + total_winner_hits + points derivados de pick_scores. */
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

export function applyPerformanceStatsToProfiles(profiles, statsByProfileId, { overwriteTotals = false } = {}) {
  if (!statsByProfileId?.size) return profiles ?? [];

  return (profiles ?? []).map((profile) => {
    const stats = statsByProfileId.get(String(profile.id));
    if (!stats) return profile;
    if (!overwriteTotals) return profile;
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

/**
 * Conjunto GLOBAL de partidos ya puntuados = DISTINCT match_id en pick_scores.
 * Esta es la fuente autoritativa de "partidos jugados" (igual para todos), más
 * confiable que matches.status: hay partidos puntuados que siguen como
 * 'scheduled'. Paginamos con .range() porque PostgREST limita a ~1000 filas y
 * pick_scores puede tener varios miles (muchos usuarios x partidos).
 */
export async function fetchScoredMatchIds(client) {
  const ids = new Set();
  if (!client) return ids;

  const PAGE = 1000;
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await client
      .from('pick_scores')
      .select('match_id')
      .order('match_id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.warn('[pickScoreStats] fetchScoredMatchIds', error.message);
      break;
    }
    const rows = data ?? [];
    for (const row of rows) {
      const id = String(row.match_id ?? '').trim();
      if (id) ids.add(id);
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return ids;
}

/** Partidos del Mundial ya puntuados (global): COUNT(DISTINCT match_id) en pick_scores. */
export async function fetchDistinctPlayedMatchCount(client) {
  if (!client) return { count: 0, error: null };
  const ids = await fetchScoredMatchIds(client);
  return { count: ids.size, error: null };
}

export async function enrichProfilesWithPickScores(client, profiles, { overwriteTotals = false } = {}) {
  if (!overwriteTotals) return profiles ?? [];

  const { map, error } = await fetchPickScoreAggregates(client);
  if (error) {
    console.warn('[pickScoreStats] fetch aggregates', error.message);
    return profiles ?? [];
  }
  return applyPickScoreAggregatesToProfiles(profiles, map, { overwriteTotals: true });
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
    pickScoreDerived: performanceStats,
  };
}
