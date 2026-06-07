import { supabase } from './supabase';
import {
  deleteMatchesMissingTeams,
  insertOfficialProvisionalFixtures,
  isMissingTeamsRow,
} from './fifaScheduleSeed';
import { WORLD_CUP_DEMO_FIXTURES, demoFixtureToMatchRow } from '../data/worldCupDemoFixtures';
import { FINISHED_API, LIVE_API, normalizeApiStatus } from './footballApiStatus';
import { flagEmojiForTeam } from './teamFlags';
import { mapApiEventsToHighlights } from './highlightsMapper';
import { isWorldCupMatch, wcLeagueIdFromEnv, wcSeasonFromEnv } from './worldCupScope';

const API_BASE = 'https://v3.football.api-sports.io';

function getApiKey() {
  return import.meta.env.VITE_FOOTBALL_API_KEY?.trim() || '';
}

export function getLeagueId() {
  return import.meta.env.VITE_FOOTBALL_LEAGUE_ID?.trim() || '1';
}

export function getSeason() {
  return import.meta.env.VITE_FOOTBALL_SEASON?.trim() || '2026';
}

export function isFootballApiConfigured() {
  return Boolean(getApiKey());
}

function logSupabaseWarn(context, error) {
  console.warn(`[Supabase] ${context}:`, error?.message ?? error);
}

