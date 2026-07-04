import { supabase } from './supabase';
import { parsePickScore } from './communityPicks';

import { formatKickoff } from './matchUtils';

export function formatMatchDateForPdf(kickoff) {
  return formatKickoff(kickoff) ?? '';
}

function formatPredictionFromPick(pick) {
  if (!pick) return null;
  if (typeof pick === 'string') return pick;
  if (Array.isArray(pick)) return `${pick[0]}-${pick[1]}`;
  if (typeof pick === 'object') {
    const parsed = parsePickScore(pick);
    if (parsed) return `${parsed.home}-${parsed.away}`;
    const h = pick.home_pick ?? pick.home ?? pick.local ?? null;
    const a = pick.away_pick ?? pick.away ?? pick.visitante ?? null;
    if (h != null && a != null) return `${h}-${a}`;
  }
  return null;
}

function extractPickScoresFromPick(pick) {
  if (!pick) return { homePick: null, awayPick: null };
  if (typeof pick === 'string') {
    const match = pick.trim().match(/^(\d+)\s*-\s*(\d+)$/);
    if (match) return { homePick: Number(match[1]), awayPick: Number(match[2]) };
    return { homePick: null, awayPick: null };
  }
  if (Array.isArray(pick)) {
    return { homePick: Number(pick[0]), awayPick: Number(pick[1]) };
  }
  if (typeof pick === 'object') {
    const parsed = parsePickScore(pick);
    if (parsed) return { homePick: parsed.home, awayPick: parsed.away };
    const h = pick.home_pick ?? pick.home ?? pick.local ?? null;
    const a = pick.away_pick ?? pick.away ?? pick.visitante ?? null;
    if (h != null && a != null) {
      return { homePick: Number(h), awayPick: Number(a) };
    }
  }
  return { homePick: null, awayPick: null };
}

function findPickScoreRow(pickScoreRows, profileId, matchId, officialId = null) {
  const pid = String(profileId);
  const matchKeys = new Set([String(matchId)]);
  if (officialId) matchKeys.add(String(officialId));

  const rows = (pickScoreRows ?? []).filter((row) => String(row.profile_id) === pid);
  for (const row of rows) {
    if (matchKeys.has(String(row.match_id))) return row;
  }
  return rows[0];
}

function computePenaltyBreakdownForPdf(pick, match) {
  if (!match?.went_to_penalties || !pick || typeof pick !== 'object' || Array.isArray(pick)) {
    return { penaltyPoints: 0, penaltyWinnerHit: false, penaltyScoreHit: false };
  }

  let penaltyPoints = 0;
  let penaltyWinnerHit = false;
  let penaltyScoreHit = false;
  const pickWinner = pick.penalty_winner != null ? String(pick.penalty_winner).trim() : '';
  const pickHome = pick.penalty_home;
  const pickAway = pick.penalty_away;
  const realWinner =
    match.penalty_winner != null ? String(match.penalty_winner).trim() : '';

  if (pickWinner && realWinner && pickWinner === realWinner) {
    penaltyPoints += 1;
    penaltyWinnerHit = true;
  }

  if (
    pickHome != null &&
    pickHome !== '' &&
    pickAway != null &&
    pickAway !== '' &&
    match.penalty_home != null &&
    match.penalty_away != null &&
    String(pickHome) === String(match.penalty_home) &&
    String(pickAway) === String(match.penalty_away)
  ) {
    penaltyPoints += 1;
    penaltyScoreHit = true;
  }

  return { penaltyPoints, penaltyWinnerHit, penaltyScoreHit };
}

function formatPenaltyPredictionFromPick(pick) {
  if (!pick || typeof pick !== 'object' || Array.isArray(pick)) return null;
  const winner = pick.penalty_winner != null ? String(pick.penalty_winner).trim() : '';
  const home = pick.penalty_home;
  const away = pick.penalty_away;
  const hasScore =
    home != null && home !== '' && away != null && away !== '';
  if (!winner && !hasScore) return null;
  const scorePart = hasScore ? `${home}-${away}` : '';
  return [winner, scorePart].filter(Boolean).join(' ') || null;
}

/**
 * Misma forma que espera generate_pulponi_final.py / Edge Function.
 * @param {Map<string, number>|null} totalsByProfile - total histórico (acumulado
 *   hasta este partido inclusive). Si no se pasa, usa profile.points actual.
 */
