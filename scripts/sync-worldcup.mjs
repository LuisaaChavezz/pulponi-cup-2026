/**
 * Sincroniza el calendario oficial FIFA → public.matches (fuente primaria Pulponi Cup).
 *
 * Requiere en .env.local:
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (recomendado para upserts masivos sin RLS)
 *
 * Uso: npm run sync:worldcup
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
    if (process.env[k] == null || process.env[k] === '') process.env[k] = v;
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const url = process.env.VITE_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim();

if (!url?.startsWith('https://')) {
  console.error('Falta VITE_SUPABASE_URL válida en .env.local');
  process.exit(1);
}

const key = serviceKey || anonKey;
if (!key) {
  console.error(
    'Falta SUPABASE_SERVICE_ROLE_KEY (recomendado) o VITE_SUPABASE_ANON_KEY en .env.local.'
  );
  process.exit(1);
}

if (!serviceKey) {
  console.warn('[sync:worldcup] Usando clave sin service role; el upsert masivo puede fallar por RLS.');
}

const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

try {
  const { syncWorldCupFixtures } = await import('../src/lib/footballApi.js');
  const result = await syncWorldCupFixtures(client);
  console.log('[sync:worldcup] Total calendario oficial:', result.total ?? '—');
} catch (error) {
  console.error('[sync:worldcup] Error:', error?.message ?? error);
  process.exit(1);
}
