// supabase/functions/generate-match-pdf/index.ts
// Deploy: supabase functions deploy generate-match-pdf
// Secret: PDF_SERVICE_URL → https://<tu-proyecto>.vercel.app/api/generate-pdf

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
        "id, home_team, away_team, home_score, away_score, kickoff, is_knockout, went_to_penalties, penalty_home, penalty_away, penalty_winner"
      )
      .eq("id", match_id)
      .single();
    if (mErr || !match) throw new Error("Partido no encontrado");

    const { data: pickScores } = await supabase
      .from("pick_scores")
      .select("profile_id, points_awarded")
      .eq("match_id", String(match_id));

    const profileIds = [...new Set((pickScores ?? []).map((p: { profile_id: string }) => p.profile_id))];

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, name, picks, points")
      .in("id", profileIds.length > 0 ? profileIds : ["00000000-0000-0000-0000-000000000000"]);

    const matchIdStr = String(match_id);
    const raw = (profiles ?? []).map((profile: Record<string, unknown>) => {
      const ps = (pickScores ?? []).find(
        (p: { profile_id: string }) => p.profile_id === profile.id
      ) as { points_awarded?: number } | undefined;
      const picks = profile.picks as Record<string, unknown> | null | undefined;
      const pick = picks?.[matchIdStr] ?? picks?.[match_id as string];

      let prediction: string | null = null;
      let penaltyPrediction: string | null = null;
      let penaltyPoints = 0;
      if (pick) {
        if (typeof pick === "string") prediction = pick;
        else if (typeof pick === "object" && !Array.isArray(pick)) {
          const row = pick as Record<string, unknown>;
          const hp = row.home_pick ?? row.home ?? row.local;
          const ap = row.away_pick ?? row.away ?? row.visitante;
          if (hp != null && ap != null) prediction = `${hp}-${ap}`;

          const pw = row.penalty_winner != null ? String(row.penalty_winner).trim() : "";
          const ph = row.penalty_home;
          const pa = row.penalty_away;
          const hasPenScore =
            ph != null && ph !== "" && pa != null && pa !== "";
          if (pw || hasPenScore) {
            const scorePart = hasPenScore ? `${ph}-${pa}` : "";
            penaltyPrediction = [pw, scorePart].filter(Boolean).join(" ") || null;
          }

          // Desglose del bono de penales (+1 ganador, +1 marcador exacto).
          if (match.went_to_penalties) {
            const pickWinner = pw.toLowerCase();
            const realWinner =
              match.penalty_winner != null ? String(match.penalty_winner).trim().toLowerCase() : "";
            if (pickWinner && realWinner && pickWinner === realWinner) penaltyPoints += 1;
            if (
              hasPenScore &&
              match.penalty_home != null &&
              match.penalty_away != null &&
              Number(ph) === Number(match.penalty_home) &&
              Number(pa) === Number(match.penalty_away)
            ) {
              penaltyPoints += 1;
            }
          }
        } else if (Array.isArray(pick)) {
          prediction = `${pick[0]}-${pick[1]}`;
        }
      }

      return {
        name: (profile.name as string) || (profile.username as string) || "Anónimo",
        prediction,
        penalty_prediction: penaltyPrediction,
        penalty_points: penaltyPoints,
        points: ps?.points_awarded ?? 0,
        total: (profile.points as number) ?? 0,
        no_pick: !prediction,
      };
    });

    raw.sort(
      (a: { points: number; total: number }, b: { points: number; total: number }) =>
        b.points - a.points || b.total - a.total
    );

    let lastPts = -1;
    let lastTotal = -1;
    let lastPlace = 0;
    const participants = raw.map((p: { points: number; total: number }, i: number) => {
      if (p.points !== lastPts || p.total !== lastTotal) lastPlace = i + 1;
      lastPts = p.points;
      lastTotal = p.total;
      return { ...p, place: `${lastPlace}°` };
    });

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
    if (!pdfRes.ok) throw new Error(`PDF service error ${pdfRes.status}`);

    const pdfBuffer = await pdfRes.arrayBuffer();
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
