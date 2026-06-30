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

function buildPenaltyReal(m: Record<string, unknown>): string | null {
  if (!m.went_to_penalties || m.penalty_winner == null) return null;
  const winner = String(m.penalty_winner).trim();
  const ph = m.penalty_home;
  const pa = m.penalty_away;
  return ph != null && pa != null ? `${ph}-${pa} (${winner} avanza)` : `${winner} avanza`;
}

function buildPenalty(
  pick: unknown,
  m: Record<string, unknown>
): { pred: string | null; points: number } {
  if (!pick || typeof pick !== "object" || Array.isArray(pick)) return { pred: null, points: 0 };
  const prow = pick as Record<string, unknown>;
  const pw = prow.penalty_winner != null ? String(prow.penalty_winner).trim() : "";
  const ph = prow.penalty_home;
  const pa = prow.penalty_away;
  const hasScore = ph != null && ph !== "" && pa != null && pa !== "";
  if (!pw && !hasScore) return { pred: null, points: 0 };
  const pred = [pw, hasScore ? `${ph}-${pa}` : ""].filter(Boolean).join(" ") || null;
  let points = 0;
  if (m.went_to_penalties && m.penalty_winner != null) {
    if (pw && pw.toLowerCase() === String(m.penalty_winner).trim().toLowerCase()) points += 1;
    if (
      hasScore &&
      m.penalty_home != null &&
      m.penalty_away != null &&
      Number(ph) === Number(m.penalty_home) &&
      Number(pa) === Number(m.penalty_away)
    ) {
      points += 1;
    }
  }
  return { pred, points };
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

    // pick_scores de TODOS los participantes. PostgREST limita cada respuesta a
    // ~1000 filas por defecto, así que con muchos usuarios (26 x 76 ≈ 1900) una
    // sola consulta truncaría datos y a varios usuarios les faltarían partidos.
    // Por eso paginamos con .range() hasta traer absolutamente todas las filas.
    const scoresByProfile = new Map<string, Array<Record<string, unknown>>>();
    if (profileIds.length > 0) {
      const PAGE = 1000;
      let from = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data: page, error: pageErr } = await supabase
          .from("pick_scores")
          .select("profile_id, match_id, points_awarded, exact_hit, winner_hit")
          .in("profile_id", profileIds)
          .order("profile_id", { ascending: true })
          .order("match_id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (pageErr) throw new Error(`pick_scores: ${pageErr.message}`);
        const rows = page ?? [];
        for (const s of rows) {
          const row = s as { profile_id: string; match_id: string };
          const key = String(row.profile_id);
          if (!scoresByProfile.has(key)) scoresByProfile.set(key, []);
          scoresByProfile.get(key)!.push(s as Record<string, unknown>);
        }
        if (rows.length < PAGE) break;
        from += PAGE;
      }
    }

    // Conjunto GLOBAL de partidos puntuados (DISTINCT match_id en pick_scores).
    // Es la base autoritativa de "partidos jugados" e igual para todos. NO se usa
    // matches.status='finished' porque hay partidos puntuados que siguen como
    // 'scheduled' (se perderían) y partidos 'scheduled' con marcador de relleno
    // que NO están puntuados (no deben contar).
    const scoredIdSet = new Set<string>();
    for (const arr of scoresByProfile.values()) {
      for (const s of arr) {
        const mid = (s as { match_id?: unknown }).match_id;
        if (mid != null) scoredIdSet.add(String(mid));
      }
    }

    // Cargar esos partidos (en lotes; resolviendo por id y por official_id).
    const finishedMatches: Array<Record<string, unknown>> = [];
    {
      const ids = [...scoredIdSet];
      const matchByKey = new Map<string, Record<string, unknown>>();
      const CHUNK = 150;
      const COLS =
        "id, official_id, home_team, away_team, home_score, away_score, kickoff, is_knockout, round_name, went_to_penalties, penalty_winner, penalty_home, penalty_away";
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const { data: byId } = await supabase.from("matches").select(COLS).in("id", chunk);
        for (const m of byId ?? []) {
          const row = m as Record<string, unknown>;
          matchByKey.set(String(row.id), row);
          if (row.official_id != null) matchByKey.set(String(row.official_id), row);
        }
        const missing = chunk.filter((id) => !matchByKey.has(id));
        if (missing.length > 0) {
          const { data: byOff } = await supabase.from("matches").select(COLS).in("official_id", missing);
          for (const m of byOff ?? []) {
            const row = m as Record<string, unknown>;
            matchByKey.set(String(row.id), row);
            if (row.official_id != null) matchByKey.set(String(row.official_id), row);
          }
        }
      }
      const uniq = new Map<string, Record<string, unknown>>();
      for (const m of matchByKey.values()) uniq.set(String(m.id), m);
      finishedMatches.push(...uniq.values());
      finishedMatches.sort((a, b) => {
        const ta = a.kickoff ? new Date(a.kickoff as string).getTime() : 0;
        const tb = b.kickoff ? new Date(b.kickoff as string).getTime() : 0;
        return ta - tb;
      });
    }

    const users = profileList.map((profile: Record<string, unknown>) => {
      const picks = (profile.picks as Record<string, unknown> | null) ?? {};
      const myScores = scoresByProfile.get(String(profile.id)) ?? [];
      const scoreByMatch = new Map<
        string,
        { points_awarded?: number; exact_hit?: boolean; winner_hit?: boolean }
      >();
      for (const s of myScores) {
        const r = s as {
          match_id: string;
          points_awarded?: number;
          exact_hit?: boolean;
          winner_hit?: boolean;
        };
        scoreByMatch.set(String(r.match_id), r);
      }

      let exactos = 0;
      let ganadores = 0;
      const rows: Array<{
        match: string;
        final: string;
        prediction: string;
        points: number;
        kickoff: number;
        round_name: string;
        is_knockout: boolean;
        went_to_penalties: boolean;
        penalty_real: string | null;
        penalty_pred: string | null;
        penalty_points: number;
      }> = [];

      for (const m of finishedMatches) {
        const mid = String(m.id);
        const moff = m.official_id != null ? String(m.official_id) : null;
        const score = scoreByMatch.get(mid) ?? (moff ? scoreByMatch.get(moff) : undefined);

        const hs = m.home_score as number | null;
        const as = m.away_score as number | null;
        const final = hs != null && as != null ? `${hs}-${as}` : "—";
        const pick = picks[mid] ?? (moff ? picks[moff] : undefined);
        const prediction = buildPrediction(pick);

        if (score?.exact_hit) exactos += 1;
        else if (score?.winner_hit) ganadores += 1;

        const isKnockout = Boolean(m.is_knockout);
        const pen = isKnockout ? buildPenalty(pick, m) : { pred: null, points: 0 };

        rows.push({
          match: `${(m.home_team as string) ?? "?"} vs ${(m.away_team as string) ?? "?"}`,
          final,
          prediction,
          points: score?.points_awarded ?? 0,
          kickoff: m.kickoff ? new Date(m.kickoff as string).getTime() : 0,
          round_name: (m.round_name as string) || (isKnockout ? "Eliminatoria" : "Fase de Grupos"),
          is_knockout: isKnockout,
          went_to_penalties: Boolean(m.went_to_penalties),
          penalty_real: isKnockout ? buildPenaltyReal(m) : null,
          penalty_pred: pen.pred,
          penalty_points: pen.points,
        });
      }

      rows.sort((a, b) => a.kickoff - b.kickoff);
      const fallos = Math.max(0, rows.length - exactos - ganadores);
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
