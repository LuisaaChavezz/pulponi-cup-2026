-- Pulponi Cup — Proteger nombres reales de equipos en eliminación directa.
-- La API externa revierte home_team/away_team a placeholders ("1º Grupo A",
-- "2º Grupo B", "Mejor 3º…", "Ganador…"). Este trigger conserva los nombres
-- reales ya guardados cuando un UPDATE intenta volver a un placeholder.
-- Ejecutar en Supabase → SQL Editor. Seguro para re-ejecutar.

CREATE OR REPLACE FUNCTION public.protect_knockout_names()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- home_team: si el valor actual es real y el nuevo es placeholder, conservar el real.
  IF OLD.home_team IS NOT NULL
     AND OLD.home_team <> ''
     AND OLD.home_team NOT ILIKE '%grupo%'
     AND OLD.home_team NOT ILIKE '%mejor%'
     AND OLD.home_team NOT ILIKE '%ganador%'
     AND (
       NEW.home_team IS NULL
       OR NEW.home_team = ''
       OR NEW.home_team ILIKE '%grupo%'
       OR NEW.home_team ILIKE '%mejor%'
       OR NEW.home_team ILIKE '%ganador%'
     ) THEN
    NEW.home_team := OLD.home_team;
  END IF;

  -- away_team: misma protección.
  IF OLD.away_team IS NOT NULL
     AND OLD.away_team <> ''
     AND OLD.away_team NOT ILIKE '%grupo%'
     AND OLD.away_team NOT ILIKE '%mejor%'
     AND OLD.away_team NOT ILIKE '%ganador%'
     AND (
       NEW.away_team IS NULL
       OR NEW.away_team = ''
       OR NEW.away_team ILIKE '%grupo%'
       OR NEW.away_team ILIKE '%mejor%'
       OR NEW.away_team ILIKE '%ganador%'
     ) THEN
    NEW.away_team := OLD.away_team;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_knockout_names_trigger ON public.matches;

CREATE TRIGGER protect_knockout_names_trigger
BEFORE UPDATE ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.protect_knockout_names();
