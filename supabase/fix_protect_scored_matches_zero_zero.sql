-- Fix: protect_scored_matches revertía 0-0 legítimos si OLD tenía goles (p. ej. marcador en vivo).
-- Solo proteger cuando se intenta borrar el marcador de un partido ya finalizado.
-- Ejecutar en SQL Editor o: supabase db query --linked -f supabase/fix_protect_scored_matches_zero_zero.sql

CREATE OR REPLACE FUNCTION public.protect_scored_matches()
RETURNS trigger
LANGUAGE plpgsql
AS $body$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.pick_scores
    WHERE match_id = NEW.id::text
  )
  AND NEW.home_score = 0
  AND NEW.away_score = 0
  AND (OLD.home_score > 0 OR OLD.away_score > 0)
  AND public._match_is_finished(OLD.*)
  AND NOT public._match_is_finished(NEW.*)
  THEN
    NEW.home_score := OLD.home_score;
    NEW.away_score := OLD.away_score;
    NEW.status := OLD.status;
    NEW.api_status := OLD.api_status;
  END IF;

  RETURN NEW;
END;
$body$;
