import { parsePickScore } from './communityPicks';
import { isMatchFinished } from './matchUtils';

/** Reglas de puntos Pulponi (marcador exacto / ganador). */
export const SCORING_RULES = {
  exactPoints: 3,
  winnerPoints: 1,
};

/**
 * @param {{ home: number, away: number }} pick
 * @param {{ home: number, away: number }} final
 */
export function gradePick(pick, final) {
  if (!pick || !final) {
    return { points: 0, exactHit: false, winnerHit: false };
  }

  const hp = pick.home;
  const ap = pick.away;
  const fh = final.home;
  const fa = final.away;

  if (hp === fh && ap === fa) {
    return { points: SCORING_RULES.exactPoints, exactHit: true, winnerHit: true };
  }

  const pickWin =
    hp > ap ? 'home' : ap > hp ? 'away' : 'draw';
  const finalWin =
    fh > fa ? 'home' : fa > fh ? 'away' : 'draw';

  if (pickWin === finalWin) {
    return { points: SCORING_RULES.winnerPoints, exactHit: false, winnerHit: true };
  }

  return { points: 0, exactHit: false, winnerHit: false };
}

export function matchFinalScores(match) {
  if (!match || !isMatchFinished(match)) return null;
  const h = match.home_score;
  const a = match.away_score;
  if (h == null || a == null) return null;
  if (!Number.isFinite(Number(h)) || !Number.isFinite(Number(a))) return null;
  return { home: Number(h), away: Number(a) };
}

/**
 * Racha actual (última seguidilla): partidos con pick, ordenados por kickoff;
 * cuenta acierto de ganador o marcador exacto.
 */
export function computeStreakFromPickScores(pickScoreRows, matchesById) {
  const sorted = sortPickScoresByKickoff(pickScoreRows, matchesById);

  let run = 0;
  for (const row of sorted) {
    if (row.exact_hit || row.winner_hit) run += 1;
    else run = 0;
  }
  return run;
}

/**
 * Mejor racha de ganador consecutivo: partidos finalizados por kickoff;
 * solo winner_hit; sin pick o fallo rompe la racha.
 */
export function computeWinnerStreakFromPickScores(pickScoreRows, matches = []) {
  const scoresByMatch = new Map(
    (pickScoreRows ?? []).map((row) => [String(row.match_id), row])
  );

  const finished = (matches ?? [])
    .filter((m) => isMatchFinished(m))
    .sort((a, b) => compareKickoff(a, b));

  let run = 0;
  let maxRun = 0;

  for (const match of finished) {
    const row = scoresByMatch.get(String(match.id));
    if (!row) {
      run = 0;
      continue;
    }
    if (row.winner_hit) {
      run += 1;
      maxRun = Math.max(maxRun, run);
    } else {
      run = 0;
    }
  }

  return maxRun;
}

function compareKickoff(a, b) {
  const ta = a?.kickoff ? new Date(a.kickoff).getTime() : 0;
  const tb = b?.kickoff ? new Date(b.kickoff).getTime() : 0;
  if (ta !== tb) return ta - tb;
  return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
}

