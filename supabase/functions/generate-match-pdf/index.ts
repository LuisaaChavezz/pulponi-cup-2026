// supabase/functions/generate-match-pdf/index.ts
// Deploy: supabase functions deploy generate-match-pdf
// Secret: PDF_SERVICE_URL → https://<tu-proyecto>.vercel.app/api/generate-pdf

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type PdfDataRow = {
  username?: string | null;
  name?: string | null;
  home_pick?: number | null;
  away_pick?: number | null;
  penalty_winner_pick?: string | null;
  penalty_home_pick?: number | null;
  penalty_away_pick?: number | null;
  points_awarded?: number | null;
  exact_hit?: boolean | null;
  winner_hit?: boolean | null;
  pts_partido?: number | null;
  pts_penales?: number | null;
  penalty_winner_hit?: boolean | null;
  penalty_score_hit?: boolean | null;
  total_acumulado?: number | null;
};

function buildPtsPenalesLabel(
  ptsPenales: number,
  winnerHit: boolean,
  scoreHit: boolean,
  wentToPenalties: boolean
) {
  if (!wentToPenalties) return "N/A";
  const detalle: string[] = [];
  if (winnerHit) detalle.push("Gan.✓");
  if (scoreHit) detalle.push("Marc.✓");
  if (detalle.length) return `+${ptsPenales} (${detalle.join(", ")})`;
  return "0";
}

function mapPdfRowToParticipant(row: PdfDataRow, match: Record<string, unknown>) {
  const homePick = row.home_pick != null ? Number(row.home_pick) : null;
  const awayPick = row.away_pick != null ? Number(row.away_pick) : null;
  const prediction = homePick != null && awayPick != null ? `${homePick}-${awayPick}` : null;
  const pw = row.penalty_winner_pick != null ? String(row.penalty_winner_pick).trim() : "";
  const ph = row.penalty_home_pick != null ? Number(row.penalty_home_pick) : null;
  const pa = row.penalty_away_pick != null ? Number(row.penalty_away_pick) : null;
  const hasPenScore = ph != null && pa != null;
  const penaltyPrediction =
    [pw, hasPenScore ? `${ph}-${pa}` : ""].filter(Boolean).join(" ") || null;
  const wentToPenalties = Boolean(match.went_to_penalties);
  const ptsPenales = Number(row.pts_penales ?? 0);
  const winnerHit = Boolean(row.penalty_winner_hit);
  const scoreHit = Boolean(row.penalty_score_hit);

  return {
    name: (row.name as string) || (row.username as string) || "Anónimo",
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
    pts_partido: Number(row.pts_partido ?? 0),
    pts_penales: ptsPenales,
    pts_penales_label: buildPtsPenalesLabel(ptsPenales, winnerHit, scoreHit, wentToPenalties),
    exact_hit: Boolean(row.exact_hit),
    winner_hit: Boolean(row.winner_hit),
    total: Number(row.total_acumulado ?? 0),
    total_acumulado: Number(row.total_acumulado ?? 0),
    no_pick: !prediction,
  };
}

function assignPlaces(
  participants: Array<{ points: number; total: number; place?: string }>
) {
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { match_id } = await req.json();
    if (!match_id) throw new Error("match_id requerido");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: match, error: mErr } = await supabase
      .from("matches")
      .select(
        "id, official_id, home_team, away_team, home_score, away_score, kickoff, is_knockout, went_to_penalties, penalty_home, penalty_away, penalty_winner"
      )
      .eq("id", match_id)
      .single();
    if (mErr || !match) throw new Error("Partido no encontrado");

    const { data: pdfRows, error: pdfErr } = await supabase.rpc("get_match_pdf_data", {
      p_match_id: String(match_id),
    });
    if (pdfErr) throw new Error(pdfErr.message || "get_match_pdf_data falló");

    const raw = (pdfRows ?? []).map((row: PdfDataRow) =>
      mapPdfRowToParticipant(row, match as Record<string, unknown>)
    );
    if (!raw.length) {
      throw new Error("Este partido aún no tiene puntajes registrados para generar el PDF.");
    }

    const participants = assignPlaces(raw);

    const kickoff = new Date(match.kickoff);
    const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const meses = [
      "enero", "febrero", "marzo", "abril", "mayo", "junio",
      "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    ];
    const matchDate = `${dias[kickoff.getDay()]} ${kickoff.getDate()} de ${meses[kickoff.getMonth()]}, ${kickoff.getFullYear()}`;

    const pdfUrl = Deno.env.get("PDF_SERVICE_URL");
    if (!pdfUrl) throw new Error("PDF_SERVICE_URL no configurada en Supabase");

    const pdfRes = await fetch(pdfUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        home_team: match.home_team,
        away_team: match.away_team,
        home_score: match.home_score,
        away_score: match.away_score,
        match_date: matchDate,
        is_knockout: Boolean(match.is_knockout),
        went_to_penalties: Boolean(match.went_to_penalties),
        penalty_home: match.penalty_home ?? null,
        penalty_away: match.penalty_away ?? null,
        penalty_winner: match.penalty_winner ?? null,
        participants,
      }),
    });
    if (!pdfRes.ok) {
      const text = await pdfRes.text().catch(() => "");
      throw new Error(`PDF service error ${pdfRes.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
    }

    const pdfBuffer = await pdfRes.arrayBuffer();
    const head = new Uint8Array(pdfBuffer.slice(0, 5));
    const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46; // %PDF
    if (!isPdf) {
      throw new Error(
        "El servicio PDF no devolvió un PDF válido. Revisa PDF_SERVICE_URL (debe apuntar al dominio de producción sin protección de despliegue de Vercel)."
      );
    }
    const safe = `${match.home_team}_vs_${match.away_team}`.replace(/\s+/g, "_").toLowerCase();

    return new Response(pdfBuffer, {
      headers: {
        ...CORS,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="pulponi-${safe}.pdf"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
