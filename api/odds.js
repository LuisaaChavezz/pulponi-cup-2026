/**
 * Proxy serverless para The Odds API (momios autorizados).
 * La clave vive en THE_ODDS_API_KEY (servidor) — nunca en el bundle del cliente.
 * Documentación: https://the-odds-api.com/
 */

const DEFAULT_SPORT = 'soccer_fifa_world_cup';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.THE_ODDS_API_KEY?.trim();
  if (!apiKey) {
    return res.status(503).json({ error: 'THE_ODDS_API_KEY not configured on server' });
  }

  const sport = String(req.query?.sport ?? DEFAULT_SPORT).trim() || DEFAULT_SPORT;
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/odds/`);
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('regions', 'eu,us');
  url.searchParams.set('markets', 'h2h');
  url.searchParams.set('oddsFormat', 'decimal');

  try {
    const upstream = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    const body = await upstream.text();
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.setHeader('Content-Type', 'application/json');
    return res.status(upstream.status).send(body);
  } catch (err) {
    return res.status(502).json({ error: String(err?.message ?? err) });
  }
}
