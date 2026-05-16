PULPONI CUP 2026 — Vite + React + Supabase

Requisitos: Node.js 18+ y npm

1. Copia .env.example a .env.local y agrega tus credenciales:
   VITE_SUPABASE_URL
   VITE_SUPABASE_ANON_KEY

2. En Supabase SQL Editor (ALTER, sin crear tablas):
   alter table profiles add column if not exists picks jsonb default '{}'::jsonb;
   alter table profiles add column if not exists pulponi_verified boolean default true;
   alter table activity_log add column if not exists payload jsonb;

3. Instalar y ejecutar:
   npm install
   npm run dev

4. Abre http://localhost:5173

Storage: crea bucket público "avatars" para fotos de perfil.

Archivos legacy (backup): styles.css, script.js en raíz ya no se usan; la app vive en src/
