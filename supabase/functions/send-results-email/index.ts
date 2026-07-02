// supabase/functions/send-results-email/index.ts
// Deploy: supabase functions deploy send-results-email
// Secret: RESEND_API_KEY (Dashboard → Edge Functions → Secrets)
// Invocar desde admin tras puntuar: supabase.functions.invoke('send-results-email', { body: { match_id } })

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  corsHeaders,
  createServiceClient,
  formatPick,
  getPickFromProfile,
  listParticipantEmails,
  sendResendEmail,
} from '../_shared/emailUtils.ts';
import { invokeKrakenMatchMessage } from '../_shared/krakenInvoke.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { match_id } = await req.json();
    if (!match_id) {
      return new Response(JSON.stringify({ error: 'match_id requerido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createServiceClient();

    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select(
        'id, home_team, away_team, home_score, away_score, kickoff, is_knockout, went_to_penalties, penalty_winner, penalty_home, penalty_away'
      )
      .eq('id', match_id)
      .single();

    if (matchError || !match) {
      return new Response(JSON.stringify({ error: 'Match not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: pickScores } = await supabase
      .from('pick_scores')
      .select('profile_id, points_awarded, exact_hit, winner_hit')
      .eq('match_id', String(match_id));

    const profileIds = [...new Set((pickScores ?? []).map((row) => row.profile_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, name, picks, points')
      .eq('hidden', false)
      .in('id', profileIds.length > 0 ? profileIds : ['00000000-0000-0000-0000-000000000000']);

    const wentToPenalties = Boolean(match.went_to_penalties);
    const realPenWinner =
      match.penalty_winner != null ? String(match.penalty_winner).trim() : '';

    const participants = (profiles ?? [])
      .map((profile) => {
        const ps = (pickScores ?? []).find((row) => row.profile_id === profile.id);
        const pick = getPickFromProfile(profile.picks as Record<string, unknown> | null, match_id);
        const prediction = pick ? formatPick(pick) : 'Sin predicción';

        let penaltyPrediction = '—';
        let penaltyPoints = 0;
        if (pick && typeof pick === 'object' && !Array.isArray(pick)) {
          const row = pick as Record<string, unknown>;
          const pw = row.penalty_winner != null ? String(row.penalty_winner).trim() : '';
          const ph = row.penalty_home;
          const pa = row.penalty_away;
          const hasPenScore = ph != null && ph !== '' && pa != null && pa !== '';
          if (pw || hasPenScore) {
            const scorePart = hasPenScore ? `${ph}-${pa}` : '';
            penaltyPrediction = [pw, scorePart].filter(Boolean).join(' ') || '—';
          }
          if (wentToPenalties) {
            if (pw && realPenWinner && pw.toLowerCase() === realPenWinner.toLowerCase()) {
              penaltyPoints += 1;
            }
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
        }

        return {
          name: profile.name || profile.username || 'Anónimo',
          prediction,
          penaltyPrediction,
          penaltyPoints,
          points: ps?.points_awarded ?? 0,
          total: profile.points ?? 0,
          exact: ps?.exact_hit ?? false,
          winner: ps?.winner_hit ?? false,
        };
      })
      .sort((a, b) => b.points - a.points || b.total - a.total);

    const homeScore = Number(match.home_score ?? 0);
    const awayScore = Number(match.away_score ?? 0);
    const ganador =
      homeScore > awayScore ? match.home_team : awayScore > homeScore ? match.away_team : 'Empate';

    const exactos = participants.filter((p) => p.exact).length;
    const ganadores = participants.filter((p) => p.winner && !p.exact).length;
    const sinPuntos = participants.filter((p) => p.points === 0).length;

    const rows = participants
      .map((p) => {
        if (wentToPenalties) {
          const marcador = p.points - p.penaltyPoints;
          return `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${p.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;color:${p.prediction === 'Sin predicción' ? '#ef4444' : '#333'};">${p.prediction}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;color:${p.penaltyPrediction === '—' ? '#9ca3af' : '#b45309'};">${p.penaltyPrediction}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${marcador}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-weight:bold;color:${p.penaltyPoints > 0 ? '#16a34a' : '#9ca3af'};">${p.penaltyPoints > 0 ? `+${p.penaltyPoints}` : '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-weight:bold;color:#6b21a8;">${p.points}</td>
    </tr>`;
        }
        return `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${p.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;color:${p.prediction === 'Sin predicción' ? '#ef4444' : '#333'};">${p.prediction}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-weight:bold;color:${p.points === 3 ? '#16a34a' : p.points === 1 ? '#2563eb' : '#9ca3af'};">${p.points}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${p.points === 3 ? '⭐ Exacto' : p.points === 1 ? '✅ Ganador' : '❌'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-weight:bold;">${p.total}</td>
    </tr>`;
      })
      .join('');

    const penaltyResultLine = wentToPenalties
      ? `<p style="color:#b45309;margin:4px 0 0;font-weight:bold;">Penales: ${Number(match.penalty_home ?? 0)}-${Number(match.penalty_away ?? 0)}${realPenWinner ? ` (${realPenWinner} avanza)` : ''}</p>`
      : '';

    const tableHead = wentToPenalties
      ? `
        <tr style="background:#2d0a5c;">
          <th style="padding:10px 12px;color:white;text-align:left;">Participante</th>
          <th style="padding:10px 12px;color:#f9c907;text-align:center;">Predicción</th>
          <th style="padding:10px 12px;color:#f9c907;text-align:center;">Pred. Penales</th>
          <th style="padding:10px 12px;color:#f9c907;text-align:center;">Pts Marcador</th>
          <th style="padding:10px 12px;color:#f9c907;text-align:center;">Pts Penales</th>
          <th style="padding:10px 12px;color:#f9c907;text-align:center;">Total Partido</th>
        </tr>`
      : `
        <tr style="background:#2d0a5c;">
          <th style="padding:10px 12px;color:white;text-align:left;">Participante</th>
          <th style="padding:10px 12px;color:#f9c907;text-align:center;">Predicción</th>
          <th style="padding:10px 12px;color:#f9c907;text-align:center;">Pts</th>
          <th style="padding:10px 12px;color:#f9c907;text-align:center;">Resultado</th>
          <th style="padding:10px 12px;color:#f9c907;text-align:center;">Total</th>
        </tr>`;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9f9f9;">
  <div style="background:#2d0a5c;padding:32px;text-align:center;">
    <h1 style="color:white;margin:0;font-size:24px;">🦑 PULPONI CUP 2026</h1>
    <p style="color:#f9c907;margin:8px 0 0;font-size:14px;">Resultados oficiales</p>
  </div>
  <div style="background:white;padding:32px;">
    <h2 style="color:#2d0a5c;text-align:center;">${match.home_team} vs ${match.away_team}</h2>
    <div style="text-align:center;margin:16px 0;">
      <span style="font-size:48px;font-weight:bold;color:#6b21a8;">${homeScore} — ${awayScore}</span>
      <p style="color:#666;margin:4px 0;">${ganador === 'Empate' ? 'Empate' : `${ganador} gana`}</p>
      ${penaltyResultLine}
    </div>
    <div style="display:flex;justify-content:center;gap:24px;margin:16px 0;text-align:center;">
      <div><span style="font-size:24px;font-weight:bold;color:#16a34a;">${exactos}</span><br><small style="color:#666;">Exactos</small></div>
      <div><span style="font-size:24px;font-weight:bold;color:#2563eb;">${ganadores}</span><br><small style="color:#666;">Ganadores</small></div>
      <div><span style="font-size:24px;font-weight:bold;color:#9ca3af;">${sinPuntos}</span><br><small style="color:#666;">Sin puntos</small></div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-top:16px;">
      <thead>${tableHead}</thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="text-align:center;color:#999;font-size:12px;margin-top:24px;">El Kraken registró todo. 🦑</p>
  </div>
  <div style="background:#2d0a5c;padding:16px;text-align:center;">
    <p style="color:#aaa;font-size:11px;margin:0;">pulponicup.com.mx</p>
  </div>
</body>
</html>`;

    const emails = await listParticipantEmails(supabase);
    if (!emails.length) throw new Error('No hay correos de participantes');

    await sendResendEmail({
      to: emails,
      subject: `🦑 Resultados: ${match.home_team} ${homeScore}-${awayScore} ${match.away_team}`,
      html,
    });

    try {
      const kraken = await invokeKrakenMatchMessage(String(match_id), 'after');
      if (!kraken.ok) {
        console.warn('[send-results-email] kraken-messages after', kraken.status, kraken.body);
      }
    } catch (krakenErr) {
      console.warn('[send-results-email] kraken-messages after', krakenErr);
    }

    return new Response(JSON.stringify({ ok: true, message: 'Sent', match_id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[send-results-email]', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
