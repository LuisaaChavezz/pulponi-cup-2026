-- Pulponi Cup — Proteger nombres reales de equipos en eliminación directa.
-- La API externa revierte home_team/away_team a placeholders ("1º Grupo A",
-- "2º Grupo B", "Mejor 3º…", "Ganador…") y también pisa kickoff/venue. Este
-- trigger conserva los nombres reales ya guardados cuando un UPDATE intenta
-- volver a un placeholder, y blinda horario/sede en TODOS los partidos de
-- eliminatoria (is_knockout) una vez definidos — incluso si los nombres siguen
-- siendo placeholder ("Ganador P75").
-- Ejecutar en Supabase → SQL Editor. Seguro para re-ejecutar.

CREATE OR REPLACE FUNCTION public.protect_knockout_names()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
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

  -- Refuerzo: cualquier partido de eliminatoria con horario/sede ya definidos
  -- no debe perder kickoff/venue ante una resync de la API, aunque los nombres
  -- sigan siendo placeholder (p. ej. "Ganador P75 vs Ganador P77").
  IF COALESCE(OLD.is_knockout, false) THEN
    IF OLD.kickoff IS NOT NULL THEN
      NEW.kickoff := OLD.kickoff;
    END IF;
    IF OLD.venue IS NOT NULL AND OLD.venue <> '' THEN
      NEW.venue := OLD.venue;
    END IF;
    IF OLD.venue_city IS NOT NULL AND OLD.venue_city <> '' THEN
      NEW.venue_city := OLD.venue_city;
    END IF;
  END IF;

  -- Si el local ya tiene nombre real (no placeholder), blindar también equipos
  -- y sede/horario en cada UPDATE (la API los revierte junto con los nombres).
  IF OLD.home_team IS NOT NULL
     AND OLD.home_team <> ''
     AND OLD.home_team NOT ILIKE '%grupo%'
     AND OLD.home_team NOT ILIKE '%mejor%'
     AND OLD.home_team NOT ILIKE '%ganador%' THEN
    NEW.home_team := OLD.home_team;
    NEW.away_team := OLD.away_team;
    IF OLD.kickoff IS NOT NULL THEN
      NEW.kickoff := OLD.kickoff;
    END IF;
    IF OLD.venue IS NOT NULL THEN
      NEW.venue := OLD.venue;
    END IF;
    IF OLD.venue_city IS NOT NULL THEN
      NEW.venue_city := OLD.venue_city;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_knockout_names_trigger ON public.matches;

CREATE TRIGGER protect_knockout_names_trigger
BEFORE UPDATE ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.protect_knockout_names();
