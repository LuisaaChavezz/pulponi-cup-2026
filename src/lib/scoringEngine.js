import { parsePickScore } from './communityPicks';
import { isMatchFinished, resolveMatchForScoring } from './matchUtils';

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

export function matchFinalScores(match, { requireFinishedStatus = true } = {}) {
  if (!match) return null;
  if (requireFinishedStatus && !isMatchFinished(match)) return null;
  const h = match.home_score;
  const a = match.away_score;
  if (h == null || a == null) return null;
  if (!Number.isFinite(Number(h)) || !Number.isFinite(Number(a))) return null;
  return { home: Number(h), away: Number(a) };
}

/**
 * Racha consecutiva actual: partidos con pick, ordenados por kickoff;
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

/** Total de aciertos de ganador (racha acumulada en perfil). */
export function computeTotalWinnerHitsFromPickScores(pickScoreRows) {
  return (pickScoreRows ?? []).filter((row) => row.winner_hit).length;
}

/**
 * Mejor racha continua: partidos finalizados por kickoff;
 * solo winner_hit consecutivos; sin pick o fallo rompe la racha.
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

export function isSafeUpdateError(error) {
  const msg =
    typeof error === 'string' ? error : String(error?.message ?? error?.error ?? error ?? '');
  return /UPDATE requires a WHERE clause/i.test(msg);
}

function shouldUseClientScoringFallback(error) {
  return isRpcMissing(error) || isSafeUpdateError(error);
}

async function loadMatchRowForScoring(client, matchId, matches = []) {
  const { dbId, pickKeys, match: cached } = resolveMatchForScoring(matchId, matches);
  if (cached) return { row: cached, dbId, pickKeys };

  const key = dbId || String(matchId ?? '').trim();
  if (!key) return { row: null, dbId: '', pickKeys: [] };

  const { data: byId, error: byIdErr } = await client
    .from('matches')
    .select('*')
    .eq('id', key)
    .maybeSingle();
  if (!byIdErr && byId) {
    return {
      row: byId,
      dbId: String(byId.id),
      pickKeys: [String(byId.id), byId.official_id].filter(Boolean).map(String),
    };
  }

  const { data: byOfficial, error: byOfficialErr } = await client
    .from('matches')
    .select('*')
    .eq('official_id', key)
    .maybeSingle();
  if (!byOfficialErr && byOfficial) {
    return {
      row: byOfficial,
      dbId: String(byOfficial.id),
      pickKeys: [String(byOfficial.id), byOfficial.official_id].filter(Boolean).map(String),
    };
  }

  return { row: null, dbId: key, pickKeys: pickKeys.length ? pickKeys : [key] };
}

/** Puntúa un partido en cliente (sin RPC masivo). Admin puede forzar marcador sin status FT. */
export async function scoreSingleFinishedMatchClient(
  client,
  matchId,
  {
    matches = [],
    profiles,
    pickKeysOverride,
    recomputeProfiles = true,
    finalScores,
    requireFinishedStatus = true,
  } = {}
) {
  const { row, dbId, pickKeys } = await loadMatchRowForScoring(client, matchId, matches);
  if (!row) return { error: 'match_not_found', match_id: dbId || String(matchId ?? '') };

  const final =
    finalScores ??
    matchFinalScores(row, {
      requireFinishedStatus,
    });
  if (!final) return { error: 'match_not_finished', match_id: dbId };

  let profs = profiles;
  if (!profs?.length) {
    const { data } = await client.from('profiles').select('id, picks');
    profs = data ?? [];
  }

  const keys = (pickKeysOverride?.length ? pickKeysOverride : pickKeys.length
    ? pickKeys
    : [String(row.id), row.official_id].filter(Boolean).map(String))
    .filter((value, index, array) => value && array.indexOf(value) === index);

  let scoredPicks = 0;
  const affectedProfileIds = new Set();
  const matchesById = new Map([[String(row.id), row]]);

  for (const prof of profs) {
    let pick = null;
    let usedKey = null;
    for (const key of keys) {
      const candidate = parsePickScore(prof.picks?.[key]);
      if (candidate) {
        pick = candidate;
        usedKey = key;
        break;
      }
    }
    if (!pick || !usedKey) continue;

    const grade = gradePick(pick, final);
    const { error } = await client.from('pick_scores').upsert(
      {
        profile_id: prof.id,
        match_id: usedKey,
        points_awarded: grade.points,
        exact_hit: grade.exactHit,
        winner_hit: grade.winnerHit,
        scored_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id,match_id' }
    );
    if (error) {
      console.warn('[scoring] pick_scores upsert', error.message);
      continue;
    }
    scoredPicks += 1;
    affectedProfileIds.add(prof.id);
  }

  if (recomputeProfiles) {
    for (const profileId of affectedProfileIds) {
      if (!profileId) continue;

      const { data: rows, error } = await client
        .from('pick_scores')
        .select('match_id, points_awarded, exact_hit, winner_hit')
        .eq('profile_id', profileId);

      if (error) {
        console.warn('[scoring] load pick_scores', error.message);
        continue;
      }

      const points = (rows ?? []).reduce((sum, r) => sum + Number(r.points_awarded ?? 0), 0);
      const exacts = (rows ?? []).filter((r) => r.exact_hit).length;
      const streak = computeStreakFromPickScores(rows ?? [], matchesById);
      const totalWinnerHits = computeTotalWinnerHitsFromPickScores(rows ?? []);

      const { error: updateErr } = await client
        .from('profiles')
        .update({ points, exacts, streak, total_winner_hits: totalWinnerHits })
        .eq('id', profileId);

      if (updateErr) console.warn('[scoring] profile update', profileId, updateErr.message);
    }
  }

  return {
    scored_matches: 1,
    scored_picks: scoredPicks,
    match_id: dbId,
    pick_keys: keys,
    fallback: true,
    via: 'client_score',
  };
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
    if (!pid) continue;

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
    const totalWinnerHits = computeTotalWinnerHitsFromPickScores(rows ?? []);

    const { error: uErr } = await client
      .from('profiles')
      .update({ points, exacts, streak, total_winner_hits: totalWinnerHits })
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
 * Puntúa por equipos + marcador (RPC score_match_by_teams).
 */
export async function scoreMatchByTeams(client, homeTeam, awayTeam, homeScore, awayScore) {
  const pHomeTeam = String(homeTeam ?? '').trim();
  const pAwayTeam = String(awayTeam ?? '').trim();
  const pHomeScore = Math.max(0, Math.round(Number(homeScore)));
  const pAwayScore = Math.max(0, Math.round(Number(awayScore)));

  if (!pHomeTeam || !pAwayTeam) {
    return { error: 'teams_required' };
  }
  if (!Number.isFinite(pHomeScore) || !Number.isFinite(pAwayScore)) {
    return { error: 'invalid_scores' };
  }

  const { data, error } = await client.rpc('score_match_by_teams', {
    p_home_team: pHomeTeam,
    p_away_team: pAwayTeam,
    p_home_score: pHomeScore,
    p_away_score: pAwayScore,
  });

  if (!error) {
    return { ...(data && typeof data === 'object' ? data : {}), fallback: false };
  }

  if (isRpcMissing(error)) {
    return { error: 'rpc_missing', home_team: pHomeTeam, away_team: pAwayTeam };
  }

  console.warn('[scoring] score_match_by_teams', error.message);
  return { error: error.message, home_team: pHomeTeam, away_team: pAwayTeam };
}

/** Re-puntúa un partido ya calificado (RPC apply_rescore_match). */
export async function rescoreMatchById(client, matchId, homeScore, awayScore) {
  const resolvedMatchId = String(matchId ?? '').trim();
  if (!resolvedMatchId || resolvedMatchId === 'undefined' || resolvedMatchId === 'null') {
    return { error: 'match_id_required' };
  }

  const pHomeScore = Math.max(0, Math.round(Number(homeScore)));
  const pAwayScore = Math.max(0, Math.round(Number(awayScore)));
  if (!Number.isFinite(pHomeScore) || !Number.isFinite(pAwayScore)) {
    return { error: 'invalid_scores' };
  }

  const { data, error } = await client.rpc('apply_rescore_match', {
    p_match_id: resolvedMatchId,
    p_home_score: pHomeScore,
    p_away_score: pAwayScore,
  });

  if (!error) {
    return { ...(data && typeof data === 'object' ? data : {}), fallback: false };
  }

  if (isRpcMissing(error)) {
    return { error: 'rpc_missing', match_id: resolvedMatchId };
  }

  console.warn('[scoring] apply_rescore_match', error.message);
  return { error: error.message, match_id: resolvedMatchId };
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
export async function scoreFinishedMatchesByIds(client, matchIds, { matches, profiles } = {}) {
  const ids = [...new Set((matchIds ?? []).map((id) => String(id)).filter(Boolean))];
  if (!ids.length) return { scored_matches: 0, scored_picks: 0, fallback: false };

  let scoredPicks = 0;
  let scoredMatches = 0;
  let usedFallback = false;

  for (const matchId of ids) {
    const result = await scoreFinishedMatch(client, matchId, { recomputeStreaks: false });
    if (result?.error === 'rpc_missing' || isSafeUpdateError(result?.error)) {
      usedFallback = true;
      break;
    }
    if (!result?.error && !result?.skipped) {
      scoredMatches += 1;
      scoredPicks += Number(result?.scored_picks ?? 0);
    }
  }

  if (usedFallback) {
    let fallbackPicks = 0;
    let fallbackMatches = 0;
    for (const matchId of ids) {
      const one = await scoreSingleFinishedMatchClient(client, matchId, { matches, profiles });
      if (one?.error) {
        console.warn('[scoring] client score', matchId, one.error);
        continue;
      }
      fallbackMatches += 1;
      fallbackPicks += Number(one?.scored_picks ?? 0);
    }

    if (fallbackPicks > 0) {
      const { error: streakErr } = await client.rpc('recompute_profile_streaks');
      if (streakErr && !isRpcMissing(streakErr)) {
        console.warn('[scoring] recompute_profile_streaks', streakErr.message);
      }

      const { error: pulpoErr } = await client.rpc('recompute_all_pulpo_indexes');
      if (pulpoErr && !isRpcMissing(pulpoErr) && !isSafeUpdateError(pulpoErr)) {
        console.warn('[scoring] recompute_all_pulpo_indexes', pulpoErr.message);
      }
    }

    return {
      scored_matches: fallbackMatches,
      scored_picks: fallbackPicks,
      fallback: true,
    };
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

  if (shouldUseClientScoringFallback(error)) {
    console.warn('[scoring] RPC no disponible o safeupdate; fallback cliente por partido.');
    let profs = profiles;
    if (!profs?.length) {
      const { data: profRows } = await client.from('profiles').select('id, picks');
      profs = profRows ?? [];
    }

    const finished = (matches ?? []).filter((m) => matchFinalScores(m));
    if (finished.length) {
      let scoredPicks = 0;
      for (const match of finished) {
        const one = await scoreSingleFinishedMatchClient(client, match.id, { matches, profiles: profs });
        scoredPicks += Number(one?.scored_picks ?? 0);
      }
      return { scored_matches: finished.length, scored_picks: scoredPicks, fallback: true };
    }

    return scoreAllFinishedMatchesFallback(client, { matches, profiles: profs });
  }

  console.warn('[scoring] RPC error', error.message);
  return { scored_matches: 0, scored_picks: 0, error: error.message };
}
