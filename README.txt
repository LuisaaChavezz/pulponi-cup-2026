PULPONI CUP 2026 — Vite + React + Supabase

Requisitos: Node.js 18+ y npm

1. Copia .env.example a .env.local y agrega tus credenciales:
   VITE_SUPABASE_URL
   VITE_SUPABASE_ANON_KEY
   (opcional API-Football: VITE_FOOTBALL_API_KEY, VITE_FOOTBALL_LEAGUE_ID, VITE_FOOTBALL_SEASON)

2. En Supabase SQL Editor, ejecuta en orden:
   - README: ALTER básicos (picks, pulponi_verified, activity_log payload)
   - supabase/profiles_community_picks.sql (lectura de picks para Termómetro)
   - supabase/pulpo_scoring.sql (puntuación, pick_scores, Índice Pulpo, RPC)
   - supabase/achievements.sql (logros y user_badges)
   - supabase/ranking_history.sql (movimiento de ranking, opcional)
   - supabase/user_profiles_public.sql (RLS lectura perfiles públicos: activity_log, pick_scores, user_badges)

   ALTER mínimos:
   alter table profiles add column if not exists picks jsonb default '{}'::jsonb;
   alter table profiles add column if not exists pulponi_verified boolean default true;
   alter table activity_log add column if not exists payload jsonb;

3. Instalar y ejecutar:
   npm install
   npm run dev

4. Abre http://localhost:5173

Storage: crea bucket público "avatars" para fotos de perfil.

────────────────────────────────────────────────────────────
GitHub — qué versionar (raíz del repo)
────────────────────────────────────────────────────────────
Obligatorio para que Vercel compile (index.html debe estar en la RAÍZ junto a package.json):
  index.html
  package.json
  package-lock.json
  vite.config.js
  vercel.json
  .node-version
  src/                    (toda la carpeta, incl. main.jsx y App.jsx)
  public/                 (toda la carpeta; avatars PNG)
  scripts/                (opcional: seed FIFA npm run seed:fifa)
  supabase/               (opcional: SQL de referencia; no afecta el build)

NO subir (están en .gitignore y Vercel los regenera):
  node_modules/
  dist/
  .env.local

────────────────────────────────────────────────────────────
Vercel
────────────────────────────────────────────────────────────
- Root Directory del proyecto: vacío / raíz del repo (donde está index.html).
- Framework: Vite (vercel.json ya fija build y salida dist).
- Variables de entorno en Vercel: mismas claves que .env.example (VITE_*).
- No uses como raíz solo la carpeta "src" (index.html y vite.config.js deben estar en la misma raíz del deploy).

Entrada de la app: index.html → <script type="module" src="/src/main.jsx"></script>
  (Vite resuelve el módulo; en producción el build empaqueta a /assets/*.js)

────────────────────────────────────────────────────────────
Dominio pulponicup.com.mx (Vercel)
────────────────────────────────────────────────────────────
- Vercel → Project → Settings → Domains → Add → pulponicup.com.mx
- En tu DNS (registrar): registros que indique Vercel (A/CNAME).
- Tras propagación, HTTPS lo gestiona Vercel.
