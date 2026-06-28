// supabase/functions/send-update-email/index.ts
// Correo masivo de actualizaciones de la eliminatoria a todos los participantes.
// Deploy: supabase functions deploy send-update-email --project-ref lkqvrsnzlfjeppdjtwvm
// Secret: RESEND_API_KEY (Dashboard → Edge Functions → Secrets)
// Invoca manualmente (no tiene cron).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  corsHeaders,
  createServiceClient,
  listParticipantEmails,
  sendResendEmail,
} from '../_shared/emailUtils.ts';

const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0420;font-family:Arial,sans-serif;">

  <div style="background:#2d0a5c;padding:40px 20px;text-align:center;border-bottom:3px solid #f9c907;">
    <div style="font-size:48px;margin-bottom:8px;">🦑</div>
    <h1 style="color:white;margin:0;font-size:26px;">PULPONI CUP 2026</h1>
    <p style="color:#f9c907;margin:8px 0 0;font-size:13px;letter-spacing:2px;">ACTUALIZACIONES · ELIMINATORIA</p>
  </div>

  <div style="background:#1a0535;padding:32px 30px;max-width:600px;margin:0 auto;">

    <p style="color:#e0d0f0;font-size:15px;line-height:1.6;margin-bottom:24px;">
      ¡Ya estamos en la eliminatoria! Aquí van las actualizaciones más importantes de la app:
    </p>

    <div style="background:#2d0a5c;border-left:4px solid #f9c907;border-radius:8px;padding:16px 20px;margin-bottom:12px;">
      <p style="color:#f9c907;font-weight:bold;margin:0 0 6px;font-size:13px;">⚽ NUEVA DINÁMICA DE PENALES</p>
      <p style="color:#e0d0f0;margin:0;font-size:13px;line-height:1.6;">En todos los partidos de eliminación directa puedes predecir quién gana en penales <strong style="color:white;">(+1 pt)</strong> y el marcador exacto de penales <strong style="color:white;">(+2 pts extra)</strong>. Puedes ganar hasta 5 pts en un solo partido.</p>
    </div>

    <div style="background:#2d0a5c;border-left:4px solid #f9c907;border-radius:8px;padding:16px 20px;margin-bottom:12px;">
      <p style="color:#f9c907;font-weight:bold;margin:0 0 6px;font-size:13px;">⚠️ OJO CON LOS PENALES</p>
      <p style="color:#e0d0f0;margin:0;font-size:13px;line-height:1.6;">Si el partido va a penales, el marcador normal es el del tiempo regular (90'). Los penales NO cambian el marcador — solo dan puntos extra. Ejemplo: si México vs Ecuador termina 1-1 y México gana penales 4-2:<br><br>
      ⭐ Si pusiste 1-1 → 3 pts (exacto)<br>
      ✅ Si pusiste 0-0 → 1 pt (empate)<br>
      ❌ Si pusiste 2-0 México → 0 pts<br>
      ⚽ + Si pusiste México gana penales → +1 pt<br>
      🎯 + Si pusiste 4-2 en penales → +2 pts</p>
    </div>

    <div style="background:#2d0a5c;border-left:4px solid #f9c907;border-radius:8px;padding:16px 20px;margin-bottom:12px;">
      <p style="color:#f9c907;font-weight:bold;margin:0 0 6px;font-size:13px;">🏳️ PARTIDOS DE ELIMINATORIA</p>
      <p style="color:#e0d0f0;margin:0;font-size:13px;line-height:1.6;">Los 16 partidos de Dieciseisavos ya muestran los nombres y banderas reales de cada equipo.</p>
    </div>

    <div style="background:#2d0a5c;border-left:4px solid #f9c907;border-radius:8px;padding:16px 20px;margin-bottom:12px;">
      <p style="color:#f9c907;font-weight:bold;margin:0 0 6px;font-size:13px;">📧 CORREOS AUTOMÁTICOS</p>
      <p style="color:#e0d0f0;margin:0;font-size:13px;line-height:1.6;">Recibes un correo con las predicciones de todos ~10 min antes de cada partido y los resultados completos cuando se puntúa.</p>
    </div>

    <div style="background:#2d0a5c;border-left:4px solid #f9c907;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <p style="color:#f9c907;font-weight:bold;margin:0 0 6px;font-size:13px;">📊 TENDENCIA DE LA COMUNIDAD</p>
      <p style="color:#e0d0f0;margin:0;font-size:13px;line-height:1.6;">Ya puedes ver en tiempo real cómo está votando la comunidad en cada partido, antes y después del cierre.</p>
    </div>

    <div style="text-align:center;margin-bottom:24px;">
      <a href="https://pulponicup.com.mx" style="background:#f9c907;color:#2d0a5c;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;">
        🦑 Ir a Pulponi Cup 2026
      </a>
    </div>

    <div style="background:#0f0420;border:1px solid #3d1a6e;border-radius:8px;padding:14px 18px;text-align:center;">
      <p style="color:#9370db;font-size:12px;font-style:italic;margin:0;">
        "Solo el más fuerte merece la corona. El Kraken observa cada predicción." 🦑
      </p>
    </div>

  </div>

  <div style="background:#2d0a5c;padding:16px;text-align:center;border-top:1px solid #3d1a6e;">
    <p style="color:#aaa;font-size:11px;margin:0;">pulponicup.com.mx · Copa Mundial FIFA 2026</p>
  </div>

</body>
</html>
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createServiceClient();

    const emails = await listParticipantEmails(supabase);
    if (!emails.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0, message: 'No hay destinatarios' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { sent } = await sendResendEmail({
      to: emails,
      subject: '🦑 Pulponi Cup 2026 — Actualizaciones de la Eliminatoria',
      html,
    });

    return new Response(JSON.stringify({ ok: true, sent }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[send-update-email]', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
