// supabase/functions/generate-user-summary-pdf/index.ts
// Deploy: supabase functions deploy generate-user-summary-pdf
// Genera un PDF compacto (1 página) con todas las predicciones jugadas de un usuario.
// Secret: PDF_SERVICE_URL → https://<tu-proyecto>.vercel.app/api/generate-pdf
//   (de ahí se deriva https://<tu-proyecto>.vercel.app/api/generate-user-summary)
//   Opcional: USER_SUMMARY_PDF_SERVICE_URL para forzar la URL del servicio.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function resolvePdfUrl(): string {
  const explicit = Deno.env.get("USER_SUMMARY_PDF_SERVICE_URL");
  if (explicit) return explicit;
  const base = Deno.env.get("PDF_SERVICE_URL");
  if (!base) throw new Error("PDF_SERVICE_URL no configurada en Supabase");
  return base.replace(/generate-pdf(\/?)$/, "generate-user-summary$1");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { profile_id } = await req.json();
    if (!profile_id) throw new Error("profile_id requerido");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("id, username, name, points, picks")
      .eq("id", profile_id)
      .single();
    if (pErr || !profile) throw new Error("Perfil no encontrado");

    const { data: scores } = await supabase
      .from("pick_scores")
      .select("match_id, points_awarded, exact_hit, winner_hit")
      .eq("profile_id", profile_id);

    const scoreList = scores ?? [];
    const matchIds = [...new Set(scoreList.map((s: { match_id: string }) => String(s.match_id)))];

    const { data: matches } = await supabase
      .from("matches")
      .select("id, home_team, away_team, home_score, away_score, kickoff")
      .in("id", matchIds.length > 0 ? matchIds : ["__none__"]);

    const matchById = new Map<string, Record<string, unknown>>();
    for (const m of matches ?? []) matchById.set(String((m as { id: string }).id), m);

    const picks = (profile.picks as Record<string, unknown> | null) ?? {};

    type Row = {
      match: string;
      final: string;
      prediction: string;
      points: number;
      kickoff: number;
    };

    let exactos = 0;
    let ganadores = 0;
    let fallos = 0;

    const rows: Row[] = [];
    for (const s of scoreList) {
      const score = s as {
        match_id: string;
        points_awarded?: number;
        exact_hit?: boolean;
        winner_hit?: boolean;
      };
      const m = matchById.get(String(score.match_id));
      if (!m) continue;

      const home = (m.home_team as string) ?? "?";
      const away = (m.away_team as string) ?? "?";
      const hs = m.home_score as number | null;
      const as = m.away_score as number | null;
      const final = hs != null && as != null ? `${hs}-${as}` : "—";

      let prediction = "—";
      const pick = picks[String(score.match_id)];
      if (pick && typeof pick === "object" && !Array.isArray(pick)) {
        const row = pick as Record<string, unknown>;
        const hp = row.home_pick ?? row.home ?? row.local;
        const ap = row.away_pick ?? row.away ?? row.visitante;
        if (hp != null && ap != null) prediction = `${hp}-${ap}`;
      } else if (Array.isArray(pick)) {
        prediction = `${pick[0]}-${pick[1]}`;
      } else if (typeof pick === "string") {
        prediction = pick;
      }

      const points = score.points_awarded ?? 0;
      if (score.exact_hit) exactos += 1;
      else if (score.winner_hit) ganadores += 1;
      else fallos += 1;

      const kickoffMs = m.kickoff ? new Date(m.kickoff as string).getTime() : 0;

      rows.push({
        match: `${home} vs ${away}`,
        final,
        prediction,
        points,
        kickoff: kickoffMs,
      });
    }

    rows.sort((a, b) => a.kickoff - b.kickoff);

    const totalPoints =
      (profile.points as number) ??
      rows.reduce((acc, r) => acc + (r.points || 0), 0);

    const summary = {
      exactos,
      ganadores,
      fallos,
      total: totalPoints,
    };

    const pdfRes = await fetch(resolvePdfUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_name: (profile.name as string) || (profile.username as string) || "Jugador",
        total_points: totalPoints,
        rows: rows.map(({ kickoff: _k, ...rest }) => rest),
        summary,
      }),
    });
    if (!pdfRes.ok) throw new Error(`PDF service error ${pdfRes.status}`);

    const pdfBuffer = await pdfRes.arrayBuffer();
    const safe = String((profile.name as string) || (profile.username as string) || "jugador")
      .replace(/\s+/g, "_")
      .toLowerCase();

    return new Response(pdfBuffer, {
      headers: {
        ...CORS,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="pulponi-resumen-${safe}.pdf"`,
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
