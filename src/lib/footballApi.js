import {
  deleteMatchesMissingTeams,
  syncOfficialWorldCupSchedule,
  isMissingTeamsRow,
} from './fifaScheduleSeed';
import { WORLD_CUP_DEMO_FIXTURES, demoFixtureToMatchRow } from '../data/worldCupDemoFixtures';
import { FINISHED_API, LIVE_API, normalizeApiStatus } from './footballApiStatus';
import { flagEmojiForTeam } from './teamFlags';
import { mapApiEventsToHighlights } from './highlightsMapper';
import {
  isWorldCupMatch,
  isApiWorldCup2026Fixture,
  filterApiWorldCup2026Fixtures,
  isOfficialWorldCupScheduleId,
  wcLeagueIdFromEnv,
  wcSeasonFromEnv,
} from './worldCupScope';

const API_BASE = 'https://v3.football.api-sports.io';
let lastApiFootballError = null;

export function getLastApiFootballError() {
  return lastApiFootballError;
}

function envVar(name) {
  if (typeof import.meta !== 'undefined' && import.meta.env?.[name]) {
    return String(import.meta.env[name]);
  }
  if (typeof process !== 'undefined' && process.env?.[name]) {
    return String(process.env[name]);
  }
  return '';
}

async function getDefaultSupabaseClient() {
  const { supabase } = await import('./supabase.js');
  return supabase;
}

function getApiKey() {
  return envVar('VITE_FOOTBALL_API_KEY').trim();
}

export function getLeagueId() {
  return envVar('VITE_FOOTBALL_LEAGUE_ID').trim() || '1';
}

export function getSeason() {
  return envVar('VITE_FOOTBALL_SEASON').trim() || '2026';
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
    lastApiFootballError = Object.values(json.errors).join(' ') || JSON.stringify(json.errors);
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
  const fixtures = filterApiWorldCup2026Fixtures(
    (await apiFetchAllPages('/fixtures', { league: leagueId, season })) ?? []
  );
  if (fixtures.length) {
    console.log('[API-FOOTBALL]', fixtures.length, 'fixtures', { leagueId, season });
  }
  return fixtures;
}

/** Fixtures en vivo para la liga y temporada configuradas (VITE_FOOTBALL_*). */
export async function fetchLiveScores() {
  if (!getApiKey()) return [];

  const leagueId = getLeagueId();
  const season = getSeason();
  const merged = new Map();

  try {
    const byLeague = await apiFetch('/fixtures', { league: leagueId, season, live: 'all' });
    filterApiWorldCup2026Fixtures(byLeague ?? []).forEach((f) => {
      if (f?.fixture?.id) merged.set(f.fixture.id, f);
    });
  } catch (err) {
    console.warn('[API-FOOTBALL FALLBACK] fetchLiveScores league', err);
  }

  try {
    const liveAll = await apiFetch('/fixtures', { live: 'all' }, { requireKey: true });
    filterApiWorldCup2026Fixtures(liveAll ?? []).forEach((f) => {
      if (f?.fixture?.id) merged.set(f.fixture.id, f);
    });
  } catch (err) {
    console.warn('[API-FOOTBALL FALLBACK] fetchLiveScores live=all', err);
  }

  const fixtures = [...merged.values()];
  if (fixtures.length) {
    console.log('[API-FOOTBALL] live scores', fixtures.length, { leagueId, season });
  }
  return fixtures;
}

