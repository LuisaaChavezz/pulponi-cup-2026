/**
 * Momios para Parlay Pulponi.
 * - API autorizada: The Odds API vía proxy serverless (/api/odds) — sin scraping ni datos no autorizados.
 * - Fallback: momios Pulponi simulados, claramente etiquetados.
 */

import { buildCommunityTrendOdds, validateParlayMatchOdds } from './parlayCommunityOdds';

const ODDS_API_SPORT = 'soccer_fifa_world_cup';

function envVar(name) {
  try {
    return String(import.meta.env?.[name] ?? '').trim();
  } catch {
    return '';
  }
}

export function isAuthorizedOddsApiConfigured() {
  return envVar('VITE_THE_ODDS_API_ENABLED') === 'true';
}

function normalizeTeamName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** @deprecated Usar buildCommunityTrendOdds — conservado como alias interno. */
export function buildPulponiSimulatedOdds(match) {
  return buildCommunityTrendOdds(match, []);
}

function roundOdd(n) {
  return Math.round(n * 100) / 100;
}

function teamsMatch(a, b) {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wa = na.split(' ');
  const wb = nb.split(' ');
  return wa.some((w) => w.length > 3 && wb.includes(w));
}

function extractEventOdds(event, match) {
  const bookmakers = event?.bookmakers ?? [];
  if (!bookmakers.length) return null;

  const homeName = match?.home_team ?? event.home_team;
  const awayName = match?.away_team ?? event.away_team;

  const homePrices = [];
  const drawPrices = [];
  const awayPrices = [];
  const bookmakerNames = [];

  for (const bm of bookmakers) {
    const market = bm.markets?.find((m) => m.key === 'h2h');
    if (!market?.outcomes?.length) continue;
    bookmakerNames.push(bm.title ?? bm.key ?? 'Proveedor');

    for (const o of market.outcomes) {
      const price = Number(o.price);
      if (!Number.isFinite(price) || price <= 0) continue;
      if (o.name === 'Draw') drawPrices.push(price);
      else if (teamsMatch(o.name, homeName)) homePrices.push(price);
      else if (teamsMatch(o.name, awayName)) awayPrices.push(price);
    }
  }

  if (!homePrices.length || !awayPrices.length) return null;

  const avg = (arr) => roundOdd(arr.reduce((a, b) => a + b, 0) / arr.length);

  return {
    matchId: String(match?.id ?? event.id),
    source: 'authorized_api',
    sourceLabel: 'Momio autorizado (The Odds API)',
    bookmaker: bookmakerNames.slice(0, 3).join(', '),
    home: avg(homePrices),
    draw: drawPrices.length ? avg(drawPrices) : roundOdd(3.1),
    away: avg(awayPrices),
  };
}

function findAuthorizedEventForMatch(events, match) {
  return (events ?? []).find(
    (ev) => teamsMatch(ev.home_team, match.home_team) && teamsMatch(ev.away_team, match.away_team)
  );
}

async function fetchAuthorizedOddsEvents() {
  const res = await fetch(`/api/odds?sport=${encodeURIComponent(ODDS_API_SPORT)}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const err = new Error(`Odds API proxy ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Resuelve momios para una lista de partidos.
 * Usa API autorizada si está habilitada y responde; si no, momios Pulponi simulados.
 */
export async function resolveParlayOddsForMatches(
  matches,
  { preferAuthorized = true, communityProfiles = [] } = {}
) {
  const list = (matches ?? []).filter(Boolean);
  let authorizedEvents = null;
  let authorizedError = null;

  if (preferAuthorized && isAuthorizedOddsApiConfigured()) {
    try {
      authorizedEvents = await fetchAuthorizedOddsEvents();
    } catch (err) {
      authorizedError = err;
      authorizedEvents = null;
    }
  }

  const byMatchId = {};
  let authorizedCount = 0;
  let simulatedCount = 0;

  for (const match of list) {
    const event = authorizedEvents ? findAuthorizedEventForMatch(authorizedEvents, match) : null;
    const fromApi = event ? extractEventOdds(event, match) : null;

    if (fromApi) {
      byMatchId[String(match.id)] = fromApi;
      authorizedCount += 1;
    } else {
      const row = buildCommunityTrendOdds(match, communityProfiles);
      if (!validateParlayMatchOdds(row, row.trendPcts ?? null)) {
        console.warn('[parlayOdds] invalid simulated odds for match', match.id);
      }
      byMatchId[String(match.id)] = row;
      simulatedCount += 1;
    }
  }

  const mode =
    authorizedCount > 0 && simulatedCount === 0
      ? 'authorized'
      : authorizedCount > 0
        ? 'mixed'
        : 'simulated';

  return {
    byMatchId,
    mode,
    authorizedCount,
    simulatedCount,
    authorizedError,
    provider: authorizedCount > 0 ? 'The Odds API' : null,
  };
}

export function getOutcomeOdds(oddsRow, outcome) {
  if (!oddsRow) return null;
  const key = outcome === 'draw' ? 'draw' : outcome === 'away' ? 'away' : 'home';
  return oddsRow[key] ?? null;
}

export function oddsSourceBadge(oddsRow) {
  if (!oddsRow) return 'Momio Pulponi (simulado)';
  if (oddsRow.source === 'authorized_api') {
    return oddsRow.bookmaker
      ? `${oddsRow.sourceLabel} · ${oddsRow.bookmaker}`
      : oddsRow.sourceLabel;
  }
  if (oddsRow.source === 'pulponi_community') {
    return oddsRow.sourceLabel ?? 'Momio Pulponi (tendencia comunidad)';
  }
  return oddsRow.sourceLabel ?? 'Momio Pulponi (estimado)';
}
