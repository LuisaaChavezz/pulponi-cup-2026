-- Recalcula rank_position en ranking_history con dense rank (sin saltos por empates).
-- Ejecutar en Supabase → SQL Editor después del deploy del cambio en la app.
-- Mismos puntos → misma posición; el siguiente grupo de puntos usa posición +1.

UPDATE public.ranking_history AS rh
SET rank_position = ranked.dense_rank
FROM (
  SELECT
    id,
    DENSE_RANK() OVER (
      PARTITION BY jornada_id
      ORDER BY points DESC
    ) AS dense_rank
  FROM public.ranking_history
) AS ranked
WHERE rh.id = ranked.id;

COMMENT ON TABLE public.ranking_history IS
  'Posición (dense rank) y puntos de cada jugador por jornada';
