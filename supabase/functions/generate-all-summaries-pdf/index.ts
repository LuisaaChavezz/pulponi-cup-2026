// supabase/functions/generate-all-summaries-pdf/index.ts
// Deploy: supabase functions deploy generate-all-summaries-pdf
// Genera un solo PDF con el resumen de TODOS los participantes (hidden = false),
// una sección/página por usuario. Reutiliza el mismo render que el resumen individual.
// Secret: PDF_SERVICE_URL → https://<tu-proyecto>.vercel.app/api/generate-pdf
//   (de ahí se deriva https://<tu-proyecto>.vercel.app/api/generate-all-summaries)
//   Opcional: ALL_SUMMARIES_PDF_SERVICE_URL para forzar la URL del servicio.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function resolvePdfUrl(): string {
  const explicit = Deno.env.get("ALL_SUMMARIES_PDF_SERVICE_URL");
  if (explicit) return explicit;
  const base = Deno.env.get("PDF_SERVICE_URL");
  if (!base) throw new Error("PDF_SERVICE_URL no configurada en Supabase");
  return base.replace(/generate-pdf(\/?)$/, "generate-all-summaries$1");
}

function buildPrediction(pick: unknown): string {
  if (pick && typeof pick === "object" && !Array.isArray(pick)) {
    const row = pick as Record<string, unknown>;
    const hp = row.home_pick ?? row.home ?? row.local;
    const ap = row.away_pick ?? row.away ?? row.visitante;
    if (hp != null && ap != null) return `${hp}-${ap}`;
  } else if (Array.isArray(pick)) {
    return `${pick[0]}-${pick[1]}`;
  } else if (typeof pick === "string") {
    return pick;
  }
  return "—";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, name, points, picks")
      .eq("hidden", false)
      .neq("username", "el-kraken")
      .order("username", { ascending: true });

    const profileList = profiles ?? [];
    const profileIds = profileList.map((p: { id: string }) => p.id);

    // pick_scores de todos los participantes (una sola consulta).
    const scoresByProfile = new Map<string, Array<Record<string, unknown>>>();
    const matchIdSet = new Set<string>();
    if (profileIds.length > 0) {
      const { data: scores } = await supabase
        .from("pick_scores")
        .select("profile_id, match_id, points_awarded, exact_hit, winner_hit")
        .in("profile_id", profileIds);
      for (const s of scores ?? []) {
        const row = s as { profile_id: string; match_id: string };
        const key = String(row.profile_id);
        if (!scoresByProfile.has(key)) scoresByProfile.set(key, []);
        scoresByProfile.get(key)!.push(s as Record<string, unknown>);
        matchIdSet.add(String(row.match_id));
      }
    }

    // matches involucrados (en lotes para evitar IN demasiado grande).
    const matchById = new Map<string, Record<string, unknown>>();
    const matchIds = [...matchIdSet];
    const CHUNK = 200;
    for (let i = 0; i < matchIds.length; i += CHUNK) {
      const chunk = matchIds.slice(i, i + CHUNK);
      const { data: matches } = await supabase
        .from("matches")
        .select("id, home_team, away_team, home_score, away_score, kickoff")
        .in("id", chunk);
      for (const m of matches ?? []) matchById.set(String((m as { id: string }).id), m);
    }

    const users = profileList.map((profile: Record<string, unknown>) => {
      const picks = (profile.picks as Record<string, unknown> | null) ?? {};
      const myScores = scoresByProfile.get(String(profile.id)) ?? [];

      let exactos = 0;
      let ganadores = 0;
      let fallos = 0;
      const rows: Array<{ match: string; final: string; prediction: string; points: number; kickoff: number }> = [];

      for (const s of myScores) {
        const score = s as {
          match_id: string;
          points_awarded?: number;
          exact_hit?: boolean;
          winner_hit?: boolean;
        };
        const m = matchById.get(String(score.match_id));
        if (!m) continue;

        const hs = m.home_score as number | null;
        const as = m.away_score as number | null;
        const final = hs != null && as != null ? `${hs}-${as}` : "—";
        const prediction = buildPrediction(picks[String(score.match_id)]);

        if (score.exact_hit) exactos += 1;
        else if (score.winner_hit) ganadores += 1;
        else fallos += 1;

        rows.push({
          match: `${(m.home_team as string) ?? "?"} vs ${(m.away_team as string) ?? "?"}`,
          final,
          prediction,
          points: score.points_awarded ?? 0,
          kickoff: m.kickoff ? new Date(m.kickoff as string).getTime() : 0,
        });
      }

      rows.sort((a, b) => a.kickoff - b.kickoff);
      const totalPoints =
        (profile.points as number) ?? rows.reduce((acc, r) => acc + (r.points || 0), 0);

      return {
        user_name: (profile.name as string) || (profile.username as string) || "Jugador",
        total_points: totalPoints,
        rows: rows.map(({ kickoff: _k, ...rest }) => rest),
        summary: { exactos, ganadores, fallos, total: totalPoints },
      };
    });

    const pdfRes = await fetch(resolvePdfUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ users }),
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
    return new Response(pdfBuffer, {
      headers: {
        ...CORS,
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="pulponi-resumenes-todos.pdf"',
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
