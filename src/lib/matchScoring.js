import { supabase } from './supabase';
import {
  scoreFinishedMatch,
  scoreFinishedMatchesByIds,
  scoreSingleFinishedMatchClient,
} from './scoringEngine';
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
  const { dbId, pickKeys } = resolveMatchForScoring(matchId, matches);
  if (!dbId) return { error: 'match_id_required' };

  const home = Math.max(0, Math.round(Number(homeScore)));
  const away = Math.max(0, Math.round(Number(awayScore)));
  if (!Number.isFinite(home) || !Number.isFinite(away)) {
    return { error: 'invalid_scores' };
  }

  const { data: rpcData, error: rpcError } = await client.rpc('apply_match_final_result', {
    p_match_id: dbId,
    p_home_score: home,
    p_away_score: away,
  });

  if (!rpcError) {
    const payload = rpcData && typeof rpcData === 'object' ? rpcData : {};
    if (payload.error) return { error: payload.error, ...payload };

    const scoredPicks = Number(payload.scored_picks ?? 0);
    if (scoredPicks <= 0) {
      for (const pickKey of pickKeys) {
        if (pickKey === dbId) continue;
        const retry = await scoreFinishedMatch(client, pickKey, { recomputeStreaks: false });
        if (!retry?.error && Number(retry?.scored_picks ?? 0) > 0) {
          return { ...payload, ...retry, via: 'rpc_pick_key_retry' };
        }
      }
    }

    return { ...payload, match_id: dbId, via: 'rpc' };
  }

  if (!isRpcMissing(rpcError) && !/WHERE clause/i.test(String(rpcError.message ?? ''))) {
    console.warn('[matchScoring] RPC apply_match_final_result', rpcError.message);
    return { error: rpcError.message };
  }

  const patch = buildFinalResultPatch(home, away);
  const { error: updateError } = await client
    .from('matches')
    .update(patch)
    .eq('id', dbId);
  if (updateError) {
    console.warn('[matchScoring] match update', updateError.message);
    return { error: updateError.message };
  }

  const scoreResult = await scoreFinishedMatchesByIds(client, [dbId], { matches, profiles });
  if (scoreResult?.error && Number(scoreResult?.scored_picks ?? 0) <= 0) {
    const clientScore = await scoreSingleFinishedMatchClient(client, dbId, { matches, profiles });
    if (!clientScore?.error) {
      return {
        ...clientScore,
        match_id: dbId,
        home_score: home,
        away_score: away,
        via: 'client_score',
      };
    }
    return clientScore;
  }

  return {
    ...scoreResult,
    match_id: dbId,
    home_score: home,
    away_score: away,
    via: 'fallback',
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
