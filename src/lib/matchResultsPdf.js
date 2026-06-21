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

/** Misma forma que espera generate_pulponi_final.py / Edge Function. */
export function buildResultsPdfParticipants(profiles, pickScoreRows, matchId) {
  const matchIdStr = String(matchId);
  const scoresByProfile = new Map(
    (pickScoreRows ?? []).map((row) => [String(row.profile_id), row])
  );

  const raw = (profiles ?? []).map((profile) => {
    const ps = scoresByProfile.get(String(profile.id));
    const picks = profile.picks;
    const pick =
      picks && typeof picks === 'object'
        ? picks[matchIdStr] ?? picks[matchId]
        : null;
    const prediction = formatPredictionFromPick(pick);

    return {
      name: profile.name || profile.username || 'Anónimo',
      prediction,
      points: Number(ps?.points_awarded ?? 0),
      total: Number(profile.points ?? 0),
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
  const matchId = String(match.id);

  const { data: pickScores, error: psErr } = await supabase
    .from('pick_scores')
    .select('profile_id, points_awarded')
    .eq('match_id', matchId);

  if (psErr) throw new Error(psErr.message || 'No se pudieron cargar los puntos del partido.');

  const profileIds = [...new Set((pickScores ?? []).map((p) => p.profile_id).filter(Boolean))];

  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, username, name, picks, points')
    .in('id', profileIds.length > 0 ? profileIds : ['00000000-0000-0000-0000-000000000000']);

  if (profErr) throw new Error(profErr.message || 'No se pudieron cargar los perfiles.');

  const participants = buildResultsPdfParticipants(profiles, pickScores, matchId);
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
