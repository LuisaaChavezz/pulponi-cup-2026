/**
 * Vercel Cron / manual: sincroniza marcadores API-Football y puntúa partidos FT.
 *
 * Env (Vercel → Settings → Environment Variables):
 *   CRON_SECRET
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   VITE_FOOTBALL_API_KEY  (o FOOTBALL_API_KEY)
 *   VITE_FOOTBALL_LEAGUE_ID=1
 *   VITE_FOOTBALL_SEASON=2026
 *
 * Query: ?mode=live | full | auto (default auto)
 */

export const config = {
  maxDuration: 60,
};

function readQueryMode(req) {
  const raw = req.query?.mode;
  const mode = Array.isArray(raw) ? raw[0] : raw;
  if (mode === 'live' || mode === 'full' || mode === 'auto') return mode;
  return 'auto';
}

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return process.env.VERCEL_ENV !== 'production' && process.env.NODE_ENV !== 'production';
  }
  const auth = req.headers.authorization ?? req.headers.Authorization ?? '';
  return auth === `Bearer ${secret}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const mode = readQueryMode(req);
  const startedAt = new Date().toISOString();

  try {
    const { createServerSupabaseClient, runFootballCronSync } = await import(
      '../src/lib/footballCronSync.js'
    );
    const client = createServerSupabaseClient();
    const result = await runFootballCronSync(client, { mode });

    if (!result.ok) {
      return res.status(503).json({ startedAt, mode, ...result });
    }

    return res.status(200).json({
      startedAt,
      finishedAt: new Date().toISOString(),
      ...result,
    });
  } catch (err) {
    console.error('[sync-football-scores]', err);
    return res.status(500).json({
      error: String(err?.message ?? err),
      startedAt,
      mode,
    });
  }
}
