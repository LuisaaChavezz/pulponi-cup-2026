import { supabase } from './supabase';
import {
  isSafeUpdateError,
  rescoreMatchById,
  scoreFinishedMatchesByIds,
  scoreMatchByTeams,
  scoreSingleFinishedMatchClient,
} from './scoringEngine';
import { resolveMatchScoringContext } from './matchPickKeyResolver';
import {
  hasRecordedScores,
  isMatchFinished,
  normalizeMatchId,
  resolveMatchForScoring,
} from './matchUtils';

export { normalizeMatchId } from './matchUtils';

function normalizeTeamName(name) {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Busca partido por nombres de equipos (orden flexible). */
export function findMatchByTeams(matches, homeTeam, awayTeam) {
  const h = normalizeTeamName(homeTeam);
  const a = normalizeTeamName(awayTeam);
  if (!h || !a) return null;

  return (
    (matches ?? []).find((m) => {
      const mh = normalizeTeamName(m.home_team);
      const ma = normalizeTeamName(m.away_team);
      return (mh === h && ma === a) || (mh === a && ma === h);
    }) ?? null
  );
}

export function buildFinalResultPatch(homeScore, awayScore) {
  return {
    home_score: Math.max(0, Math.round(Number(homeScore))),
    away_score: Math.max(0, Math.round(Number(awayScore))),
    api_status: 'FT',
    status: 'finished',
    updated_at: new Date().toISOString(),
  };
}

function isRpcMissing(error) {
  const msg = String(error?.message ?? error ?? '');
  const code = String(error?.code ?? '');
  return (
    /function.*does not exist|42883|PGRST202|not find/i.test(msg) ||
    code === '42883' ||
    code === 'PGRST202'
  );
}

function shouldFallbackTeamsRpc(error) {
  return error === 'rpc_missing' || isSafeUpdateError(error);
}

/** ID de fila en matches para UPDATE (nunca official_id ni vacío). */
function resolveDbMatchId(matchId, matches = []) {
  const key = normalizeMatchId(matchId);
  if (!key) return '';

  const { dbId, match } = resolveMatchForScoring(key, matches);
  return normalizeMatchId(dbId) || normalizeMatchId(match?.id);
}

async function updateMatchFinalResult(client, dbId, home, away) {
  const matchId = resolveDbMatchId(dbId);
  if (!matchId) {
    return { error: 'match_id_required' };
  }

  const patch = buildFinalResultPatch(home, away);
  const { error: updateError } = await client.from('matches').update(patch).eq('id', matchId);
  if (updateError) {
    console.warn('[matchScoring] match update', updateError.message);
    return { error: updateError.message };
  }

  return { match_id: matchId };
}

/**
 * Registra marcador final por equipos y puntúa vía score_match_by_teams (admin).
 */
export async function applyMatchFinalResultByTeams(
  client,
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  { matches = [], profiles, matchId } = {}
) {
  if (!client) client = supabase;

  const homeName = String(homeTeam ?? '').trim();
  const awayName = String(awayTeam ?? '').trim();
  if (!homeName || !awayName) return { error: 'teams_required' };

  const home = Math.max(0, Math.round(Number(homeScore)));
  const away = Math.max(0, Math.round(Number(awayScore)));
  if (!Number.isFinite(home) || !Number.isFinite(away)) {
    return { error: 'invalid_scores' };
  }

  const resolvedFromPanel = resolveDbMatchId(matchId, matches);
  const catalogMatch =
    findMatchByTeams(matches, homeName, awayName) ??
    (resolvedFromPanel
      ? (matches ?? []).find((m) => normalizeMatchId(m?.id) === resolvedFromPanel)
      : null);

  const dbId = resolvedFromPanel || normalizeMatchId(catalogMatch?.id);

  const ctx = await resolveMatchScoringContext(client, dbId || catalogMatch?.id || '', {
    matches,
    profiles,
  });

  const { pickKeys, primaryPickKey, match, profiles: profs } = ctx.error
    ? {
        pickKeys: [],
        primaryPickKey: '',
        match: catalogMatch,
        profiles: profiles ?? [],
      }
    : ctx;

  const resolvedMatch = match ?? catalogMatch;
  const resolvedDbId = dbId || normalizeMatchId(resolvedMatch?.id);

  const teamsScore = await scoreMatchByTeams(client, homeName, awayName, home, away);

  if (!teamsScore?.error) {
    return {
      ...teamsScore,
      match_id: teamsScore.match_id ?? resolvedDbId,
      primary_pick_key: primaryPickKey,
      pick_keys: pickKeys,
      home_score: home,
      away_score: away,
      scored_picks: Number(teamsScore.scored_picks ?? 0),
      via: teamsScore.via ?? 'score_match_by_teams',
    };
  }

  if (!shouldFallbackTeamsRpc(teamsScore.error)) {
    console.warn('[matchScoring] score_match_by_teams', teamsScore.error);
    return teamsScore;
  }

  const updateResult = await updateMatchFinalResult(client, resolvedDbId, home, away);
  if (updateResult?.error) return updateResult;

  if (!resolvedDbId || !resolvedMatch) {
    return { error: 'match_not_found', home_team: homeName, away_team: awayName };
  }

  const patchedMatch = { ...resolvedMatch, ...buildFinalResultPatch(home, away) };

  const clientScore = await scoreSingleFinishedMatchClient(client, resolvedDbId, {
    matches: [patchedMatch, ...(matches ?? [])],
    profiles: profs,
    pickKeysOverride: pickKeys,
    finalScores: { home, away },
    requireFinishedStatus: false,
  });
  if (clientScore?.error) return clientScore;

  const scoredPicks = Number(clientScore.scored_picks ?? 0);
  if (scoredPicks > 0) {
    const { error: streakErr } = await client.rpc('recompute_profile_streaks');
    if (streakErr && !isRpcMissing(streakErr)) {
      console.warn('[matchScoring] recompute_profile_streaks', streakErr.message);
    }
    const { error: pulpoErr } = await client.rpc('recompute_all_pulpo_indexes');
    if (pulpoErr && !isRpcMissing(pulpoErr) && !/WHERE clause/i.test(String(pulpoErr.message ?? ''))) {
      console.warn('[matchScoring] recompute_all_pulpo_indexes', pulpoErr.message);
    }
  }

  return {
    match_id: resolvedDbId,
    home_team: homeName,
    away_team: awayName,
    primary_pick_key: primaryPickKey,
    pick_keys: pickKeys,
    home_score: home,
    away_score: away,
    scored_picks: scoredPicks,
    via: clientScore.via ?? 'client_score',
  };
}

/** Corrige marcador de un partido ya puntuado (RPC rescore_match). */
export async function applyMatchRescore(
  client,
  matchId,
  homeScore,
  awayScore,
  { matches = [] } = {}
) {
  if (!client) client = supabase;

  const resolvedDbId = resolveDbMatchId(matchId, matches);
  if (!resolvedDbId) return { error: 'match_id_required' };

  const home = Math.max(0, Math.round(Number(homeScore)));
  const away = Math.max(0, Math.round(Number(awayScore)));
  if (!Number.isFinite(home) || !Number.isFinite(away)) {
    return { error: 'invalid_scores' };
  }

  const match = (matches ?? []).find((m) => normalizeMatchId(m?.id) === resolvedDbId) ?? null;
  if (!match || !isMatchFinished(match) || !hasRecordedScores(match)) {
    return { error: 'match_not_scored_yet', match_id: resolvedDbId };
  }

  const rescoreResult = await rescoreMatchById(client, resolvedDbId, home, away);
  if (rescoreResult?.error) return rescoreResult;

  return {
    ...rescoreResult,
    match_id: rescoreResult.match_id ?? resolvedDbId,
    home_score: home,
    away_score: away,
    scored_picks: Number(rescoreResult.scored_picks ?? 0),
    via: rescoreResult.via ?? 'rescore_match',
    rescored: true,
  };
}

/**
 * Registra marcador final, marca FT y puntúa todas las predicciones del partido.
 */
export async function applyMatchFinalResult(
  client,
  matchId,
  homeScore,
  awayScore,
  { matches = [], profiles } = {}
) {
  if (!client) client = supabase;

  const ctx = await resolveMatchScoringContext(client, matchId, { matches, profiles });
  if (ctx.error) return { error: ctx.error, match_id: ctx.match_id };

  const { dbId, pickKeys, primaryPickKey, match, profiles: profs } = ctx;
  if (!dbId) return { error: 'match_id_required' };

  const home = Math.max(0, Math.round(Number(homeScore)));
  const away = Math.max(0, Math.round(Number(awayScore)));
  if (!Number.isFinite(home) || !Number.isFinite(away)) {
    return { error: 'invalid_scores' };
  }

  let scoreVia = 'client_score';

  const { data: rpcData, error: rpcError } = await client.rpc('apply_match_final_result', {
    p_match_id: dbId,
    p_home_score: home,
    p_away_score: away,
  });

  if (!rpcError) {
    const payload = rpcData && typeof rpcData === 'object' ? rpcData : {};
    if (payload.error && payload.error !== 'not_finished') {
      return { error: payload.error, ...payload };
    }
    scoreVia = payload.via ?? 'rpc';
  } else if (!isRpcMissing(rpcError) && !/WHERE clause/i.test(String(rpcError.message ?? ''))) {
    console.warn('[matchScoring] RPC apply_match_final_result', rpcError.message);
    return { error: rpcError.message };
  } else {
    const updateResult = await updateMatchFinalResult(client, dbId, home, away);
    if (updateResult?.error) return updateResult;
    scoreVia = 'fallback';
  }

  const patchedMatch = { ...match, ...buildFinalResultPatch(home, away) };

  const clientScore = await scoreSingleFinishedMatchClient(client, dbId, {
    matches: [patchedMatch, ...(matches ?? [])],
    profiles: profs,
    pickKeysOverride: pickKeys,
    finalScores: { home, away },
    requireFinishedStatus: false,
  });
  if (clientScore?.error) return clientScore;

  const scoredPicks = Number(clientScore.scored_picks ?? 0);
  if (scoredPicks > 0) {
    scoreVia = clientScore.via ?? scoreVia;
    const { error: streakErr } = await client.rpc('recompute_profile_streaks');
    if (streakErr && !isRpcMissing(streakErr)) {
      console.warn('[matchScoring] recompute_profile_streaks', streakErr.message);
    }
    const { error: pulpoErr } = await client.rpc('recompute_all_pulpo_indexes');
    if (pulpoErr && !isRpcMissing(pulpoErr) && !/WHERE clause/i.test(String(pulpoErr.message ?? ''))) {
      console.warn('[matchScoring] recompute_all_pulpo_indexes', pulpoErr.message);
    }
  }

  return {
    match_id: dbId,
    primary_pick_key: primaryPickKey,
    pick_keys: pickKeys,
    home_score: home,
    away_score: away,
    scored_picks: scoredPicks,
    via: scoreVia,
  };
}

/**
 * Tras sincronizar resultados API: puntúa partidos finalizados y actualiza Pulpo/ranking.
 * @param {string[]} [finishedMatchIds] — IDs marcados FT en esta sincronización
 */
export async function scoreFinishedMatchesAfterSync(
  client,
  matches,
  { profiles, finishedMatchIds } = {}
) {
  const ids =
    finishedMatchIds?.length > 0
      ? finishedMatchIds
      : (matches ?? []).filter((m) => isMatchFinished(m)).map((m) => m.id);

  if (ids.length) {
    await scoreFinishedMatchesByIds(client, ids);
  }

  return runScoringAndPulpoPipeline(client, {
    matches,
    profiles,
    captureRanking: true,
  });
}

/** Puntúa un partido ya marcado como finalizado en Supabase (sin cambiar marcador). */
export async function scoreExistingFinishedMatch(client, matchId, ctx = {}) {
  const { dbId } = resolveMatchForScoring(matchId, ctx.matches ?? []);
  const resolvedId = dbId || String(matchId);
  const { data: row, error } = await client
    .from('matches')
    .select('*')
    .eq('id', resolvedId)
    .maybeSingle();
  if (error || !row) return { error: error?.message ?? 'match_not_found' };
  if (!isMatchFinished(row)) return { error: 'match_not_finished' };

  const scoreResult = await scoreFinishedMatchesByIds(client, [resolvedId], {
    matches: [row, ...(ctx.matches ?? [])],
    profiles: ctx.profiles,
  });

  return { ...scoreResult, match_id: resolvedId };
}
