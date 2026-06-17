import { supabase } from './supabase';
import {
  scoreFinishedMatchesByIds,
  scoreMatchByTeams,
  scoreSingleFinishedMatchClient,
} from './scoringEngine';
import { resolveMatchScoringContext } from './matchPickKeyResolver';
import { runScoringAndPulpoPipeline } from './pulpoSync';
import { isMatchFinished, normalizeMatchId, resolveMatchForScoring } from './matchUtils';

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

/**
 * Registra marcador final por equipos y puntúa (admin — score_match_by_teams).
 */
export async function applyMatchFinalResultByTeams(
  client,
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  { matches = [], profiles } = {}
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

  const catalogMatch = findMatchByTeams(matches, homeName, awayName);
  const ctx = await resolveMatchScoringContext(client, catalogMatch?.id ?? '', {
    matches,
    profiles,
  });
  if (ctx.error && !catalogMatch) return { error: ctx.error };

  const { dbId, pickKeys, primaryPickKey, match, profiles: profs } = ctx.error
    ? {
        dbId: normalizeMatchId(catalogMatch?.id),
        pickKeys: [],
        primaryPickKey: '',
        match: catalogMatch,
        profiles: profiles ?? [],
      }
    : ctx;

  let scoreVia = 'client_score';

  const { data: rpcData, error: rpcError } = await client.rpc('apply_match_final_result_by_teams', {
    p_home_team: homeName,
    p_away_team: awayName,
    p_home_score: home,
    p_away_score: away,
  });

  if (!rpcError) {
    const payload = rpcData && typeof rpcData === 'object' ? rpcData : {};
    if (payload.error) return { error: payload.error, ...payload };
    scoreVia = payload.via ?? 'admin_rpc_by_teams';

    const scoredPicks = Number(payload.scored_picks ?? 0);
    if (scoredPicks > 0) {
      return {
        ...payload,
        match_id: payload.match_id ?? dbId,
        primary_pick_key: primaryPickKey,
        pick_keys: pickKeys,
        home_score: home,
        away_score: away,
        scored_picks: scoredPicks,
        via: scoreVia,
      };
    }
  } else if (!isRpcMissing(rpcError) && !/WHERE clause/i.test(String(rpcError.message ?? ''))) {
    console.warn('[matchScoring] RPC apply_match_final_result_by_teams', rpcError.message);
    return { error: rpcError.message };
  }

  if (dbId) {
    const patch = buildFinalResultPatch(home, away);
    const { error: updateError } = await client.from('matches').update(patch).eq('id', dbId);
    if (updateError) {
      console.warn('[matchScoring] match update', updateError.message);
      return { error: updateError.message };
    }
    scoreVia = 'fallback';
  }

  const teamsScore = await scoreMatchByTeams(client, homeName, awayName, { recomputeStreaks: false });
  if (!teamsScore?.error && Number(teamsScore?.scored_picks ?? 0) > 0) {
    return {
      ...teamsScore,
      match_id: teamsScore.match_id ?? dbId,
      primary_pick_key: primaryPickKey,
      pick_keys: pickKeys,
      home_score: home,
      away_score: away,
      via: teamsScore.via ?? 'score_match_by_teams',
    };
  }

  if (!dbId || !match) {
    return { error: 'match_not_found', home_team: homeName, away_team: awayName };
  }

  const clientScore = await scoreSingleFinishedMatchClient(client, dbId, {
    matches: [match, ...(matches ?? [])],
    profiles: profs,
    pickKeysOverride: pickKeys,
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
    match_id: dbId,
    home_team: homeName,
    away_team: awayName,
    primary_pick_key: primaryPickKey,
    pick_keys: pickKeys,
    home_score: home,
    away_score: away,
    scored_picks: scoredPicks,
    via: clientScore.via ?? scoreVia,
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
    if (payload.error) return { error: payload.error, ...payload };
    scoreVia = payload.via ?? 'rpc';
  } else if (!isRpcMissing(rpcError) && !/WHERE clause/i.test(String(rpcError.message ?? ''))) {
    console.warn('[matchScoring] RPC apply_match_final_result', rpcError.message);
    return { error: rpcError.message };
  } else {
    const patch = buildFinalResultPatch(home, away);
    const { error: updateError } = await client.from('matches').update(patch).eq('id', dbId);
    if (updateError) {
      console.warn('[matchScoring] match update', updateError.message);
      return { error: updateError.message };
    }
    scoreVia = 'fallback';
  }

  const clientScore = await scoreSingleFinishedMatchClient(client, dbId, {
    matches: [match, ...(matches ?? [])],
    profiles: profs,
    pickKeysOverride: pickKeys,
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
