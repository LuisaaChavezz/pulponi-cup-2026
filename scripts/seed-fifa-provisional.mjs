/**
 * Importa / actualiza el calendario FIFA provisional desde `src/data/officialWorldCupSchedule.js`
 * (upsert por `official_id`, sin duplicar, `provisional: true`).
 *
 * Requiere en .env.local:
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (recomendado: RLS solo permite insert/update matches a `authenticated`)
 *
 * Uso: npm run seed:fifa
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { insertOfficialProvisionalFixtures } from '../src/lib/fifaScheduleSeed.js';

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

if (!url) {
  console.error('Falta VITE_SUPABASE_URL en .env.local');
  process.exit(1);
}

if (!url.startsWith('https://')) {
  console.error('VITE_SUPABASE_URL debe ser una URL https completa, recibido:', url);
  process.exit(1);
}

const key = serviceKey || anonKey;
if (!key) {
  console.error(
    'Falta SUPABASE_SERVICE_ROLE_KEY (recomendado) o VITE_SUPABASE_ANON_KEY en .env.local.\n' +
      'Con solo anon, el seed suele fallar por RLS (políticas `to authenticated`).'
  );
  process.exit(1);
}

if (!serviceKey) {
  console.warn('[seed:fifa] Usando clave sin service role; si falla el upsert, añade SUPABASE_SERVICE_ROLE_KEY.');
}

const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

try {
  const result = await insertOfficialProvisionalFixtures(client);
  console.log('[seed:fifa] Listo:', result);
  console.log(
    'Clientes abiertos: la app recarga partidos vía Realtime (`matches`) o al pulsar sincronizar / recargar.'
  );
} catch (e) {
  console.error('[seed:fifa] Error:', e?.message ?? e);
  process.exit(1);
}
