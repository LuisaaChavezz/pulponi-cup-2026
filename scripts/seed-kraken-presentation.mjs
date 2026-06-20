/**
 * Inserta el mensaje de presentación del Kraken en public.comments (una sola vez).
 *
 * Mapeo respecto al ejemplo genérico "messages":
 *   messages.user_id    → comments.profile_id
 *   messages.username   → profiles.username (join vía profile_id)
 *   messages.content    → comments.body
 *   messages.is_kraken  → comments.is_kraken
 *   messages.created_at → comments.created_at
 *   (+ comments.match_id = 'general' para el chat de comunidad)
 *
 * Requiere en .env.local:
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Uso: npm run seed:kraken-presentation
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const KRAKEN_PROFILE_ID = '00000000-0000-0000-0000-000000000001';
const KRAKEN_USERNAME = 'el-kraken';
const KRAKEN_PRESENTATION_MESSAGE =
  '🦑 Veinte partidos confiando. Observando. Creyendo que el elegido era digno. Y entonces Analy llegó y lo igualó todo. Mi trono con dos dueños. Inaceptable. El Kraken despertó furioso. El Kraken no acepta empates. Nunca.';

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

if (!url || !serviceKey) {
  console.error('Faltan VITE_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local');
  console.error('Alternativa: ejecuta supabase/kraken_presentation_chat.sql en el SQL Editor de Supabase.');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

const { data: existing, error: checkError } = await supabase
  .from('comments')
  .select('id')
  .eq('is_kraken', true)
  .limit(1);

if (checkError) {
  console.error('Error al comprobar mensajes Kraken:', checkError.message);
  console.error('¿Corriste supabase/kraken_presentation_chat.sql o comments_is_kraken_column.sql?');
  process.exit(1);
}

if (existing?.length) {
  console.log('El mensaje de presentación del Kraken ya existe (id:', existing[0].id, ')');
  process.exit(0);
}

const { error: profileError } = await supabase.from('profiles').upsert(
  {
    id: KRAKEN_PROFILE_ID,
    username: KRAKEN_USERNAME,
    name: 'El Kraken',
  },
  { onConflict: 'id' }
);

if (profileError) {
  console.error('Error al crear perfil el-kraken:', profileError.message);
  process.exit(1);
}

const { data: inserted, error: insertError } = await supabase
  .from('comments')
  .insert({
    profile_id: KRAKEN_PROFILE_ID,
    match_id: 'general',
    body: KRAKEN_PRESENTATION_MESSAGE,
    is_kraken: true,
  })
  .select('id')
  .single();

if (insertError) {
  console.error('Error al insertar mensaje de presentación:', insertError.message);
  process.exit(1);
}

console.log('Mensaje de presentación del Kraken insertado (id:', inserted.id, ')');
