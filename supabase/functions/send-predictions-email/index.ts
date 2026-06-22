// supabase/functions/send-predictions-email/index.ts
// Deploy: supabase functions deploy send-predictions-email
// Secret: RESEND_API_KEY (Dashboard → Edge Functions → Secrets)
// Cron:   supabase/pg_cron_send_predictions_email.sql

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  corsHeaders,
  createServiceClient,
  formatPick,
  getPickFromProfile,
  listParticipantEmails,
  sendResendEmail,
} from '../_shared/emailUtils.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createServiceClient();
    const now = new Date();
    const in10 = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('id, home_team, away_team, kickoff, status')
      .neq('status', 'finished')
      .gte('kickoff', now.toISOString())
      .lte('kickoff', in10)
      .order('kickoff', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (matchError) throw matchError;
    if (!match) {
      return new Response(JSON.stringify({ ok: true, message: 'No match in window' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: alreadySent } = await supabase
      .from('email_logs')
      .select('id')
      .eq('match_id', String(match.id))
      .eq('type', 'predictions')
      .limit(1)
      .maybeSingle();

    if (alreadySent) {
      return new Response(JSON.stringify({ ok: true, message: 'Already sent' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, name, picks')
      .neq('username', 'el-kraken')
      .not('picks', 'is', null);

    if (profilesError) throw profilesError;

    const predictions = (profiles ?? [])
      .map((profile) => {
        const picks = profile.picks as Record<string, unknown> | null;
        const pick = getPickFromProfile(picks, match.id);
        const pred = pick ? formatPick(pick) : 'Sin predicción';
        return { name: profile.name || profile.username || 'Anónimo', pred };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    const rows = predictions
      .map(
        (p) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:500;">${p.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-weight:bold;color:${p.pred === 'Sin predicción' ? '#ef4444' : '#6b21a8'};">${p.pred}</td>
    </tr>`
      )
      .join('');

    const kickoffDate = new Date(match.kickoff);
    const hora = kickoffDate.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Mexico_City',
    });

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9f9f9;">
  <div style="background:#2d0a5c;padding:32px;text-align:center;">
    <h1 style="color:white;margin:0;font-size:24px;">🦑 PULPONI CUP 2026</h1>
    <p style="color:#f9c907;margin:8px 0 0;font-size:14px;">Predicciones del partido</p>
  </div>
  <div style="background:white;padding:32px;">
    <h2 style="color:#2d0a5c;text-align:center;font-size:20px;">
      ${match.home_team} vs ${match.away_team}
    </h2>
    <p style="text-align:center;color:#666;margin-bottom:24px;">⏰ Hoy a las ${hora} hrs CDMX</p>
    <table style="width:100%;border-collapse:collapse;background:#fafafa;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#2d0a5c;">
          <th style="padding:10px 12px;color:white;text-align:left;">Participante</th>
          <th style="padding:10px 12px;color:#f9c907;text-align:center;">Predicción</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="text-align:center;color:#999;font-size:12px;margin-top:24px;">
      El Kraken observa cada predicción. 🦑
    </p>
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
      subject: `🦑 Predicciones: ${match.home_team} vs ${match.away_team} — ¡En 5 minutos!`,
      html,
    });

    const { error: logError } = await supabase.from('email_logs').insert({
      match_id: String(match.id),
      type: 'predictions',
      sent_at: now.toISOString(),
    });
    if (logError) throw logError;

    return new Response(JSON.stringify({ ok: true, message: 'Sent', match_id: match.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[send-predictions-email]', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
