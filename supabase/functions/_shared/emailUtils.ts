import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function createServiceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configurados');
  return createClient(url, key);
}

export function formatPick(pick: unknown): string {
  if (!pick) return 'Sin predicción';
  if (typeof pick === 'string') return pick;
  if (Array.isArray(pick)) return `${pick[0]}-${pick[1]}`;
  if (typeof pick === 'object') {
    const row = pick as Record<string, unknown>;
    const home = row.home_pick ?? row.home ?? row.local ?? '?';
    const away = row.away_pick ?? row.away ?? row.visitante ?? '?';
    return `${home}-${away}`;
  }
  return 'Sin predicción';
}

export function getPickFromProfile(
  picks: Record<string, unknown> | null | undefined,
  matchId: string | number
): unknown {
  if (!picks || typeof picks !== 'object') return null;
  const matchIdStr = String(matchId);
  return picks[matchIdStr] ?? picks[matchId as unknown as string] ?? null;
}

export async function listParticipantEmails(client: SupabaseClient): Promise<string[]> {
  const emails: string[] = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    for (const user of data.users ?? []) {
      const email = user.email;
      if (!email) continue;
      if (email.includes('cursor') || email.includes('verify-')) continue;
      emails.push(email);
    }

    if ((data.users ?? []).length < perPage) break;
    page += 1;
  }

  return [...new Set(emails)];
}

/** Reserva el envío en email_logs (atómico). Devuelve false si ya se mandó. */
export async function claimEmailSend(
  client: SupabaseClient,
  matchId: string,
  type: string
): Promise<boolean> {
  const { error } = await client.from('email_logs').insert({
    match_id: String(matchId),
    type,
    sent_at: new Date().toISOString(),
  });

  if (!error) return true;

  // Postgres unique violation — otro cron ya reclamó este envío.
  if (error.code === '23505') return false;

  throw error;
}

export async function releaseEmailSend(
  client: SupabaseClient,
  matchId: string,
  type: string
): Promise<void> {
  const { error } = await client
    .from('email_logs')
    .delete()
    .eq('match_id', String(matchId))
    .eq('type', type);

  if (error) console.error('[releaseEmailSend]', error.message ?? error);
}

const RESEND_FROM = 'Pulponi Cup 2026 <noreply@pulponicup.com.mx>';
const SEND_DELAY_MS = 100;

export async function sendResendEmail(options: {
  to: string[];
  subject: string;
  html: string;
}): Promise<{ sent: number }> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY no configurada en Supabase Secrets');

  const recipients = [...new Set(options.to)].filter(Boolean);
  if (!recipients.length) throw new Error('No hay destinatarios');

  const failed: string[] = [];
  let sent = 0;

  for (let i = 0; i < recipients.length; i++) {
    const email = recipients[i];
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [email],
        subject: options.subject,
        html: options.html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[sendResendEmail] error ${email}: ${res.status} ${body}`);
      failed.push(email);
    } else {
      sent += 1;
    }

    if (i < recipients.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS));
    }
  }

  if (failed.length) {
    throw new Error(
      `Resend: ${failed.length} de ${recipients.length} fallaron (ej. ${failed.slice(0, 3).join(', ')})`
    );
  }

  return { sent };
}