export function buildResultsPdfParticipants(
  profiles,
  pickScoreRows,
  matchId,
  totalsByProfile = null,
  match = null
) {
  const matchIdStr = String(matchId);
  const officialId = match?.official_id != null ? String(match.official_id) : null;

  const raw = (profiles ?? []).map((profile) => {
    const ps = findPickScoreRow(pickScoreRows, profile.id, matchIdStr, officialId);
    const picks = profile.picks;
    const pick =
      picks && typeof picks === 'object'
        ? picks[matchIdStr] ?? picks[matchId]
        : null;
    const prediction = formatPredictionFromPick(pick);
    const { homePick, awayPick } = extractPickScoresFromPick(pick);
    const penaltyPrediction = formatPenaltyPredictionFromPick(pick);
    const pointsAwarded = Number(ps?.points_awarded ?? 0);
    const { penaltyPoints, penaltyWinnerHit, penaltyScoreHit } = computePenaltyBreakdownForPdf(
      pick,
      match
    );
    const ptsPenales = match?.went_to_penalties ? penaltyPoints : 0;

    const total = Number(profile.points ?? 0);

    return {
      name: profile.name || profile.username || 'Anónimo',
      prediction,
      home_pick: homePick,
      away_pick: awayPick,
      penalty_prediction: penaltyPrediction,
      penalty_winner_pick:
        pick && typeof pick === 'object' && !Array.isArray(pick)
          ? (pick.penalty_winner ?? '')
          : '',
      penalty_home_pick:
        pick && typeof pick === 'object' && !Array.isArray(pick) ? (pick.penalty_home ?? null) : null,
      penalty_away_pick:
        pick && typeof pick === 'object' && !Array.isArray(pick) ? (pick.penalty_away ?? null) : null,
      penalty_points: ptsPenales,
      penalty_winner_hit: penaltyWinnerHit,
      penalty_score_hit: penaltyScoreHit,
      points: pointsAwarded,
      total,
      no_pick: !prediction,
    };
  });

  raw.sort((a, b) => b.points - a.points || b.total - a.total);

  let lastPts = -1;
  let lastTotal = -1;
  let lastPlace = 0;

  return raw.map((p, i) => {
    if (p.points !== lastPts || p.total !== lastTotal) lastPlace = i + 1;
    lastPts = p.points;
    lastTotal = p.total;
    return { ...p, place: `${lastPlace}°` };
  });
}

export function buildResultsPdfRequestBody(match, participants) {
  return {
    home_team: match.home_team,
    away_team: match.away_team,
    home_score: Number(match.home_score),
    away_score: Number(match.away_score),
    match_date: formatMatchDateForPdf(match.kickoff),
    is_knockout: Boolean(match.is_knockout),
    went_to_penalties: Boolean(match.went_to_penalties),
    penalty_home: match.penalty_home ?? null,
    penalty_away: match.penalty_away ?? null,
    penalty_winner: match.penalty_winner ?? null,
    participants,
  };
}

export function resolvePdfServiceUrl() {
  const fromEnv = import.meta.env.VITE_PDF_SERVICE_URL?.trim();
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/generate-pdf`;
  }
  return null;
}

/**
 * Total histórico por perfil: suma de points_awarded en todos los partidos con
 * kickoff <= al de este partido (inclusive). Devuelve null si no hay kickoff.
 */
function buildPriorMatchIdSet(priorMatches) {
  const ids = new Set();
  for (const m of priorMatches ?? []) {
    ids.add(String(m.id));
    if (m.official_id) ids.add(String(m.official_id));
  }
  return ids;
}

export async function buildHistoricalTotals(match, profileIds) {
  if (!match?.kickoff || !profileIds?.length) return null;

  const { data: priorMatches, error: pmErr } = await supabase
    .from('matches')
    .select('id, official_id')
    .lte('kickoff', match.kickoff);

  if (pmErr || !priorMatches?.length) return null;

  const priorIdSet = buildPriorMatchIdSet(priorMatches);
  const totals = new Map();
  const pageSize = 1000;
  let offset = 0;

  for (;;) {
    const { data: histScores, error: hsErr } = await supabase
      .from('pick_scores')
      .select('profile_id, points_awarded, match_id')
      .in('profile_id', profileIds)
      .range(offset, offset + pageSize - 1);

    if (hsErr) return null;
    if (!histScores?.length) break;

    for (const row of histScores) {
      if (!priorIdSet.has(String(row.match_id))) continue;
      const key = String(row.profile_id);
      totals.set(key, (totals.get(key) ?? 0) + Number(row.points_awarded ?? 0));
    }

    if (histScores.length < pageSize) break;
    offset += pageSize;
  }

  return totals;
}

export async function fetchResultsPdfPayload(match) {
  const matchId = String(match.id);

  const matchKeys = [matchId];
  if (match.official_id) matchKeys.push(String(match.official_id));

  const { data: pickScores, error: psErr } = await supabase
    .from('pick_scores')
    .select('profile_id, match_id, points_awarded, exact_hit, winner_hit')
    .in('match_id', matchKeys);

  if (psErr) throw new Error(psErr.message || 'No se pudieron cargar los puntos del partido.');

  const profileIds = [...new Set((pickScores ?? []).map((p) => p.profile_id).filter(Boolean))];

  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, username, name, picks, points')
    .in('id', profileIds.length > 0 ? profileIds : ['00000000-0000-0000-0000-000000000000']);

  if (profErr) throw new Error(profErr.message || 'No se pudieron cargar los perfiles.');

  const participants = buildResultsPdfParticipants(
    profiles,
    pickScores,
    matchId,
    null,
    match
  );
  if (!participants.length) {
    throw new Error('Este partido aún no tiene puntajes registrados para generar el PDF.');
  }

  return buildResultsPdfRequestBody(match, participants);
}

export function slugifyMatchPdfLabel(match) {
  const label = `${match?.home_team ?? 'Local'} vs ${match?.away_team ?? 'Visitante'}`;
  return (
    String(label)
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .toLowerCase() || 'partido'
  );
}

export function triggerPdfBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function requestResultsPdfBlob(pdfServiceUrl, body) {
  const res = await fetch(pdfServiceUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `Error ${res.status} del servicio PDF`;
    try {
      const errJson = await res.json();
      if (errJson?.error) message = String(errJson.error);
    } catch {
      // respuesta no JSON
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  if (!blob || blob.size === 0) {
    throw new Error('El servicio PDF devolvió un archivo vacío.');
  }
  return blob;
}