function sortPickScoresByKickoff(pickScoreRows, matchesById) {
  return [...(pickScoreRows ?? [])].sort((a, b) => {
    const ma = matchesById.get(String(a.match_id));
    const mb = matchesById.get(String(b.match_id));
    return compareKickoff(ma ?? { id: a.match_id }, mb ?? { id: b.match_id });
  });
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
 * Fallback cliente si aún no se ejecutó pulpo_scoring.sql en Supabase.
 */
export async function scoreAllFinishedMatchesFallback(client, { matches, profiles }) {
  const finished = (matches ?? []).filter((m) => matchFinalScores(m));
  if (!finished.length) return { scored_matches: 0, scored_picks: 0, fallback: true };

  const matchesById = new Map(finished.map((m) => [String(m.id), m]));
  let scoredPicks = 0;

  for (const match of finished) {
    const final = matchFinalScores(match);
    const mid = String(match.id);

    for (const prof of profiles ?? []) {
      const pick = parsePickScore(prof.picks?.[mid]);
      if (!pick) continue;

      const grade = gradePick(pick, final);
      const row = {
        profile_id: prof.id,
        match_id: match.id,
        points_awarded: grade.points,
        exact_hit: grade.exactHit,
        winner_hit: grade.winnerHit,
        scored_at: new Date().toISOString(),
      };

      const { error } = await client.from('pick_scores').upsert(row, {
        onConflict: 'profile_id,match_id',
      });
      if (error) {
        console.warn('[scoring] pick_scores upsert', error.message);
        continue;
      }
      scoredPicks += 1;
    }
  }

  const profileIds = [...new Set((profiles ?? []).map((p) => p.id).filter(Boolean))];

  for (const pid of profileIds) {
    const { data: rows, error } = await client
      .from('pick_scores')
      .select('match_id, points_awarded, exact_hit, winner_hit')
      .eq('profile_id', pid);

    if (error) {
      console.warn('[scoring] load pick_scores', error.message);
      continue;
    }

    const points = (rows ?? []).reduce((s, r) => s + Number(r.points_awarded ?? 0), 0);
    const exacts = (rows ?? []).filter((r) => r.exact_hit).length;
    const streak = computeStreakFromPickScores(rows ?? [], matchesById);

    const { error: uErr } = await client
      .from('profiles')
      .update({ points, exacts, streak })
      .eq('id', pid);

    if (uErr) console.warn('[scoring] profile update', pid, uErr.message);
  }

  return {
    scored_matches: finished.length,
    scored_picks: scoredPicks,
    fallback: true,
  };
}

/**
 * Puntúa un partido finalizado vía RPC (trigger en Supabase también lo hace al UPDATE).
 */
export async function scoreFinishedMatch(
  client,
  matchId,
  { recomputeStreaks = true } = {}
) {
  const resolvedMatchId = String(matchId ?? '').trim();
  if (!resolvedMatchId || resolvedMatchId === 'undefined' || resolvedMatchId === 'null') {
    return { error: 'match_id_required' };
  }

  const { data, error } = await client.rpc('score_finished_match', {
    p_match_id: resolvedMatchId,
    p_recompute_streaks: recomputeStreaks,
  });

  if (!error) {
    return { ...(data && typeof data === 'object' ? data : {}), fallback: false };
  }

  if (isRpcMissing(error)) {
    return { error: 'rpc_missing', match_id: resolvedMatchId };
  }

  console.warn('[scoring] score_finished_match', error.message);
  return { error: error.message, match_id: resolvedMatchId };
}

/** Puntúa varios partidos finalizados (idempotente; UPSERT en pick_scores). */
export async function scoreFinishedMatchesByIds(client, matchIds) {
  const ids = [...new Set((matchIds ?? []).map((id) => String(id)).filter(Boolean))];
  if (!ids.length) return { scored_matches: 0, scored_picks: 0, fallback: false };

  let scoredPicks = 0;
  let scoredMatches = 0;
  let usedFallback = false;

  for (const matchId of ids) {
    const result = await scoreFinishedMatch(client, matchId, { recomputeStreaks: false });
    if (result?.error === 'rpc_missing') {
      usedFallback = true;
      break;
    }
    if (!result?.error && !result?.skipped) {
      scoredMatches += 1;
      scoredPicks += Number(result?.scored_picks ?? 0);
    }
  }

  if (usedFallback) {
    const bulk = await scoreAllFinishedMatches(client);
    return { ...bulk, fallback: true };
  }

  if (scoredPicks > 0) {
    const { error: streakErr } = await client.rpc('recompute_profile_streaks');
    if (streakErr && !isRpcMissing(streakErr)) {
      console.warn('[scoring] recompute_profile_streaks', streakErr.message);
    }

    const { error: pulpoErr } = await client.rpc('recompute_all_pulpo_indexes');
    if (pulpoErr && !isRpcMissing(pulpoErr)) {
      console.warn('[scoring] recompute_all_pulpo_indexes', pulpoErr.message);
    }
  }

  return { scored_matches: scoredMatches, scored_picks: scoredPicks, fallback: false };
}

/**
 * Puntúa partidos finalizados vía RPC (recomendado) o fallback en cliente.
 */
export async function scoreAllFinishedMatches(
  client,
  { matches = [], profiles } = {}
) {
  const { data, error } = await client.rpc('score_all_finished_matches');

  if (!error) {
    return { ...(data && typeof data === 'object' ? data : {}), fallback: false };
  }

  if (isRpcMissing(error)) {
    console.warn('[scoring] RPC no disponible; usa supabase/pulpo_scoring.sql. Fallback cliente.');
    let profs = profiles;
    if (!profs?.length) {
      const { data: profRows } = await client.from('profiles').select('id, picks');
      profs = profRows ?? [];
    }
    return scoreAllFinishedMatchesFallback(client, { matches, profiles: profs });
  }

  console.warn('[scoring] RPC error', error.message);
  return { scored_matches: 0, scored_picks: 0, error: error.message };
}
