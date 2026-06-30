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

    // Autorización: cada quien puede descargar su propio resumen; solo un admin
    // (is_admin = true o usuario autorizado) puede descargar el de otra persona.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^[Bb]earer\s+/, "").trim();
    if (!token) throw new Error("No autenticado");
    const { data: userData, error: uErr } = await supabase.auth.getUser(token);
    const callerId = userData?.user?.id;
    if (uErr || !callerId) throw new Error("No autenticado");
    if (String(callerId) !== String(profile_id)) {
      const { data: caller } = await supabase
        .from("profiles")
        .select("is_admin, username")
        .eq("id", callerId)
        .single();
      const uname = String(caller?.username ?? "").trim().toLowerCase();
      const isAdminCaller = caller?.is_admin === true || uname === "luisaachavezz";
      if (!isAdminCaller) throw new Error("No autorizado para ver este resumen");
    }

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

    const scoreByMatch = new Map<
      string,
      { points_awarded?: number; exact_hit?: boolean; winner_hit?: boolean }
    >();
    for (const s of scores ?? []) {
      const row = s as {
        match_id: string;
        points_awarded?: number;
        exact_hit?: boolean;
        winner_hit?: boolean;
      };
      scoreByMatch.set(String(row.match_id), row);
    }

    // Conjunto GLOBAL de partidos puntuados (DISTINCT match_id en pick_scores de
    // TODOS los usuarios). Es la base autoritativa de "partidos jugados" e igual
    // para todos. NO usamos matches.status='finished' porque hay partidos
    // puntuados que siguen como 'scheduled' (se perderían) y partidos
    // 'scheduled' con marcador de relleno sin puntuar (no deben contar).
    // Paginamos porque PostgREST limita a ~1000 filas.
    const scoredIdSet = new Set<string>();
    {
      const PAGE = 1000;
      let from = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data: page, error: sErr } = await supabase
          .from("pick_scores")
          .select("match_id")
          .order("match_id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (sErr) throw new Error(`pick_scores ids: ${sErr.message}`);
        const pageRows = (page ?? []) as Array<{ match_id?: unknown }>;
        for (const r of pageRows) if (r.match_id != null) scoredIdSet.add(String(r.match_id));
        if (pageRows.length < PAGE) break;
        from += PAGE;
      }
    }

    // Cargar esos partidos (en lotes; resolviendo por id y por official_id).
    const finishedList: Array<Record<string, unknown>> = [];
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
      finishedList.push(...uniq.values());
      finishedList.sort((a, b) => {
        const ta = a.kickoff ? new Date(a.kickoff as string).getTime() : 0;
        const tb = b.kickoff ? new Date(b.kickoff as string).getTime() : 0;
        return ta - tb;
      });
    }

    const picks = (profile.picks as Record<string, unknown> | null) ?? {};

    type Row = {
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
    };

    let exactos = 0;
    let ganadores = 0;

    const rows: Row[] = [];
    for (const m of finishedList) {
      const mid = String(m.id);
      const moff = m.official_id != null ? String(m.official_id) : null;
      const score = scoreByMatch.get(mid) ?? (moff ? scoreByMatch.get(moff) : undefined);

      const home = (m.home_team as string) ?? "?";
      const away = (m.away_team as string) ?? "?";
      const hs = m.home_score as number | null;
      const as = m.away_score as number | null;
      const final = hs != null && as != null ? `${hs}-${as}` : "—";

      let prediction = "—";
      const pick = picks[mid] ?? (moff ? picks[moff] : undefined);
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

      const points = score?.points_awarded ?? 0;
      if (score?.exact_hit) exactos += 1;
      else if (score?.winner_hit) ganadores += 1;

      const isKnockout = Boolean(m.is_knockout);
      const wentToPenalties = Boolean(m.went_to_penalties);
      let penaltyReal: string | null = null;
      if (wentToPenalties && m.penalty_winner != null) {
        const winner = String(m.penalty_winner).trim();
        const ph = m.penalty_home;
        const pa = m.penalty_away;
        penaltyReal =
          ph != null && pa != null
            ? `${ph}-${pa} (${winner} avanza)`
            : `${winner} avanza`;
      }
      let penaltyPred: string | null = null;
      let penaltyPoints = 0;
      if (isKnockout && pick && typeof pick === "object" && !Array.isArray(pick)) {
        const prow = pick as Record<string, unknown>;
        const pw = prow.penalty_winner != null ? String(prow.penalty_winner).trim() : "";
        const ph = prow.penalty_home;
        const pa = prow.penalty_away;
        const hasScore = ph != null && ph !== "" && pa != null && pa !== "";
        if (pw || hasScore) {
          penaltyPred = [pw, hasScore ? `${ph}-${pa}` : ""].filter(Boolean).join(" ") || null;
        }
        if (m.went_to_penalties && m.penalty_winner != null) {
          if (pw && pw.toLowerCase() === String(m.penalty_winner).trim().toLowerCase()) {
            penaltyPoints += 1;
          }
          if (
            hasScore &&
            m.penalty_home != null &&
            m.penalty_away != null &&
            Number(ph) === Number(m.penalty_home) &&
            Number(pa) === Number(m.penalty_away)
          ) {
            penaltyPoints += 1;
          }
        }
      }

      const kickoffMs = m.kickoff ? new Date(m.kickoff as string).getTime() : 0;

      rows.push({
        match: `${home} vs ${away}`,
        final,
        prediction,
        points,
        kickoff: kickoffMs,
        round_name: (m.round_name as string) || (isKnockout ? "Eliminatoria" : "Fase de Grupos"),
        is_knockout: isKnockout,
        went_to_penalties: wentToPenalties,
        penalty_real: penaltyReal,
        penalty_pred: penaltyPred,
        penalty_points: penaltyPoints,
      });
    }

    rows.sort((a, b) => a.kickoff - b.kickoff);

    // Fallos = partidos jugados que no fueron exactos ni ganadores (incluye los
    // que el usuario no predijo, que cuentan como 0 puntos).
    const fallos = Math.max(0, rows.length - exactos - ganadores);

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
