-- Endurece protect_scored_matches: un partido YA PUNTUADO (tiene pick_scores) y
-- finalizado nunca debe "des-finalizarse" por una resync de la API.
--
-- Causa raíz del bug del botón "Descargar resultados PDF": varios partidos
-- jugados terminaron 0-0 (marcador real). La versión previa solo protegía
-- cuando se borraba un marcador > 0 (OLD.home_score > 0 OR OLD.away_score > 0),
-- así que la resync de la API revertía estos 0-0 a status='scheduled'/api='NS'
-- una y otra vez → el frontend (normalizeMatch) anulaba el 0-0 y ocultaba el
-- botón. Ahora protegemos cualquier degradación finished -> no-finished de un
-- partido puntuado, sin importar el marcador.
CREATE OR REPLACE FUNCTION public.protect_scored_matches()
RETURNS trigger
LANGUAGE plpgsql
AS $body$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.pick_scores
    WHERE match_id = NEW.id::text
       OR match_id = NEW.official_id
  )
  AND public._match_is_finished(OLD.*)
  AND NOT public._match_is_finished(NEW.*)
  THEN
    NEW.status := OLD.status;
    NEW.api_status := OLD.api_status;
    NEW.home_score := OLD.home_score;
    NEW.away_score := OLD.away_score;
  END IF;

  RETURN NEW;
END;
$body$;

-- Reaplica el status correcto a los partidos puntuados que quedaron como
-- 'scheduled' (a partir de ahora el trigger los mantiene finished ante resyncs).
UPDATE matches m
SET status = 'finished',
    api_status = 'FT',
    updated_at = now()
WHERE m.status <> 'finished'
  AND EXISTS (
    SELECT 1 FROM pick_scores ps
    WHERE ps.match_id::text = m.id::text
       OR ps.match_id::text = m.official_id
  );
