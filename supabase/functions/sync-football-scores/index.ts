import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0';

const API_BASE = 'https://v3.football.api-sports.io';
const FINISHED_API = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);

const TEAM_NAME_ALIASES: Record<string, string> = {
  estadosunidos: 'usa',
  unitedstates: 'usa',
  us: 'usa',
  bosniayherzegovina: 'bosnia',
  coreadelsur: 'korea',
  southkorea: 'korea',
  arabiasaudita: 'saudiarabia',
  reinounido: 'england',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function env(name: string, fallback = ''): string {
  return (Deno.env.get(name) ?? fallback).trim();
}

function footballApiKey(): string {
  return env('FOOTBALL_API_KEY') || env('VITE_FOOTBALL_API_KEY');
}

function leagueId(): string {
  return env('VITE_FOOTBALL_LEAGUE_ID', '1') || '1';
}

function season(): string {
  return env('VITE_FOOTBALL_SEASON', '2026') || '2026';
}

function normalizeName(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function teamNameKey(name: string): string {
  const n = normalizeName(name);
  return TEAM_NAME_ALIASES[n] ?? n;
}

function teamsMatch(
  homeA: string,
  awayA: string,
  homeB: string,
  awayB: string,
): boolean {
  const h = teamNameKey(homeA);
  const a = teamNameKey(awayA);
  const ph = teamNameKey(homeB);
  const pa = teamNameKey(awayB);
  return (ph === h && pa === a) || (ph === a && pa === h);
}

function isOfficialWorldCupScheduleId(officialId: string): boolean {
  return /^fifa-wc26-\d{3}$/i.test(String(officialId ?? '').trim());
}

function isWorldCupMatch(
  match: { official_id?: string | null; league_id?: number | string | null; season?: number | string | null },
): boolean {
  if (!match) return false;
  if (isOfficialWorldCupScheduleId(String(match.official_id ?? ''))) return true;
  if (match.league_id != null && match.season != null) {
    return String(match.league_id) === leagueId() && String(match.season) === season();
  }
  return false;
}

function isApiWorldCupFixture(fixture: {
  league?: { id?: number; season?: number; name?: string };
  fixture?: { id?: number };
}): boolean {
  if (!fixture?.league) return false;
  if (String(fixture.league.id) !== leagueId()) return false;
  if (String(fixture.league.season) !== season()) return false;
  const label = String(fixture.league.name ?? '').toLowerCase();
  if (label && !/world\s*cup|worldcup|fifa/.test(label)) return false;
  return Boolean(fixture.fixture?.id);
}

function isAuthorized(req: Request): boolean {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;

  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceKey && token === serviceKey) return true;

  const cronSecret = env('CRON_SECRET');
  if (cronSecret && token === cronSecret) return true;

  return false;
}

async function apiFetchPage(
  path: string,
  params: Record<string, string | number>,
  apiKey: string,
): Promise<{ response: unknown[]; paging: { current?: number; total?: number } }> {
  const url = new URL(`${API_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  });

  const res = await fetch(url.toString(), {
    headers: { 'x-apisports-key': apiKey },
  });
  const bodyText = await res.text();
  let json: { response?: unknown[]; paging?: { current?: number; total?: number }; errors?: Record<string, string> };
  try {
    json = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    return { response: [], paging: { current: 1, total: 1 } };
  }

  if (!res.ok || (json.errors && Object.keys(json.errors).length)) {
    console.warn('[sync-football-scores] API-Football', res.status, json.errors ?? bodyText.slice(0, 160));
    return { response: [], paging: { current: 1, total: 1 } };
  }

  return {
    response: (json.response ?? []) as unknown[],
    paging: json.paging ?? { current: 1, total: 1 },
  };
}

async function apiFetchAllPages(
  path: string,
  params: Record<string, string | number>,
  apiKey: string,
): Promise<unknown[]> {
  const merged: unknown[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const { response, paging } = await apiFetchPage(path, { ...params, page }, apiKey);
    if (response.length) merged.push(...response);
    totalPages = Math.max(1, Number(paging?.total) || 1);
    if (page >= totalPages) break;
    page += 1;
  }

  return merged;
}

type ApiFixture = {
  fixture?: { id?: number; status?: { short?: string } };
  league?: { id?: number; season?: number; name?: string };
  teams?: { home?: { name?: string }; away?: { name?: string } };
  goals?: { home?: number | null; away?: number | null };
};

type DbMatch = {
  id: string;
  official_id?: string | null;
  league_id?: number | string | null;
  season?: number | string | null;
  home_team?: string | null;
  away_team?: string | null;
  api_fixture_id?: number | string | null;
  api_status?: string | null;
  status?: string | null;
};

async function fetchFinishedFixtures(apiKey: string): Promise<ApiFixture[]> {
  const statuses = ['FT', 'AET', 'PEN'];
  const byId = new Map<number, ApiFixture>();

  for (const status of statuses) {
    const batch = (await apiFetchAllPages(
      '/fixtures',
      { league: leagueId(), season: season(), status },
      apiKey,
    )) as ApiFixture[];

    for (const fixture of batch) {
      if (!isApiWorldCupFixture(fixture)) continue;
      const id = fixture.fixture?.id;
      if (!id) continue;
      const short = String(fixture.fixture?.status?.short ?? '').toUpperCase();
      if (!FINISHED_API.has(short)) continue;
      byId.set(id, fixture);
    }
  }

  return [...byId.values()];
}

function findDbMatch(dbMatches: DbMatch[], fixture: ApiFixture): DbMatch | null {
  const fid = fixture.fixture?.id;
  if (!fid) return null;

  const apiHome = fixture.teams?.home?.name ?? '';
  const apiAway = fixture.teams?.away?.name ?? '';

  const byFixtureId = dbMatches.find((row) => String(row.api_fixture_id) === String(fid));
  if (byFixtureId) return byFixtureId;

  return (
    dbMatches.find((row) => teamsMatch(row.home_team ?? '', row.away_team ?? '', apiHome, apiAway)) ??
    null
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  if (!isAuthorized(req)) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  const startedAt = new Date().toISOString();
  const apiKey = footballApiKey();
  if (!apiKey) {
    return jsonResponse({ ok: false, error: 'football_api_not_configured', startedAt }, 503);
  }

  const supabaseUrl = env('SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ ok: false, error: 'missing_supabase_env', startedAt }, 503);
  }

  const client = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const [fixtures, matchesResult] = await Promise.all([
      fetchFinishedFixtures(apiKey),
      client.from('matches').select(
        'id, official_id, league_id, season, home_team, away_team, api_fixture_id, api_status, status',
      ),
    ]);

    if (matchesResult.error) {
      return jsonResponse(
        { ok: false, error: matchesResult.error.message, startedAt },
        500,
      );
    }

    const dbMatches = (matchesResult.data ?? []).filter(isWorldCupMatch) as DbMatch[];
    const scored: Array<Record<string, unknown>> = [];
    const skipped: Array<Record<string, unknown>> = [];

    for (const fixture of fixtures) {
      const homeScore = fixture.goals?.home;
      const awayScore = fixture.goals?.away;
      if (homeScore == null || awayScore == null) {
        skipped.push({
          reason: 'missing_scores',
          fixture_id: fixture.fixture?.id ?? null,
        });
        continue;
      }

      const dbMatch = findDbMatch(dbMatches, fixture);
      const homeTeam = String(dbMatch?.home_team ?? fixture.teams?.home?.name ?? '').trim();
      const awayTeam = String(dbMatch?.away_team ?? fixture.teams?.away?.name ?? '').trim();

      if (!homeTeam || !awayTeam) {
        skipped.push({
          reason: 'missing_teams',
          fixture_id: fixture.fixture?.id ?? null,
        });
        continue;
      }

      const { data, error } = await client.rpc('score_match_by_teams', {
        p_home_team: homeTeam,
        p_away_team: awayTeam,
        p_home_score: Math.max(0, Math.round(Number(homeScore))),
        p_away_score: Math.max(0, Math.round(Number(awayScore))),
      });

      if (error) {
        scored.push({
          home_team: homeTeam,
          away_team: awayTeam,
          home_score: homeScore,
          away_score: awayScore,
          error: error.message,
        });
        continue;
      }

      const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {};
      if (payload.error) {
        scored.push({
          home_team: homeTeam,
          away_team: awayTeam,
          home_score: homeScore,
          away_score: awayScore,
          error: payload.error,
        });
        continue;
      }

      scored.push({
        home_team: homeTeam,
        away_team: awayTeam,
        home_score: homeScore,
        away_score: awayScore,
        match_id: payload.match_id ?? dbMatch?.id ?? null,
        scored_picks: Number(payload.scored_picks ?? 0),
        via: payload.via ?? 'score_match_by_teams',
      });
    }

    const totalScoredPicks = scored.reduce(
      (sum, row) => sum + Number(row.scored_picks ?? 0),
      0,
    );

    return jsonResponse({
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      fixtures_ft: fixtures.length,
      matches_scored: scored.filter((row) => !row.error).length,
      total_scored_picks: totalScoredPicks,
      scored,
      skipped,
    });
  } catch (err) {
    console.error('[sync-football-scores]', err);
    return jsonResponse(
      {
        ok: false,
        error: String((err as Error)?.message ?? err),
        startedAt,
      },
      500,
    );
  }
});