export async function fetchFixturesWithLiveMerge() {
  try {
    let fixtures = await fetchWorldCupFixtures();
    const live = await apiFetch('/fixtures', { live: 'all' }, { requireKey: true }).catch(() => []);
    fixtures = filterApiWorldCup2026Fixtures(fixtures);
    const liveWc = filterApiWorldCup2026Fixtures(live ?? []);
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
    .eq('is_demo', true);

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

async function planApiFixturesSync(client, fixtures) {
  const { data: existingRows, error: listError } = await client
    .from('matches')
    .select('id, api_fixture_id, provisional, official_id, home_team, away_team, league_id, season')
    .order('kickoff', { ascending: true });

  if (listError) {
    throw new Error(listError.message ?? 'No se pudo leer public.matches');
  }

  const rows = (existingRows ?? []).filter(isWorldCupMatch);
  const existingByApiId = new Map();
  for (const row of rows) {
    if (row.api_fixture_id != null && Number(row.api_fixture_id) > 0) {
      existingByApiId.set(String(row.api_fixture_id), row);
    }
  }

  const provisionals = rows.filter((r) => r.provisional === true);
  const seen = new Set();
  const plans = [];
  let toUpdate = 0;
  let ignored = 0;

  const sortedFixtures = filterApiWorldCup2026Fixtures(fixtures).sort((a, b) => {
    const ta = new Date(a?.fixture?.date ?? 0).getTime();
    const tb = new Date(b?.fixture?.date ?? 0).getTime();
    return ta - tb;
  });

  for (const fixture of sortedFixtures) {
    const fid = fixture?.fixture?.id;
    if (!fid || seen.has(fid)) continue;
    seen.add(fid);

    const existing = existingByApiId.get(String(fid));
    const matchedProvisional = !existing
      ? provisionals.find((p) => apiFixtureAllowedForDbMatch(p, fixture))
      : null;

    if (existing && apiFixtureAllowedForDbMatch(existing, fixture)) {
      toUpdate += 1;
      plans.push({
        fixture,
        mode: 'update',
        targetId: existing.id,
      });
    } else if (matchedProvisional) {
      toUpdate += 1;
      plans.push({
        fixture,
        mode: 'merge_provisional',
        targetId: matchedProvisional.id,
      });
    } else {
      ignored += 1;
    }
  }

  return {
    apiTotal: seen.size,
    existingInDb: rows.length,
    toInsert: 0,
    toUpdate,
    ignored,
    plans,
  };
}

async function applyApiFixturesSync(client, plan) {
  const leagueId = getLeagueId();
  const season = getSeason();
  let inserted = 0;
  let updated = 0;
  let mergedProvisional = 0;
  let skipped = plan.ignored ?? 0;
  const errors = [];

  for (const item of plan.plans) {
    const fid = item.fixture?.fixture?.id;
    if (!fid || !item.targetId) continue;

    try {
      const apiStatus = item.fixture.fixture?.status?.short ?? 'NS';
      const needsEvents = LIVE_API.has(apiStatus) || FINISHED_API.has(apiStatus);
      const events = needsEvents ? await fetchFixtureEvents(fid) : [];
      const patch = {
        ...buildResultsPatchFromFixture(item.fixture, events),
        provisional: false,
        is_demo: false,
      };

      const { error } = await client.from('matches').update(patch).eq('id', item.targetId);
      if (error) throw error;

      if (item.mode === 'merge_provisional') {
        mergedProvisional += 1;
      }
      updated += 1;
    } catch (error) {
      logSupabaseWarn(`applyApiResultsSync ${fid}`, error);
      errors.push(error);
      skipped += 1;
    }
  }

  if (errors.length) {
    const first = errors[0];
    const message = first?.message ?? String(first);
    throw new Error(message);
  }

  console.info(
    `[API results] ${updated} actualizados (${mergedProvisional} enlazados al calendario FIFA; ${skipped} ignorados; liga ${leagueId}, temporada ${season})`
  );

  return { inserted, updated, mergedProvisional, skipped, errors };
}

async function upsertApiFixtures(client, fixtures, { logPreview = false } = {}) {
  const leagueId = getLeagueId();
  const season = getSeason();
  const plan = await planApiFixturesSync(client, fixtures);

  if (logPreview) {
    console.log(`API devolvió (Mundial 2026): ${plan.apiTotal} partidos`);
    console.log(`En Supabase (Mundial 2026): ${plan.existingInDb} partidos`);
    console.log(`A actualizar: ${plan.toUpdate}`);
    console.log(`Ignorados (fuera del seed / no enlazables): ${plan.ignored ?? 0}`);
  }

  const result = await applyApiFixturesSync(client, plan);

  if (logPreview) {
    console.log(`Sync completado: ${result.updated} actualizados, ${result.skipped ?? 0} ignorados.`);
  }

  return {
    apiTotal: plan.apiTotal,
    existingInDb: plan.existingInDb,
    plannedInsert: 0,
    plannedUpdate: plan.toUpdate,
    ignored: plan.ignored ?? 0,
    inserted: result.inserted,
    updated: result.updated,
    skipped: result.skipped ?? 0,
    mergedProvisional: result.mergedProvisional,
    imported: result.updated,
    demo: false,
    source: 'api_results',
    total: plan.apiTotal,
    leagueId,
    season,
  };
}

/** Actualiza resultados API solo en partidos del seed oficial (no crea filas nuevas). */
export async function syncMatchesFromApi(client) {
  if (!client) client = await getDefaultSupabaseClient();
  if (!getApiKey()) {
    throw new Error('Falta VITE_FOOTBALL_API_KEY en el entorno.');
  }

  lastApiFootballError = null;
  const fixtures = await fetchFixturesWithLiveMerge();
  if (!fixtures.length) {
    const detail = getLastApiFootballError();
    console.warn(
      '[API results]',
      detail ?? 'Sin fixtures Mundial 2026 — calendario sigue en officialWorldCupSchedule.js'
    );
    return syncMatchesToSupabase(client);
  }

  return upsertApiFixtures(client, fixtures, { logPreview: true });
}

export async function buildMatchUpdateFromFixture(fixture, events) {
  return fixtureToMatchRow(fixture, events);
}

function printWorldCupSyncReport(result) {
  console.log('Sync completado:');
  console.log(`${result.inserted ?? 0} insertados`);
  console.log(`${result.updated ?? 0} actualizados`);
  console.log(`${result.skipped ?? 0} omitidos`);
}

/**
 * Sincronizador principal del calendario Pulponi Cup.
 * Fuente: officialWorldCupSchedule.js (FIFA). API-Football solo en syncMatchesToSupabase.
 */
export async function syncWorldCupFixtures(client) {
  if (!client) client = await getDefaultSupabaseClient();

  await deleteMatchesMissingTeams(client);
  await deleteNonWorldCupMatches(client);
  try {
    await deleteDemoMatches(client);
  } catch (e) {
    logSupabaseWarn('deleteDemoMatches', e);
  }

  const result = await syncOfficialWorldCupSchedule(client);
  printWorldCupSyncReport(result);
  return result;
}

async function fetchAllFixturesForSync(dbMatches) {
  const wcRows = dbMatches.filter(isWorldCupMatch);
  const positiveIds = [
    ...new Set(wcRows.map((m) => m.api_fixture_id).filter((id) => Number(id) > 0)),
  ];
  const fixtures = [];

  if (positiveIds.length) {
    for (let i = 0; i < positiveIds.length; i += 20) {
      const chunk = positiveIds.slice(i, i + 20);
      try {
        const batch = await apiFetch('/fixtures', { ids: chunk.join('-') });
        if (batch?.length) fixtures.push(...filterApiWorldCup2026Fixtures(batch));
      } catch (e) {
        console.warn('[API-FOOTBALL FALLBACK]', e);
      }
    }
  }

  try {
    const live = await apiFetch('/fixtures', { live: 'all' }, { requireKey: true });
    fixtures.push(...filterApiWorldCup2026Fixtures(live ?? []));
  } catch (e) {
    console.warn('[API-FOOTBALL FALLBACK]', e);
  }

  try {
    const leagueBatch = await fetchWorldCupFixtures();
    fixtures.push(...filterApiWorldCup2026Fixtures(leagueBatch ?? []));
  } catch (e) {
    console.warn('[API-FOOTBALL FALLBACK]', e);
  }

  const unique = new Map();
  filterApiWorldCup2026Fixtures(fixtures).forEach((f) => {
    if (f?.fixture?.id) unique.set(f.fixture.id, f);
  });
  return [...unique.values()];
}

function findMatchingFixture(dbMatch, fixtures) {
  if (!fixtures?.length || !isWorldCupMatch(dbMatch)) return null;

  if (Number(dbMatch.api_fixture_id) > 0) {
    const byId = fixtures.find(
      (f) =>
        String(f.fixture?.id) === String(dbMatch.api_fixture_id) &&
        isApiWorldCup2026Fixture(f)
    );
    if (byId && apiFixtureAllowedForDbMatch(dbMatch, byId)) return byId;
  }

  return fixtures.find(
    (f) => isApiWorldCup2026Fixture(f) && apiFixtureAllowedForDbMatch(dbMatch, f)
  );
}

function apiFixtureAllowedForDbMatch(dbMatch, fixture) {
  if (!isWorldCupMatch(dbMatch)) return false;
  if (!isApiWorldCup2026Fixture(fixture)) return false;

  const fid = fixture?.fixture?.id;
  if (!fid) return false;

  const apiId = Number(dbMatch.api_fixture_id);
  if (Number.isFinite(apiId) && apiId > 0 && String(apiId) === String(fid)) return true;

  if (isOfficialWorldCupScheduleId(dbMatch.official_id)) {
    return teamsMatchFixture(dbMatch, fixture);
  }

  return teamsMatchFixture(dbMatch, fixture);
}

/** Solo actualiza marcador/estado/eventos — no sobrescribe calendario ni id de fila (picks). */
export function buildResultsPatchFromFixture(fixture, events = []) {
  const apiStatus = fixture.fixture?.status?.short ?? 'NS';
  const goals = mapGoals(fixture, events);

  return {
    api_fixture_id: fixture.fixture?.id,
    league_id: fixture.league?.id ?? null,
    season: fixture.league?.season ?? null,
    api_status: apiStatus,
    status: normalizeApiStatus(apiStatus),
    home_score: goals.home ?? 0,
    away_score: goals.away ?? 0,
    minute: fixture.fixture?.status?.elapsed ?? null,
    events: mapTimelineEvents(events),
    goals: goals.list,
    cards: mapCards(events),
    penalties: mapPenalties(fixture),
    winner: resolveWinner(fixture),
    updated_at: new Date().toISOString(),
  };
}

/** Actualiza solo partidos en vivo (marcador, minuto, estado, eventos). */
export async function syncLiveScoresToSupabase(client) {
  if (!client) client = await getDefaultSupabaseClient();
  if (!getApiKey()) return { skipped: true, updated: 0, ignored: 0 };

  const liveFixtures = await fetchLiveScores();
  if (!liveFixtures.length) return { updated: 0, ignored: 0, empty: true, source: 'live_scores' };

  const { data: dbMatches, error } = await client.from('matches').select('*');
  if (error) {
    logSupabaseWarn('syncLiveScoresToSupabase', error);
    return { updated: 0, ignored: 0, selectError: true, source: 'live_scores' };
  }

  const wcMatches = (dbMatches ?? []).filter(isWorldCupMatch);
  let updated = 0;
  let ignored = 0;

  for (const fixture of liveFixtures) {
    const fid = fixture?.fixture?.id;
    if (!fid) continue;

    const dbMatch = wcMatches.find((row) => findMatchingFixture(row, [fixture]));
    if (!dbMatch) {
      ignored += 1;
      continue;
    }

    const apiStatus = fixture.fixture?.status?.short ?? 'NS';
    const needsEvents = LIVE_API.has(apiStatus) || FINISHED_API.has(apiStatus);
    const events = needsEvents ? await fetchFixtureEvents(fid) : [];
    const patch = buildResultsPatchFromFixture(fixture, events);

    const { error: updateError } = await client.from('matches').update(patch).eq('id', dbMatch.id);
    if (updateError) {
      logSupabaseWarn(`syncLiveScoresToSupabase ${dbMatch.id}`, updateError);
      ignored += 1;
      continue;
    }
    updated += 1;
  }

  if (updated) {
    console.info(`[API live] ${updated} partidos actualizados (${ignored} ignorados)`);
  }

  return { updated, ignored, source: 'live_scores' };
}

export async function syncMatchesToSupabase(client) {
  if (!client) client = await getDefaultSupabaseClient();
  if (!getApiKey()) return { skipped: true, updated: 0, ignored: 0 };

  const { data: dbMatches, error } = await client.from('matches').select('*');
  if (error) {
    logSupabaseWarn('syncMatchesToSupabase', error);
    return { updated: 0, ignored: 0, selectError: true };
  }
  if (!dbMatches?.length) return { updated: 0, ignored: 0, empty: true };

  const wcMatches = dbMatches.filter(isWorldCupMatch);
  let fixtures = [];
  try {
    fixtures = await fetchAllFixturesForSync(wcMatches);
  } catch (e) {
    console.warn('[API-FOOTBALL FALLBACK] fetchAllFixturesForSync', e);
    fixtures = [];
  }

  let updated = 0;
  let ignored = 0;

  for (const dbMatch of wcMatches) {
    const fixture = findMatchingFixture(dbMatch, fixtures);
    if (!fixture) {
      ignored += 1;
      continue;
    }

    const apiStatus = fixture.fixture?.status?.short ?? 'NS';
    const needsEvents = LIVE_API.has(apiStatus) || FINISHED_API.has(apiStatus);
    const events = needsEvents ? await fetchFixtureEvents(fixture.fixture.id) : [];
    const patch = buildResultsPatchFromFixture(fixture, events);

    const { error: updateError } = await client.from('matches').update(patch).eq('id', dbMatch.id);
    if (updateError) {
      logSupabaseWarn(`syncMatchesToSupabase ${dbMatch.id}`, updateError);
      ignored += 1;
      continue;
    }
    updated += 1;
  }

  return { updated, ignored, source: 'api_results' };
}

/** Importa calendario FIFA y/o fixtures API; funciona con o sin API key. */
export async function ensureFootballDataSynced(client) {
  if (!client) client = await getDefaultSupabaseClient();
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

export {
  syncOfficialWorldCupSchedule,
  insertOfficialProvisionalFixtures,
  deleteBrokenMatches,
} from './fifaScheduleSeed';

export function hasAnyLiveMatch(matches) {
  return matches?.some((m) => {
    const raw = String(m?.api_status ?? '').toUpperCase();
    if (LIVE_API.has(raw)) return true;
    return m?.status === 'live';
  });
}
