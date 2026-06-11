-- Badge «La Quiniela Llama» para inscritos en la quiniela Pulponi Cup 2026.
-- Ejecutar en Supabase SQL Editor (seguro re-ejecutar).

INSERT INTO public.user_badges (profile_id, badge_id, earned_at)
SELECT id, 'quiniela-aceptaste-el-reto', now()
FROM public.profiles
WHERE username IN (
  'pirata12', 'luisaachavezz', 'góngora', 'gongora', 'itsmariachavez',
  'manolo', 'marceloveloz', 'ni', 'analy', 'chovitz', 'chaveza', 'mau',
  'adriespinoza', 'claudioroca', 'costalitocampeon', 'lizbeth',
  'michrobertsv', 'piyu', 'ucg', 'vv', 'ivan', 'scs'
)
ON CONFLICT (profile_id, badge_id) DO NOTHING;
