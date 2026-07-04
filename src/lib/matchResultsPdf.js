import { supabase } from './supabase';

import { formatKickoff } from './matchUtils';

export function formatMatchDateForPdf(kickoff) {
  return formatKickoff(kickoff) ?? '';
}

function buildPtsPenalesLabel(ptsPenales, winnerHit, scoreHit, wentToPenalties) {
  if (!wentToPenalties) return 'N/A';
  const detalle = [];
  if (winnerHit) detalle.push('Gan.✓');
  if (scoreHit) detalle.push('Marc.✓');
  if (detalle.length) return `+${ptsPenales} (${detalle.join(', ')})`;
  return '0';
}

export function mapGetMatchPdfRowToParticipant(row, match) {
  const homePick = row.home_pick != null ? Number(row.home_pick) : null;
  const awayPick = row.away_pick != null ? Number(row.away_pick) : null;
  const prediction = homePick != null && awayPick != null ? `${homePick}-${awayPick}` : null;
  const pw = row.penalty_winner_pick != null ? String(row.penalty_winner_pick).trim() : '';
  const ph = row.penalty_home_pick != null ? Number(row.penalty_home_pick) : null;
  const pa = row.penalty_away_pick != null ? Number(row.penalty_away_pick) : null;
  const hasPenScore = ph != null && pa != null;
  const penaltyPrediction =
    [pw, hasPenScore ? `${ph}-${pa}` : ''].filter(Boolean).join(' ') || null;
  const wentToPenalties = Boolean(match?.went_to_penalties);
  const ptsPenales = Number(row.pts_penales ?? 0);
  const ptsPartido = Number(row.pts_partido ?? 0);
  const totalAcumulado = Number(row.total_acumulado ?? 0);
  const winnerHit = Boolean(row.penalty_winner_hit);
  const scoreHit = Boolean(row.penalty_score_hit);

  return {
    name: row.name || row.username || 'Anónimo',
    prediction,
    home_pick: homePick,
    away_pick: awayPick,
    penalty_prediction: penaltyPrediction,
    penalty_winner_pick: pw,
    penalty_home_pick: ph,
    penalty_away_pick: pa,
    penalty_winner_hit: winnerHit,
    penalty_score_hit: scoreHit,
    points: Number(row.points_awarded ?? 0),
    pts_partido: ptsPartido,
    pts_penales: ptsPenales,
    pts_penales_label: buildPtsPenalesLabel(ptsPenales, winnerHit, scoreHit, wentToPenalties),
    exact_hit: Boolean(row.exact_hit),
    winner_hit: Boolean(row.winner_hit),
    total: totalAcumulado,
    total_acumulado: totalAcumulado,
    no_pick: !prediction,
  };
}

function assignPdfPlaces(participants) {
  let lastPts = -1;
  let lastTotal = -1;
  let lastPlace = 0;

  return participants.map((p, i) => {
    if (p.points !== lastPts || p.total !== lastTotal) lastPlace = i + 1;
    lastPts = p.points;
    lastTotal = p.total;
    return { ...p, place: `${lastPlace}°` };
  });
}

export async function fetchGetMatchPdfParticipants(matchId, match) {
  const { data, error } = await supabase.rpc('get_match_pdf_data', {
    p_match_id: String(matchId),
  });

  if (error) {
    throw new Error(error.message || 'No se pudieron cargar los datos del PDF.');
  }

  const raw = (data ?? []).map((row) => mapGetMatchPdfRowToParticipant(row, match));
  return assignPdfPlaces(raw);
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

export async function fetchResultsPdfPayload(match) {
  const participants = await fetchGetMatchPdfParticipants(match.id, match);
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
