// supabase/functions/test-email/index.ts
// Deploy: supabase functions deploy test-email
// Secret: RESEND_API_KEY (Dashboard → Edge Functions → Secrets)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY no configurada' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Pulponi Cup 2026 <onboarding@resend.dev>',
      to: ['luisaa.chavezz@gmail.com'],
      subject: '🦑 Prueba Pulponi Cup 2026',
      html: '<h1>🦑 Pulponi funciona!</h1><p>El sistema de correos está listo.</p>',
    }),
  });

  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.ok ? 200 : 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
