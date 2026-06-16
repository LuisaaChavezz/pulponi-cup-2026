import { createClient } from '@supabase/supabase-js';
import {
  fetchLiveScores,
  hasAnyLiveMatch,
  isFootballApiConfigured,
  syncLiveScoresToSupabase,
  syncMatchesToSupabase,
} from './footballApi.js';

export function readServerEnv(name) {
  const v = process.env[name];
  return v == null ? '' : String(v).trim();
}

/** Cliente Supabase con service role (solo servidor / cron). */
export function createServerSupabaseClient() {
  const url = readServerEnv('VITE_SUPABASE_URL') || readServerEnv('SUPABASE_URL');
  const key = readServerEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url?.startsWith('https://')) {
    throw new Error('missing_supabase_url');
  }
  if (!key) {
    throw new Error('missing_supabase_service_role_key');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function summarizeSyncResult(result) {
  if (!result) return null;
  return {
    updated: Number(result.updated ?? 0),
    ignored: Number(result.ignored ?? 0),
    finishedMatchIds: result.finishedMatchIds ?? [],
    scoring: result.scoring ?? null,
    source: result.source ?? null,
    skipped: Boolean(result.skipped),
  };
}

/**
 * Sincroniza marcadores API-Football → Supabase y puntúa vía RPC score_finished_match.
 *
 * @param {'live'|'full'|'auto'} mode
 *   - live: solo partidos en vivo (polling frecuente)
 *   - full: live + revisión de todos los partidos del Mundial en BD
 *   - auto: live siempre; full solo si no hay partidos en vivo
 */
export async function runFootballCronSync(client, { mode = 'auto' } = {}) {
  if (!client) client = createServerSupabaseClient();

  if (!isFootballApiConfigured()) {
    return { ok: false, error: 'football_api_not_configured' };
  }

  const normalizedMode = mode === 'live' || mode === 'full' ? mode : 'auto';

  if (normalizedMode === 'live') {
    const live = await syncLiveScoresToSupabase(client);
    return {
      ok: true,
      mode: 'live',
      live: summarizeSyncResult(live),
    };
  }

  if (normalizedMode === 'full') {
    const live = await syncLiveScoresToSupabase(client);
    const full = await syncMatchesToSupabase(client);
    return {
      ok: true,
      mode: 'full',
      live: summarizeSyncResult(live),
      full: summarizeSyncResult(full),
    };
  }

  const liveFixtures = await fetchLiveScores();
  const { data: dbMatches, error: dbErr } = await client
    .from('matches')
    .select('id, api_status, status, api_fixture_id');

  if (dbErr) {
    console.warn('[footballCronSync] matches select', dbErr.message);
  }

  const hasLive =
    liveFixtures.length > 0 || hasAnyLiveMatch(dbMatches ?? []);

  const live = await syncLiveScoresToSupabase(client);
  let full = null;
  if (!hasLive) {
    full = await syncMatchesToSupabase(client);
  }

  return {
    ok: true,
    mode: 'auto',
    hasLive,
    live: summarizeSyncResult(live),
    full: summarizeSyncResult(full),
  };
}
