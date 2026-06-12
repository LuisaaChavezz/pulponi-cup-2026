import { supabase } from './supabase';
import { gradePick, scoreAllFinishedMatches, scoreFinishedMatchesByIds } from './scoringEngine';
import { parsePickScore } from './communityPicks';
import { runScoringAndPulpoPipeline } from './pulpoSync';
import { isMatchFinished } from './matchUtils';

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
  if (!matchId) return { error: 'match_id_required' };

  const home = Math.max(0, Math.round(Number(homeScore)));
  const away = Math.max(0, Math.round(Number(awayScore)));
  if (!Number.isFinite(home) || !Number.isFinite(away)) {
    return { error: 'invalid_scores' };
  }

  const { data: rpcData, error: rpcError } = await client.rpc('apply_match_final_result', {
    p_match_id: String(matchId),
    p_home_score: home,
    p_away_score: away,
  });

  if (!rpcError) {
    const payload = rpcData && typeof rpcData === 'object' ? rpcData : {};
    if (payload.error) return { error: payload.error, ...payload };
    return { ...payload, via: 'rpc' };
  }

  if (!isRpcMissing(rpcError)) {
    console.warn('[matchScoring] RPC apply_match_final_result', rpcError.message);
    return { error: rpcError.message };
  }

  const patch = buildFinalResultPatch(home, away);
  const { error: updateError } = await client.from('matches').update(patch).eq('id', matchId);
  if (updateError) {
    console.warn('[matchScoring] match update', updateError.message);
    return { error: updateError.message };
  }

  const scoreResult = await scoreAllFinishedMatches(client, { matches, profiles });
  return {
    ...scoreResult,
    match_id: String(matchId),
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
  const { data: row, error } = await client.from('matches').select('*').eq('id', matchId).maybeSingle();
  if (error || !row) return { error: error?.message ?? 'match_not_found' };
  if (!isMatchFinished(row)) return { error: 'match_not_finished' };

  const final = { home: Number(row.home_score), away: Number(row.away_score) };
  let profs = ctx.profiles;
  if (!profs?.length) {
    const { data } = await client.from('profiles').select('id, picks');
    profs = data ?? [];
  }

  let scoredPicks = 0;
  const mid = String(matchId);

  for (const prof of profs) {
    const pick = parsePickScore(prof.picks?.[mid]);
    if (!pick) continue;
    const grade = gradePick(pick, final);
    const { error: uErr } = await client.from('pick_scores').upsert(
      {
        profile_id: prof.id,
        match_id: mid,
        points_awarded: grade.points,
        exact_hit: grade.exactHit,
        winner_hit: grade.winnerHit,
        scored_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id,match_id' }
    );
    if (!uErr) scoredPicks += 1;
  }

  const scoreResult = await scoreAllFinishedMatches(client, {
    matches: [row, ...(ctx.matches ?? [])],
    profiles: profs,
  });

  return { scored_picks: scoredPicks, ...scoreResult, match_id: mid };
}
