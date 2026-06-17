import { supabase } from './supabase';
import {
  scoreFinishedMatchesByIds,
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
