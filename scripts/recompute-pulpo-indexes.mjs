/**
 * Recalcula profiles.pulpo_index para todos los usuarios con pick_scores.
 *
 * Requiere en .env.local:
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (recomendado) o VITE_SUPABASE_ANON_KEY
 *
 * Antes de ejecutar, corre en Supabase SQL Editor:
 *   supabase/recompute_pulpo_indexes.sql
 *
 * Uso: npm run recompute:pulpo
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnvFile(name) {
  const p = resolve(root, name);
  if (!existsSync(p)) return;
  const raw = readFileSync(p, 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const url = process.env.VITE_SUPABASE_URL?.trim();
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.VITE_SUPABASE_ANON_KEY?.trim();

if (!url?.startsWith('https://') || !key) {
  console.error('Faltan VITE_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (o VITE_SUPABASE_ANON_KEY).');
  process.exit(1);
}

const supabase = createClient(url, key);

async function fallbackClientSync() {
  const { syncAllPulpoIndexes } = await import('../src/lib/pulpoSync.js');
  const { data: profiles } = await supabase.from('profiles').select(
    'id, username, points, exacts, streak, picks, pulpo_index, pulpo_stats'
  );
  const { data: matches } = await supabase
    .from('matches')
    .select('id, kickoff, home_score, away_score, status, api_status');
  const { data: pickScoreRows } = await supabase
    .from('pick_scores')
    .select('profile_id, match_id, points_awarded, exact_hit, winner_hit');

  return syncAllPulpoIndexes(supabase, {
    profiles: profiles ?? [],
    matches: matches ?? [],
    pickScoreRows: pickScoreRows ?? [],
  });
}

async function main() {
  const { data, error } = await supabase.rpc('recompute_all_pulpo_indexes');

  if (!error) {
    console.log(`✅ RPC recompute_all_pulpo_indexes: ${data} perfiles actualizados.`);
    return;
  }

  if (!/function.*does not exist|42883|PGRST202|not find/i.test(String(error.message ?? error))) {
    console.error('RPC error:', error.message);
    process.exit(1);
  }

  console.warn('RPC no instalada; usando sync en cliente…');
  const result = await fallbackClientSync();
  console.log(`✅ Fallback cliente: ${result.updated} perfiles actualizados.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
