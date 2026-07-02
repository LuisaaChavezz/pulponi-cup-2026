/** Invoca kraken-messages en modo dirigido (antes/después de un partido). */
export async function invokeKrakenMatchMessage(
  matchId: string,
  type: 'before' | 'after',
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = (Deno.env.get('SUPABASE_URL') ?? '').trim();
  const key = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  if (!url || !key) {
    return { ok: false, status: 503, body: { error: 'missing_supabase_env' } };
  }

  const res = await fetch(`${url}/functions/v1/kraken-messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      apikey: key,
    },
    body: JSON.stringify({ match_id: matchId, type }),
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => null);
  }

  return { ok: res.ok, status: res.status, body };
}
