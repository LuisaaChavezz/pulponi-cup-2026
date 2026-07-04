-- Datos pre-calculados para PDF de resultados de un partido.
-- Ejecutar en Supabase → SQL Editor. Seguro para re-ejecutar.

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.get_match_pdf_data(p_match_id text)
RETURNS TABLE (
  username text,
  name text,
  home_pick integer,
  away_pick integer,
  penalty_winner_pick text,
  penalty_home_pick integer,
  penalty_away_pick integer,
  points_awarded integer,
  exact_hit boolean,
  winner_hit boolean,
  pts_partido integer,
  pts_penales integer,
  penalty_winner_hit boolean,
  penalty_score_hit boolean,
  total_acumulado numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
  target_match_id text;
  mid_official text;
BEGIN
  SELECT m.*
  INTO v_match
  FROM public.matches m
  WHERE m.id::text = trim(p_match_id)
     OR m.official_id = trim(p_match_id)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  target_match_id := v_match.id::text;
  mid_official := nullif(trim(coalesce(v_match.official_id, '')), '');

  RETURN QUERY
  WITH pick_rows AS (
    SELECT
      p.id AS profile_id,
      p.username,
      p.name,
      p.points,
      ps.points_awarded,
      ps.exact_hit,
      ps.winner_hit,
      COALESCE(
        NULLIF(trim(p.picks->target_match_id->>'home_pick'), ''),
        NULLIF(trim(p.picks->mid_official->>'home_pick'), '')
      ) AS home_pick_raw,
      COALESCE(
        NULLIF(trim(p.picks->target_match_id->>'away_pick'), ''),
        NULLIF(trim(p.picks->mid_official->>'away_pick'), '')
      ) AS away_pick_raw,
      COALESCE(
        NULLIF(trim(p.picks->target_match_id->>'penalty_winner'), ''),
        NULLIF(trim(p.picks->mid_official->>'penalty_winner'), ''),
        NULLIF(trim(p.picks->target_match_id->>'advances_team'), ''),
        NULLIF(trim(p.picks->mid_official->>'advances_team'), '')
      ) AS penalty_winner_raw,
      COALESCE(
        NULLIF(trim(p.picks->target_match_id->>'penalty_home'), ''),
        NULLIF(trim(p.picks->mid_official->>'penalty_home'), '')
      ) AS penalty_home_raw,
      COALESCE(
        NULLIF(trim(p.picks->target_match_id->>'penalty_away'), ''),
        NULLIF(trim(p.picks->mid_official->>'penalty_away'), '')
      ) AS penalty_away_raw
    FROM public.profiles p
    INNER JOIN public.pick_scores ps
      ON ps.profile_id = p.id
     AND (
       ps.match_id = target_match_id
       OR (mid_official IS NOT NULL AND ps.match_id = mid_official)
     )
    WHERE (coalesce(p.hidden, false) = false OR p.hidden IS NULL)
      AND lower(trim(replace(coalesce(p.username, ''), '@', ''))) <> 'el-kraken'
  )
  SELECT
    pr.username,
    pr.name,
    CASE WHEN pr.home_pick_raw ~ '^-?[0-9]+$' THEN pr.home_pick_raw::integer END AS home_pick,
    CASE WHEN pr.away_pick_raw ~ '^-?[0-9]+$' THEN pr.away_pick_raw::integer END AS away_pick,
    pr.penalty_winner_raw AS penalty_winner_pick,
    CASE WHEN pr.penalty_home_raw ~ '^[0-9]+$' THEN pr.penalty_home_raw::integer END AS penalty_home_pick,
    CASE WHEN pr.penalty_away_raw ~ '^[0-9]+$' THEN pr.penalty_away_raw::integer END AS penalty_away_pick,
    coalesce(pr.points_awarded, 0)::integer AS points_awarded,
    coalesce(pr.exact_hit, false) AS exact_hit,
    coalesce(pr.winner_hit, false) AS winner_hit,
    CASE
      WHEN coalesce(pr.exact_hit, false) THEN 3
      WHEN coalesce(pr.winner_hit, false) THEN 1
      ELSE 0
    END AS pts_partido,
    CASE
      WHEN coalesce(v_match.went_to_penalties, false) THEN (
        CASE
          WHEN pr.penalty_winner_raw IS NOT NULL
           AND v_match.penalty_winner IS NOT NULL
           AND lower(trim(unaccent(pr.penalty_winner_raw)))
               = lower(trim(unaccent(v_match.penalty_winner)))
          THEN 1 ELSE 0
        END
        +
        CASE
          WHEN pr.penalty_home_raw ~ '^[0-9]+$'
           AND pr.penalty_away_raw ~ '^[0-9]+$'
           AND v_match.penalty_home IS NOT NULL
           AND v_match.penalty_away IS NOT NULL
           AND pr.penalty_home_raw::integer = v_match.penalty_home
           AND pr.penalty_away_raw::integer = v_match.penalty_away
          THEN 1 ELSE 0
        END
      )
      ELSE 0
    END::integer AS pts_penales,
    (
      coalesce(v_match.went_to_penalties, false)
      AND pr.penalty_winner_raw IS NOT NULL
      AND v_match.penalty_winner IS NOT NULL
      AND lower(trim(unaccent(pr.penalty_winner_raw)))
          = lower(trim(unaccent(v_match.penalty_winner)))
    ) AS penalty_winner_hit,
    (
      coalesce(v_match.went_to_penalties, false)
      AND pr.penalty_home_raw ~ '^[0-9]+$'
      AND pr.penalty_away_raw ~ '^[0-9]+$'
      AND v_match.penalty_home IS NOT NULL
      AND v_match.penalty_away IS NOT NULL
      AND pr.penalty_home_raw::integer = v_match.penalty_home
      AND pr.penalty_away_raw::integer = v_match.penalty_away
    ) AS penalty_score_hit,
    coalesce(pr.points, 0)::numeric AS total_acumulado
  FROM pick_rows pr
  ORDER BY coalesce(pr.points_awarded, 0) DESC, coalesce(pr.points, 0) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_match_pdf_data(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_match_pdf_data(text) TO service_role;
