// supabase/functions/send-welcome-email/index.ts
// Deploy: supabase functions deploy send-welcome-email
// Secret: RESEND_API_KEY (Dashboard → Edge Functions → Secrets)
// Invocar una vez: supabase/send_welcome_email.sql

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  corsHeaders,
  createServiceClient,
  listParticipantEmails,
  sendResendEmail,
} from '../_shared/emailUtils.ts';

const WELCOME_SUBJECT = '🦑 Pulponi Cup 2026 — Ya puedes recibir notificaciones por correo';

const welcomeHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0420;font-family:Arial,sans-serif;">

  <div style="background:#2d0a5c;padding:40px 20px;text-align:center;border-bottom:3px solid #f9c907;">
    <div style="font-size:48px;margin-bottom:8px;">🦑</div>
    <h1 style="color:white;margin:0;font-size:28px;font-weight:bold;letter-spacing:1px;">PULPONI CUP 2026</h1>
    <p style="color:#f9c907;margin:8px 0 0;font-size:14px;letter-spacing:2px;">SISTEMA DE NOTIFICACIONES</p>
  </div>

  <div style="background:#1a0535;padding:40px 30px;max-width:600px;margin:0 auto;">

    <p style="color:#e0d0f0;font-size:16px;line-height:1.6;margin-bottom:30px;">
      ¡Hola, Pulpo! 👋 A partir de hoy recibirás correos automáticos de Pulponi Cup 2026 en dos momentos clave:
    </p>

    <div style="background:#2d0a5c;border-left:4px solid #f9c907;border-radius:8px;padding:20px 24px;margin-bottom:16px;">
      <div style="margin-bottom:8px;">
        <span style="font-size:24px;margin-right:12px;">⏰</span>
        <h2 style="color:#f9c907;margin:0;font-size:16px;font-weight:bold;display:inline;">ANTES DE CADA PARTIDO</h2>
      </div>
      <p style="color:#e0d0f0;margin:0;font-size:14px;line-height:1.6;">
        <strong style="color:white;">5 minutos antes del kickoff</strong> recibirás las predicciones de todos los participantes para ese partido. ¿Quién se atrevió a poner qué? El Kraken lo sabe... y ahora tú también. 🦑
      </p>
    </div>

    <div style="background:#2d0a5c;border-left:4px solid #f9c907;border-radius:8px;padding:20px 24px;margin-bottom:30px;">
      <div style="margin-bottom:8px;">
        <span style="font-size:24px;margin-right:12px;">🏆</span>
        <h2 style="color:#f9c907;margin:0;font-size:16px;font-weight:bold;display:inline;">AL TERMINAR CADA PARTIDO</h2>
      </div>
      <p style="color:#e0d0f0;margin:0;font-size:14px;line-height:1.6;">
        Una vez puntuado el partido recibirás los <strong style="color:white;">resultados completos</strong>: quién acertó el marcador exacto, quién adivinó el ganador y cómo quedó la tabla de posiciones. El Kraken registra todo.
      </p>
    </div>

    <div style="text-align:center;margin-bottom:30px;">
      <a href="https://pulponicup.com.mx" style="background:#f9c907;color:#2d0a5c;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">
        🦑 Ver mis predicciones
      </a>
    </div>

    <div style="background:#0f0420;border:1px solid #3d1a6e;border-radius:8px;padding:16px 20px;text-align:center;">
      <p style="color:#9370db;font-size:13px;font-style:italic;margin:0;line-height:1.6;">
        "El Kraken observa cada predicción. Cada acierto. Cada error. El Trono tiene dueño... por ahora." 🦑
      </p>
    </div>

  </div>

  <div style="background:#2d0a5c;padding:20px;text-align:center;border-top:1px solid #3d1a6e;">
    <p style="color:#9370db;font-size:11px;margin:0;">
      pulponicup.com.mx · Copa Mundial FIFA 2026
    </p>
  </div>

</body>
</html>`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createServiceClient();
    const emails = await listParticipantEmails(supabase);

    if (!emails.length) {
      return new Response(JSON.stringify({ ok: false, error: 'No hay correos de participantes' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { sent } = await sendResendEmail({
      to: emails,
      subject: WELCOME_SUBJECT,
      html: welcomeHtml,
    });

    return new Response(JSON.stringify({ ok: true, emails_count: emails.length, sent }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[send-welcome-email]', message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
