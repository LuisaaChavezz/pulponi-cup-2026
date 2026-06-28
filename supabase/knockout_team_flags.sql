-- Pulponi Cup — Banderas reales para dieciseisavos de final.
-- Los partidos knockout tienen home_flag/away_flag = '⚽' (placeholder) aunque
-- ya tengan nombres reales. La UI usa match.home_flag ?? fallback, así que '⚽'
-- bloquea el emoji correcto. Este script setea la bandera real por nombre de equipo.
-- Ejecutar en Supabase → SQL Editor. Seguro para re-ejecutar.

WITH flag_map(team, flag) AS (
  VALUES
    ('Sudáfrica', '🇿🇦'),
    ('Canadá', '🇨🇦'),
    ('Brasil', '🇧🇷'),
    ('Japón', '🇯🇵'),
    ('Alemania', '🇩🇪'),
    ('Paraguay', '🇵🇾'),
    ('Países Bajos', '🇳🇱'),
    ('Marruecos', '🇲🇦'),
    ('Costa de Marfil', '🇨🇮'),
    ('Noruega', '🇳🇴'),
    ('Francia', '🇫🇷'),
    ('Suecia', '🇸🇪'),
    ('México', '🇲🇽'),
    ('Ecuador', '🇪🇨'),
    ('Bélgica', '🇧🇪'),
    ('Senegal', '🇸🇳'),
    ('Croacia', '🇭🇷'),
    ('Portugal', '🇵🇹'),
    ('USA', '🇺🇸'),
    ('Bosnia', '🇧🇦'),
    ('Inglaterra', '🏴󠁧󠁢󠁥󠁮󠁧󠁿'),
    ('RD Congo', '🇨🇩'),
    ('Corea del Sur', '🇰🇷'),
    ('Argelia', '🇩🇿'),
    ('Colombia', '🇨🇴'),
    ('Ghana', '🇬🇭'),
    ('Australia', '🇦🇺'),
    ('Egipto', '🇪🇬'),
    ('España', '🇪🇸'),
    ('Austria', '🇦🇹'),
    ('Argentina', '🇦🇷'),
    ('Cabo Verde', '🇨🇻')
)
UPDATE public.matches m
SET home_flag = fm.flag
FROM flag_map fm
WHERE m.home_team = fm.team
  AND coalesce(m.home_flag, '') IS DISTINCT FROM fm.flag;

WITH flag_map(team, flag) AS (
  VALUES
    ('Sudáfrica', '🇿🇦'),
    ('Canadá', '🇨🇦'),
    ('Brasil', '🇧🇷'),
    ('Japón', '🇯🇵'),
    ('Alemania', '🇩🇪'),
    ('Paraguay', '🇵🇾'),
    ('Países Bajos', '🇳🇱'),
    ('Marruecos', '🇲🇦'),
    ('Costa de Marfil', '🇨🇮'),
    ('Noruega', '🇳🇴'),
    ('Francia', '🇫🇷'),
    ('Suecia', '🇸🇪'),
    ('México', '🇲🇽'),
    ('Ecuador', '🇪🇨'),
    ('Bélgica', '🇧🇪'),
    ('Senegal', '🇸🇳'),
    ('Croacia', '🇭🇷'),
    ('Portugal', '🇵🇹'),
    ('USA', '🇺🇸'),
    ('Bosnia', '🇧🇦'),
    ('Inglaterra', '🏴󠁧󠁢󠁥󠁮󠁧󠁿'),
    ('RD Congo', '🇨🇩'),
    ('Corea del Sur', '🇰🇷'),
    ('Argelia', '🇩🇿'),
    ('Colombia', '🇨🇴'),
    ('Ghana', '🇬🇭'),
    ('Australia', '🇦🇺'),
    ('Egipto', '🇪🇬'),
    ('España', '🇪🇸'),
    ('Austria', '🇦🇹'),
    ('Argentina', '🇦🇷'),
    ('Cabo Verde', '🇨🇻')
)
UPDATE public.matches m
SET away_flag = fm.flag
FROM flag_map fm
WHERE m.away_team = fm.team
  AND coalesce(m.away_flag, '') IS DISTINCT FROM fm.flag;
