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
 * Racha: partidos finalizados en orden cronológico con acierto (exacto o ganador).
 * @param {Array<{ match_id: string, exact_hit?: boolean, winner_hit?: boolean }>} pickScoreRows
 * @param {Map<string, { kickoff?: string }>} matchesById
 */
export function computeStreakFromPickScores(pickScoreRows, matchesById) {
  const sorted = [...pickScoreRows].sort((a, b) => {
    const ma = matchesById.get(String(a.match_id));
    const mb = matchesById.get(String(b.match_id));
    const ta = ma?.kickoff ? new Date(ma.kickoff).getTime() : 0;
    const tb = mb?.kickoff ? new Date(mb.kickoff).getTime() : 0;
    if (ta !== tb) return ta - tb;
    return String(a.match_id).localeCompare(String(b.match_id));
  });

  let run = 0;
  for (const row of sorted) {
    if (row.exact_hit || row.winner_hit) run += 1;
    else run = 0;
  }
  return run;
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
