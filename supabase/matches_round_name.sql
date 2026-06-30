-- Etapa del Mundial por partido, para agrupar en los PDF de resumen.
-- Idempotente: se puede correr varias veces.

ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS round_name text;

UPDATE public.matches SET round_name = 'Fase de Grupos'
  WHERE is_knockout = false OR is_knockout IS NULL;

UPDATE public.matches SET round_name = 'Dieciseisavos de Final'
  WHERE is_knockout = true AND kickoff < '2026-07-04';

UPDATE public.matches SET round_name = 'Octavos de Final'
  WHERE is_knockout = true AND kickoff >= '2026-07-04' AND kickoff < '2026-07-09';

UPDATE public.matches SET round_name = 'Cuartos de Final'
  WHERE is_knockout = true AND kickoff >= '2026-07-09' AND kickoff < '2026-07-14';

UPDATE public.matches SET round_name = 'Semifinales'
  WHERE is_knockout = true AND kickoff >= '2026-07-14' AND kickoff < '2026-07-18';

UPDATE public.matches SET round_name = 'Final'
  WHERE is_knockout = true AND kickoff >= '2026-07-18';
