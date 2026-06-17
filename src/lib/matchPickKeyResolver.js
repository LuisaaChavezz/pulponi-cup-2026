import { parsePickScore } from './communityPicks';
import { normalizeMatchId } from './matchUtils';

const MATCH_LOOKUP_COLUMNS =
  'id, official_id, home_team, away_team, kickoff, status, api_status, home_score, away_score';

const DEFAULT_KICKOFF_TOLERANCE_MS = 24 * 60 * 60 * 1000;

export function normalizeTeamNameForMatch(name) {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Mismos equipos (local/visitante o invertidos). */
export function teamsReferToSameMatchup(a, b) {
  if (!a || !b) return false;
  const ah = normalizeTeamNameForMatch(a.home_team);
  const aa = normalizeTeamNameForMatch(a.away_team);
  const bh = normalizeTeamNameForMatch(b.home_team);
  const ba = normalizeTeamNameForMatch(b.away_team);
  if (!ah || !aa || !bh || !ba) return false;
  return (ah === bh && aa === ba) || (ah === ba && aa === bh);
}

/** Mismo partido lógico: equipos + kickoff cercano (±24 h por defecto). */
export function isSameLogicalMatch(
  target,
  candidate,
  { kickoffToleranceMs = DEFAULT_KICKOFF_TOLERANCE_MS } = {}
) {
  if (!target || !candidate) return false;
  if (!teamsReferToSameMatchup(target, candidate)) return false;

  const t1 = target.kickoff ? new Date(target.kickoff).getTime() : NaN;
  const t2 = candidate.kickoff ? new Date(candidate.kickoff).getTime() : NaN;
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return true;
  return Math.abs(t1 - t2) <= kickoffToleranceMs;
}

function indexMatchRow(map, match) {
  if (!match) return;
  if (match.id != null) map.set(String(match.id), match);
  if (match.official_id) map.set(String(match.official_id), match);
}

/** Índice pickKey → fila de matches (catálogo en memoria + Supabase). */
export async function buildMatchIndexForPickKeys(client, pickKeys, cachedMatches = []) {
  const byKey = new Map();
  for (const match of cachedMatches ?? []) {
    indexMatchRow(byKey, match);
  }

  const missing = [...new Set((pickKeys ?? []).map((k) => String(k)).filter(Boolean))].filter(
    (key) => !byKey.has(key)
  );
  if (!missing.length || !client) return byKey;

  const CHUNK = 80;
  for (let i = 0; i < missing.length; i += CHUNK) {
    const chunk = missing.slice(i, i + CHUNK);

    const { data: byId } = await client
      .from('matches')
      .select(MATCH_LOOKUP_COLUMNS)
      .in('id', chunk);
    for (const row of byId ?? []) {
      indexMatchRow(byKey, row);
    }

    const stillMissing = chunk.filter((key) => !byKey.has(key));
    if (!stillMissing.length) continue;

    const { data: byOfficial } = await client
      .from('matches')
      .select(MATCH_LOOKUP_COLUMNS)
      .in('official_id', stillMissing);
    for (const row of byOfficial ?? []) {
      indexMatchRow(byKey, row);
    }
  }

  return byKey;
}

function pickKeyRefersToTarget(pickKey, targetMatch, matchIndex) {
  const key = String(pickKey);
  if (!key || !targetMatch) return false;

  if (key === normalizeMatchId(targetMatch.id)) return true;
  if (targetMatch.official_id && key === normalizeMatchId(targetMatch.official_id)) return true;

  const ref = matchIndex.get(key);
  if (!ref) return false;
  return isSameLogicalMatch(targetMatch, ref);
}

/**
 * Descubre claves en profiles.picks que apuntan al mismo partido (equipos + fecha).
 * @returns {{ pickKeys: string[], primaryPickKey: string, pickKeyCounts: Map<string, number> }}
 */
export function discoverPickKeysForMatch(targetMatch, profiles = [], matchIndex = new Map()) {
  const counts = new Map();

  for (const prof of profiles ?? []) {
    const picks = prof?.picks;
    if (!picks || typeof picks !== 'object') continue;

    for (const [pickKey, rawPick] of Object.entries(picks)) {
      if (!pickKey || !parsePickScore(rawPick)) continue;
      if (!pickKeyRefersToTarget(pickKey, targetMatch, matchIndex)) continue;
      const id = String(pickKey);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key);

  const canonical = [
    normalizeMatchId(targetMatch?.id),
    normalizeMatchId(targetMatch?.official_id),
  ].filter(Boolean);

  const pickKeys = [...new Set([...ranked, ...canonical])];
  const primaryPickKey = ranked[0] ?? canonical[0] ?? normalizeMatchId(targetMatch?.id);

  return { pickKeys, primaryPickKey, pickKeyCounts: counts };
}

/**
 * Resuelve fila en matches + todas las claves de pick usadas por la comunidad.
 */
export async function resolveMatchScoringContext(
  client,
  matchId,
  { matches = [], profiles } = {}
) {
  const key = normalizeMatchId(matchId);
  if (!key) return { error: 'match_id_required' };

  let targetMatch =
    (matches ?? []).find((m) => normalizeMatchId(m?.id) === key) ??
    (matches ?? []).find((m) => normalizeMatchId(m?.official_id) === key) ??
    null;

  if (!targetMatch && client) {
    const { data: byId } = await client
      .from('matches')
      .select(MATCH_LOOKUP_COLUMNS)
      .eq('id', key)
      .maybeSingle();
    if (byId) targetMatch = byId;
    else {
      const { data: byOfficial } = await client
        .from('matches')
        .select(MATCH_LOOKUP_COLUMNS)
        .eq('official_id', key)
        .maybeSingle();
      targetMatch = byOfficial;
    }
  }

  if (!targetMatch) return { error: 'match_not_found', match_id: key };

  const dbId = normalizeMatchId(targetMatch.id);

  const { data: profileRows } = client
    ? await client.from('profiles').select('id, picks')
    : { data: profiles ?? [] };
  const profs = profileRows?.length ? profileRows : profiles ?? [];

  const allPickKeys = new Set();
  for (const prof of profs ?? []) {
    for (const pickKey of Object.keys(prof?.picks ?? {})) {
      if (pickKey) allPickKeys.add(String(pickKey));
    }
  }

  const matchIndex = await buildMatchIndexForPickKeys(
    client,
    [...allPickKeys],
    [targetMatch, ...(matches ?? [])]
  );

  const { pickKeys, primaryPickKey, pickKeyCounts } = discoverPickKeysForMatch(
    targetMatch,
    profs,
    matchIndex
  );

  return {
    match: targetMatch,
    dbId,
    pickKeys,
    primaryPickKey,
    pickKeyCounts,
    profiles: profs,
    matchIndex,
  };
}