async function apiFetchPage(path, params = {}, { requireKey = true } = {}) {
  const key = getApiKey();
  if (!key) {
    if (requireKey) {
      console.warn('[API-FOOTBALL FALLBACK]', 'Sin VITE_FOOTBALL_API_KEY');
    }
    return { response: [], paging: { current: 1, total: 1 } };
  }

  const url = new URL(`${API_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') url.searchParams.set(k, v);
  });

  let res;
  try {
    res = await fetch(url.toString(), {
      headers: { 'x-apisports-key': key },
    });
  } catch (err) {
    console.warn('[API-FOOTBALL FALLBACK]', err);
    return { response: [], paging: { current: 1, total: 1 } };
  }

  const bodyText = await res.text();
  let json;
  try {
    json = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    console.warn('[API-FOOTBALL FALLBACK]', `Respuesta no JSON (${res.status})`);
    return { response: [], paging: { current: 1, total: 1 } };
  }

  if (!res.ok) {
    console.warn('[API-FOOTBALL FALLBACK]', `HTTP ${res.status}`, bodyText.slice(0, 160));
    return { response: [], paging: { current: 1, total: 1 } };
  }

  if (json.errors && Object.keys(json.errors).length) {
    console.warn('[API-FOOTBALL FALLBACK]', json.errors);
    return { response: [], paging: { current: 1, total: 1 } };
  }

  return {
    response: json.response ?? [],
    paging: json.paging ?? { current: 1, total: 1 },
  };
}

async function apiFetch(path, params = {}, options = {}) {
  const { response } = await apiFetchPage(path, params, options);
  return response;
}

/** Recorre todas las páginas de la API (paging.total) y fusiona resultados. */
async function apiFetchAllPages(path, params = {}, options = {}) {
  const merged = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const { response, paging } = await apiFetchPage(path, { ...params, page }, options);
    if (response?.length) merged.push(...response);
    totalPages = Math.max(1, Number(paging?.total) || 1);
    if (page >= totalPages) break;
    page += 1;
  }

  return merged;
}

function normalizeName(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const TEAM_NAME_ALIASES = {
  estadosunidos: 'usa',
  unitedstates: 'usa',
  us: 'usa',
  bosniayherzegovina: 'bosnia',
  coreadelsur: 'korea',
  southkorea: 'korea',
  arabiasaudita: 'saudiarabia',
  reinounido: 'england',
};

function teamNameKey(name) {
  const n = normalizeName(name);
  return TEAM_NAME_ALIASES[n] ?? n;
}

function teamsMatchFixture(dbMatch, fixture) {
  const h = teamNameKey(fixture.teams?.home?.name);
  const a = teamNameKey(fixture.teams?.away?.name);
  const ph = teamNameKey(dbMatch.home_team);
  const pa = teamNameKey(dbMatch.away_team);
  return (ph === h && pa === a) || (ph === a && pa === h);
}

function formatVenueFromFixture(fixture) {
  const v = fixture.fixture?.venue;
  if (!v?.name) return null;
  return [v.name, v.city].filter(Boolean).join(', ');
}

function isKnockoutRound(round) {
  const r = String(round ?? '').toLowerCase();
  return /round|final|semi|quarter|octavos|cuartos|semifinal|8th|16th|knockout|play-off|playoff/.test(r);
}

function mapGoals(fixture, events) {
  const fromEvents =
    events
      ?.filter((e) => e.type === 'Goal')
      .map((e) => ({
        minute: e.time?.elapsed ?? null,
        team: e.team?.name ?? null,
        player: e.player?.name ?? null,
        detail: e.detail ?? null,
      })) ?? [];

  return {
    home: fixture.goals?.home ?? 0,
    away: fixture.goals?.away ?? 0,
    list: fromEvents,
  };
}

function mapCards(events) {
  return (
    events
      ?.filter((e) => e.type === 'Card')
      .map((e) => ({
        minute: e.time?.elapsed ?? null,
        team: e.team?.name ?? null,
        player: e.player?.name ?? null,
        detail: e.detail ?? null,
      })) ?? []
  );
}

function mapPenalties(fixture) {
  const pen = fixture.score?.penalty;
  if (!pen) return null;
  return { home: pen.home ?? null, away: pen.away ?? null };
}

function mapTimelineEvents(events) {
  return mapApiEventsToHighlights(events ?? []);
}

function resolveWinner(fixture) {
  const home = fixture.goals?.home;
  const away = fixture.goals?.away;
  if (home == null || away == null) return null;
  if (home > away) return fixture.teams?.home?.name ?? null;
  if (away > home) return fixture.teams?.away?.name ?? null;
  const pen = fixture.score?.penalty;
  if (pen?.home != null && pen?.away != null) {
    if (pen.home > pen.away) return fixture.teams?.home?.name ?? null;
    if (pen.away > pen.home) return fixture.teams?.away?.name ?? null;
  }
  return 'Empate';
}

function teamLogoFromApi(team) {
  const url = team?.logo;
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  return trimmed || null;
}

function scoresFromFixture(fixture) {
  const home = fixture.goals?.home;
  const away = fixture.goals?.away;
  if (home == null && away == null) {
    return { home_score: null, away_score: null };
  }
  return {
    home_score: home ?? 0,
    away_score: away ?? 0,
  };
}

/** Fila mínima para insert inicial (campos solicitados + status normalizado). */
export function fixtureToSyncRow(fixture) {
  const apiStatus = fixture.fixture?.status?.short ?? 'NS';
  const venue = fixture.fixture?.venue;
  const homeTeam = fixture.teams?.home?.name ?? 'Local';
  const awayTeam = fixture.teams?.away?.name ?? 'Visitante';

  return {
    api_fixture_id: fixture.fixture?.id,
    league_id: fixture.league?.id ?? null,
    season: fixture.league?.season ?? null,
    home_team: homeTeam,
    away_team: awayTeam,
    home_logo: teamLogoFromApi(fixture.teams?.home),
    away_logo: teamLogoFromApi(fixture.teams?.away),
    home_flag: flagEmojiForTeam(homeTeam),
    away_flag: flagEmojiForTeam(awayTeam),
    kickoff: fixture.fixture?.date ?? null,
    venue: venue?.name ?? null,
    venue_city: venue?.city ?? null,
    api_status: apiStatus,
    status: normalizeApiStatus(apiStatus),
    ...scoresFromFixture(fixture),
    group_name: fixture.league?.round ?? fixture.league?.name ?? 'Mundial 2026',
    is_knockout: isKnockoutRound(fixture.league?.round),
  };
}

export function fixtureToMatchRow(fixture, events = []) {
  const apiStatus = fixture.fixture?.status?.short ?? 'NS';
  const goals = mapGoals(fixture, events);
  const venueFull = formatVenueFromFixture(fixture);
  const venueParts = venueFull?.split(', ') ?? [];

  return {
    ...fixtureToSyncRow(fixture),
    minute: fixture.fixture?.status?.elapsed ?? null,
    events: mapTimelineEvents(events),
    goals: goals.list,
    cards: mapCards(events),
    penalties: mapPenalties(fixture),
    winner: resolveWinner(fixture),
    updated_at: new Date().toISOString(),
  };
}

export async function fetchFixtureEvents(fixtureId) {
  return (await apiFetch('/fixtures/events', { fixture: fixtureId })) ?? [];
}

export async function fetchWorldCupFixtures() {
  const leagueId = getLeagueId();
  const season = getSeason();
  const fixtures = (await apiFetchAllPages('/fixtures', { league: leagueId, season })) ?? [];
  if (fixtures.length) {
    console.log('[API-FOOTBALL]', fixtures.length, 'fixtures', { leagueId, season });
  }
  return fixtures;
}

/** Fixtures del Mundial + merge solo con partidos LIVE de la misma liga/temporada (no otras competiciones). */
export async function fetchFixturesWithLiveMerge() {
  try {
    let fixtures = await fetchWorldCupFixtures();
    const live = await apiFetch('/fixtures', { live: 'all' }, { requireKey: true }).catch(() => []);
    const el = wcLeagueIdFromEnv();
    const es = wcSeasonFromEnv();
    const liveWc = (live ?? []).filter((f) => {
      const lid = f?.league?.id;
      const sea = f?.league?.season;
      return String(lid) === String(el) && String(sea) === String(es);
    });
    if (liveWc.length) {
      const map = new Map(fixtures.filter((f) => f?.fixture?.id).map((f) => [f.fixture.id, f]));
      liveWc.forEach((f) => {
        if (f?.fixture?.id) map.set(f.fixture.id, f);
      });
      fixtures = [...map.values()];
    }
    return fixtures;
  } catch (err) {
    console.warn('[API-FOOTBALL FALLBACK]', err);
    return [];
  }
}

export async function fetchLeagueFixtures() {
  return fetchFixturesWithLiveMerge();
}

function isDemoMatchRow(row) {
  return Boolean(row?.is_demo);
}

function isProvisionalMatchRow(row) {
  return Boolean(row?.provisional);
}

async function getMatchesSyncState(client) {
  const { data, error } = await client
    .from('matches')
    .select('id, is_demo, provisional, api_fixture_id, official_id');
  if (error) {
    logSupabaseWarn('getMatchesSyncState', error);
    throw error;
  }
  const rows = data ?? [];
  const demoCount = rows.filter(isDemoMatchRow).length;
  const provisionalCount = rows.filter(isProvisionalMatchRow).length;
  const placeholderCount = rows.filter((r) => isDemoMatchRow(r) || isProvisionalMatchRow(r)).length;
  const realCount = rows.length - placeholderCount;
  return {
    total: rows.length,
    demoCount,
    provisionalCount,
    realCount,
    demoOnly: rows.length > 0 && demoCount === rows.length,
    provisionalOnly: rows.length > 0 && provisionalCount === rows.length,
    empty: rows.length === 0,
    hasDemo: demoCount > 0,
    hasProvisional: provisionalCount > 0,
  };
}

async function getMatchesSyncStateSafe(client) {
  try {
    return await getMatchesSyncState(client);
  } catch (error) {
    logSupabaseWarn('getMatchesSyncState', error);
    return {
      total: 0,
      demoCount: 0,
      provisionalCount: 0,
      realCount: 0,
      demoOnly: false,
      provisionalOnly: false,
      empty: true,
      hasDemo: false,
      hasProvisional: false,
    };
  }
}

async function deleteDemoMatches(client) {
  const { data: demoRows, error: selectError } = await client
    .from('matches')
    .select('id')
    .or('is_demo.eq.true,api_fixture_id.lt.0');

  if (selectError) {
    logSupabaseWarn('deleteDemoMatches', selectError);
    throw selectError;
  }

  const ids = (demoRows ?? []).map((r) => r.id);
  if (!ids.length) return 0;

  const { error } = await client.from('matches').delete().in('id', ids);
  if (error) {
    logSupabaseWarn('deleteDemoMatches', error);
    throw error;
  }

  console.info(`[syncWorldCupFixtures] Eliminados ${ids.length} partidos demo`);
  return ids.length;
}

async function countMatchesWithBothTeams(client) {
  const { data, error } = await client.from('matches').select('id, home_team, away_team');
  if (error) {
    logSupabaseWarn('countMatchesWithBothTeams', error);
    return 0;
  }
  return (data ?? []).filter((r) => !isMissingTeamsRow(r)).length;
}

/** Elimina filas que no pertenecen al Mundial 2026 / Pulponi (p. ej. LIVE de otras ligas). */
async function deleteNonWorldCupMatches(client) {
  const { data, error } = await client.from('matches').select('*');
  if (error) {
    logSupabaseWarn('deleteNonWorldCupMatches list', error);
    return 0;
  }
  const ids = (data ?? []).filter((r) => !isWorldCupMatch(r)).map((r) => r.id);
  if (!ids.length) return 0;
  const { error: delErr } = await client.from('matches').delete().in('id', ids);
  if (delErr) {
    logSupabaseWarn('deleteNonWorldCupMatches delete', delErr);
    return 0;
  }
  console.info(`[syncWorldCupFixtures] Eliminadas ${ids.length} filas fuera del Mundial 2026`);
  return ids.length;
}

async function insertWorldCupDemoFixtures(client) {
  let imported = 0;
  const insertErrors = [];

  for (const fixture of WORLD_CUP_DEMO_FIXTURES) {
    const row = demoFixtureToMatchRow(fixture);
    const { error } = await client.from('matches').insert(row);

    if (error) {
      logSupabaseWarn(`insertWorldCupDemoFixtures ${row.api_fixture_id}`, error);
      insertErrors.push(error);
      continue;
    }
    imported += 1;
  }

  if (imported === 0) {
    const first = insertErrors[0];
    console.warn('[Supabase] insertWorldCupDemoFixtures 0 inserts', first?.message ?? '', insertErrors.length);
    return { imported: 0, demo: true, source: 'demo', failed: true };
  }

  console.info(`[syncWorldCupFixtures] DEMO — ${imported} partidos de prueba insertados`);
  return { imported, demo: true, source: 'demo' };
}

async function upsertApiFixtures(client, fixtures) {
  const leagueId = getLeagueId();
  const season = getSeason();
  let upserted = 0;
  let mergedProvisional = 0;
  const upsertErrors = [];
  const seen = new Set();

  const { data: provisionalRows } = await client.from('matches').select('*').eq('provisional', true);
  const provisionals = provisionalRows ?? [];

  for (const fixture of fixtures) {
    const fid = fixture?.fixture?.id;
    if (!fid || seen.has(fid)) continue;
    seen.add(fid);

    const apiStatus = fixture.fixture?.status?.short ?? 'NS';
    const needsEvents = LIVE_API.has(apiStatus) || FINISHED_API.has(apiStatus);
    const events = needsEvents ? await fetchFixtureEvents(fid) : [];
    const row = {
      ...(await buildMatchUpdateFromFixture(fixture, events)),
      is_demo: false,
      provisional: false,
    };

    const matched = provisionals.find((p) => teamsMatchFixture(p, fixture));
    let error;

    if (matched) {
      ({ error } = await client.from('matches').update(row).eq('id', matched.id));
      if (!error) mergedProvisional += 1;
    } else {
      ({ error } = await client.from('matches').upsert(row, { onConflict: 'api_fixture_id' }));
    }

    if (error) {
      logSupabaseWarn(`upsertApiFixtures ${fid}`, error);
      upsertErrors.push(error);
      continue;
    }
    upserted += 1;
  }

  if (upserted === 0 && fixtures.length > 0) {
    const first = upsertErrors[0];
    console.warn('[API-FOOTBALL FALLBACK]', first?.message ?? '0 partidos guardados desde API', {
      upsertErrors: upsertErrors.length,
    });
    return {
      imported: 0,
      mergedProvisional,
      demo: false,
      source: 'api_failed',
      total: fixtures.length,
      leagueId,
      season,
    };
  }

  if (upserted === 0) {
    return {
      imported: 0,
      mergedProvisional,
      demo: false,
      source: 'api',
      total: fixtures.length,
      leagueId,
      season,
    };
  }

  console.info(
    `[syncWorldCupFixtures] OK — ${upserted} partidos API (${mergedProvisional} reemplazaron calendario FIFA provisional; liga ${leagueId}, temporada ${season})`
  );
  return {
    imported: upserted,
    updated: upserted,
    mergedProvisional,
    demo: false,
    source: 'api',
    total: fixtures.length,
    leagueId,
    season,
  };
}

/**
 * Importa / actualiza fixtures reales (league=1, season=2026).
 * Nunca lanza: ante fallo API o Supabase usa calendario FIFA provisional o demo.
 */
export async function syncWorldCupFixtures(client = supabase) {
  try {
    const out = await syncWorldCupFixturesBody(client);
    console.log('[SYNC DONE]', out?.skipped ? 'skipped' : 'ok', out?.source ?? '', out);
    return out;
  } catch (e) {
    console.warn('[syncWorldCupFixtures] error — recuperando con FIFA/demo', e);
    try {
      const fifa = await insertOfficialProvisionalFixtures(client);
      console.log('[SYNC DONE]', 'fifa-recover', fifa);
      return fifa;
    } catch (fifaErr) {
      console.warn('[Supabase] insertOfficialProvisionalFixtures', fifaErr);
      const demo = await insertWorldCupDemoFixtures(client);
      console.log('[SYNC DONE]', 'demo-recover', demo);
      return demo;
    }
  }
}

async function syncWorldCupFixturesBody(client = supabase) {
  const leagueId = getLeagueId();
  const season = getSeason();

  await deleteMatchesMissingTeams(client);
  await deleteNonWorldCupMatches(client);

  let state = await getMatchesSyncStateSafe(client);
  let validMatchCount = await countMatchesWithBothTeams(client);

  let fixtures = [];
  let apiError = null;

  if (getApiKey()) {
    try {
      fixtures = await fetchFixturesWithLiveMerge();
    } catch (err) {
      apiError = err;
      console.warn('[API-FOOTBALL FALLBACK]', err);
    }
  } else {
    console.warn('[API-FOOTBALL FALLBACK]', 'Sin VITE_FOOTBALL_API_KEY');
  }

  async function seedFifaOrDemo() {
    try {
      return await insertOfficialProvisionalFixtures(client);
    } catch (fifaErr) {
      console.warn('[Supabase] FIFA provisional insert', fifaErr);
      return insertWorldCupDemoFixtures(client);
    }
  }

  /** Intenta upsert API (p. ej. sustituir demo o enriquecer filas existentes). */
  async function tryUpsertApiFixtures() {
    let replacedDemo = false;
    if (state.hasDemo) {
      try {
        replacedDemo = (await deleteDemoMatches(client)) > 0;
      } catch (e) {
        logSupabaseWarn('deleteDemoMatches', e);
      }
    }
    return upsertApiFixtures(client, fixtures).then((result) => ({ ...result, replacedDemo }));
  }

  // Ya hay calendario en Supabase → refrescar/insertar todos los fixtures API disponibles
  if (validMatchCount > 0) {
    if (fixtures.length > 0) {
      try {
        const result = await tryUpsertApiFixtures();
        return {
          ...result,
          existing: validMatchCount,
          skipped: result.imported === 0 && result.mergedProvisional === 0,
          source: result.imported > 0 || result.mergedProvisional > 0 ? 'api_refresh' : 'existing',
        };
      } catch (e) {
        console.warn('[API-FOOTBALL FALLBACK]', e);
      }
    }
    return {
      skipped: true,
      imported: 0,
      existing: validMatchCount,
      source: 'existing',
      provisional: state.provisionalOnly,
      demo: state.demoOnly,
    };
  }

  // Sin filas válidas: API vacía → calendario FIFA provisional (o demo)
  if (fixtures.length === 0) {
    if (apiError) {
      console.warn('[API-FOOTBALL FALLBACK]', apiError);
    } else if (getApiKey()) {
      console.warn(
        '[API-FOOTBALL FALLBACK]',
        `0 fixtures (liga ${leagueId}, temporada ${season}) — usando calendario FIFA provisional`
      );
    }
    return seedFifaOrDemo();
  }

  // API devolvió fixtures y aún no hay filas válidas: poblar desde API
  try {
    const result = await tryUpsertApiFixtures();
    if (result.imported > 0) {
      return result;
    }
    console.warn('[API-FOOTBALL FALLBACK] API devolvió datos pero 0 inserts — FIFA provisional');
  } catch (e) {
    console.warn('[API-FOOTBALL FALLBACK]', e);
  }

  state = await getMatchesSyncStateSafe(client);
  validMatchCount = await countMatchesWithBothTeams(client);
  if (validMatchCount === 0 || state.hasDemo) {
    return seedFifaOrDemo();
  }
  return { skipped: true, imported: 0, existing: validMatchCount, source: 'api_failed_persist' };
}

async function fetchAllFixturesForSync(dbMatches) {
  const ids = [...new Set(dbMatches.map((m) => m.api_fixture_id).filter(Boolean))];
  const fixtures = [];

  if (ids.length) {
    for (let i = 0; i < ids.length; i += 20) {
      const chunk = ids.slice(i, i + 20);
      try {
        const batch = await apiFetch('/fixtures', { ids: chunk.join('-') });
        if (batch?.length) fixtures.push(...batch);
      } catch (e) {
        console.warn('[API-FOOTBALL FALLBACK]', e);
      }
    }
  }

  let leagueFixtures = [];
  try {
    leagueFixtures = await fetchLeagueFixtures();
  } catch (e) {
    console.warn('[API-FOOTBALL FALLBACK]', e);
  }
  if (leagueFixtures?.length) fixtures.push(...leagueFixtures);

  const unique = new Map();
  fixtures.forEach((f) => {
    if (f?.fixture?.id) unique.set(f.fixture.id, f);
  });
  return [...unique.values()];
}

function findMatchingFixture(dbMatch, fixtures) {
  if (!fixtures?.length) return null;
  if (dbMatch.api_fixture_id) {
    const byId = fixtures.find((f) => String(f.fixture?.id) === String(dbMatch.api_fixture_id));
    if (byId) return byId;
  }

  const home = normalizeName(dbMatch.home_team);
  const away = normalizeName(dbMatch.away_team);
  return fixtures.find((f) => {
    const fHome = normalizeName(f.teams?.home?.name);
    const fAway = normalizeName(f.teams?.away?.name);
    return (fHome === home && fAway === away) || (fHome === away && fAway === home);
  });
}

export async function buildMatchUpdateFromFixture(fixture, events) {
  return fixtureToMatchRow(fixture, events);
}

export async function syncMatchesToSupabase(client = supabase) {
  if (!getApiKey()) return { skipped: true, updated: 0 };

  const { data: dbMatches, error } = await client.from('matches').select('*');
  if (error) {
    logSupabaseWarn('syncMatchesToSupabase', error);
    return { updated: 0, selectError: true };
  }
  if (!dbMatches?.length) return { updated: 0, empty: true };

  let fixtures = [];
  try {
    fixtures = await fetchAllFixturesForSync(dbMatches);
  } catch (e) {
    console.warn('[API-FOOTBALL FALLBACK] fetchAllFixturesForSync', e);
    fixtures = [];
  }
  let updated = 0;

  for (const dbMatch of dbMatches) {
    const fixture = findMatchingFixture(dbMatch, fixtures);
    if (!fixture) continue;

    const apiStatus = fixture.fixture?.status?.short ?? 'NS';
    const needsEvents = LIVE_API.has(apiStatus) || FINISHED_API.has(apiStatus);
    const events = needsEvents ? await fetchFixtureEvents(fixture.fixture.id) : [];
    const patch = await buildMatchUpdateFromFixture(fixture, events);

    const { error: updateError } = await client.from('matches').update(patch).eq('id', dbMatch.id);
    if (updateError) {
      logSupabaseWarn(`syncMatchesToSupabase ${dbMatch.id}`, updateError);
      continue;
    }
    updated += 1;
  }

  return { updated };
}

/** Importa calendario FIFA y/o fixtures API; funciona con o sin API key. */
export async function ensureFootballDataSynced(client = supabase) {
  let result;
  try {
    result = await syncWorldCupFixtures(client);
  } catch (e) {
    console.warn('[ensureFootballDataSynced]', e);
    result = { skipped: true, imported: 0 };
  }

  if (getApiKey()) {
    try {
      const syncResult = await syncMatchesToSupabase(client);
      return { ...result, ...syncResult, reloadMatches: true };
    } catch (e) {
      console.warn('[Supabase] syncMatchesToSupabase', e);
      return { ...result, reloadMatches: true };
    }
  }

  return { ...result, reloadMatches: true };
}

export { insertOfficialProvisionalFixtures, deleteBrokenMatches } from './fifaScheduleSeed';

export function hasAnyLiveMatch(matches) {
  return matches?.some((m) => {
    const raw = String(m?.api_status ?? '').toUpperCase();
    if (LIVE_API.has(raw)) return true;
    return m?.status === 'live';
  });
}
