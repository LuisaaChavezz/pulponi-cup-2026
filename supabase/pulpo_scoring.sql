-- Índice Pulpo + puntuación real (ejecutar en Supabase SQL Editor)
-- Seguro para re-ejecutar. Requiere public.profiles y public.matches para RPC.
-- public.matches.id debe ser TEXT (no UUID). pick_scores.match_id es TEXT.
-- Ejecutar después de user_profiles_public.sql si pick_scores / RLS ya están listos.

-- ── Columnas de ranking / índice en perfiles ───────────────────────────────
DO $profiles_cols$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE NOTICE '[pulpo_scoring] profiles no existe; omitiendo columnas.';
    RETURN;
  END IF;

  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS points integer NOT NULL DEFAULT 0;
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS exacts integer NOT NULL DEFAULT 0;
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS streak integer NOT NULL DEFAULT 0;
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pulpo_index integer NOT NULL DEFAULT 0;
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pulpo_stats jsonb NOT NULL DEFAULT '{}'::jsonb;

  RAISE NOTICE '[pulpo_scoring] Columnas de profiles verificadas.';
END;
$profiles_cols$;

-- ── Puntos por partido y usuario (match_id TEXT → matches.id TEXT) ──────────
DO $pick_scores_table$
DECLARE
  matches_id_type text;
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE NOTICE '[pulpo_scoring] pick_scores no creada: falta public.profiles.';
    RETURN;
  END IF;

  IF to_regclass('public.matches') IS NULL THEN
    RAISE NOTICE '[pulpo_scoring] pick_scores no creada: falta public.matches.';
    RETURN;
  END IF;

  SELECT c.udt_name
  INTO matches_id_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'matches'
    AND c.column_name = 'id';

  IF matches_id_type IS DISTINCT FROM 'text' AND matches_id_type IS DISTINCT FROM 'varchar' THEN
    RAISE NOTICE '[pulpo_scoring] matches.id es % — este script espera TEXT. Adapta manualmente si es otro tipo.', matches_id_type;
  END IF;

  IF to_regclass('public.pick_scores') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'pick_scores'
        AND c.column_name = 'match_id'
        AND c.udt_name = 'uuid'
    ) THEN
      DROP TABLE public.pick_scores CASCADE;
      RAISE NOTICE '[pulpo_scoring] pick_scores eliminada (match_id era uuid); recreando como text.';
    ELSE
      RAISE NOTICE '[pulpo_scoring] pick_scores ya existe; omitiendo CREATE.';
      RETURN;
    END IF;
  END IF;

  CREATE TABLE public.pick_scores (
    profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    match_id text NOT NULL REFERENCES public.matches (id) ON DELETE CASCADE,
    points_awarded integer NOT NULL DEFAULT 0,
    exact_hit boolean NOT NULL DEFAULT false,
    winner_hit boolean NOT NULL DEFAULT false,
    scored_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (profile_id, match_id)
  );

  CREATE INDEX IF NOT EXISTS pick_scores_match_id_idx ON public.pick_scores (match_id);
  CREATE INDEX IF NOT EXISTS pick_scores_profile_id_idx ON public.pick_scores (profile_id);

  RAISE NOTICE '[pulpo_scoring] pick_scores creada (match_id text).';
END;
$pick_scores_table$;

-- ── RLS pick_scores ─────────────────────────────────────────────────────────
DO $pick_scores_policy$
BEGIN
  IF to_regclass('public.pick_scores') IS NULL THEN
    RAISE NOTICE '[pulpo_scoring] pick_scores no existe; omitiendo políticas.';
    RETURN;
  END IF;

  ALTER TABLE public.pick_scores ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "pick_scores_select_authenticated" ON public.pick_scores;
  CREATE POLICY "pick_scores_select_authenticated"
    ON public.pick_scores
    FOR SELECT
    TO authenticated
    USING (true);

  RAISE NOTICE '[pulpo_scoring] Política pick_scores_select_authenticated aplicada.';
END;
$pick_scores_policy$;

-- ── Funciones RPC (solo si existen profiles + matches + pick_scores) ────────
DO $pulpo_functions$
BEGIN
  IF to_regclass('public.profiles') IS NULL
     OR to_regclass('public.matches') IS NULL
     OR to_regclass('public.pick_scores') IS NULL THEN
    RAISE NOTICE '[pulpo_scoring] Omitiendo funciones RPC: faltan profiles, matches o pick_scores.';
    RETURN;
  END IF;

  -- Escritura solo vía funciones SECURITY DEFINER (no insert directo desde cliente)

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public._match_is_finished(m public.matches)
    RETURNS boolean
    LANGUAGE sql
    STABLE
    AS $body$
      SELECT (
        upper(trim(coalesce(m.api_status, ''))) IN ('FT', 'AET', 'PEN')
        OR lower(trim(coalesce(m.status, ''))) IN ('finished', 'ft', 'aet', 'pen', 'terminado', 'final')
      )
      AND m.home_score IS NOT NULL
      AND m.away_score IS NOT NULL;
    $body$;
  $fn$;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public._grade_pick(
      pick jsonb,
      home_score integer,
      away_score integer
    )
    RETURNS TABLE (
      points_awarded integer,
      exact_hit boolean,
      winner_hit boolean
    )
    LANGUAGE plpgsql
    IMMUTABLE
    AS $body$
    DECLARE
      hp integer;
      ap integer;
    BEGIN
      IF pick IS NULL OR jsonb_typeof(pick) <> 'object' THEN
        RETURN QUERY SELECT 0, false, false;
        RETURN;
      END IF;

      hp := nullif(trim(pick->>'home_pick'), '')::integer;
      ap := nullif(trim(pick->>'away_pick'), '')::integer;

      IF hp IS NULL OR ap IS NULL OR hp < 0 OR ap < 0 THEN
        RETURN QUERY SELECT 0, false, false;
        RETURN;
      END IF;

      IF hp = home_score AND ap = away_score THEN
        RETURN QUERY SELECT 3, true, true;
        RETURN;
      END IF;

      IF (hp > ap AND home_score > away_score)
         OR (ap > hp AND away_score > home_score)
         OR (hp = ap AND home_score = away_score) THEN
        RETURN QUERY SELECT 1, false, true;
        RETURN;
      END IF;

      RETURN QUERY SELECT 0, false, false;
    END;
    $body$;
  $fn$;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.recompute_profile_streaks()
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    DECLARE
      prof record;
      m record;
      ex_hit boolean;
      win_hit boolean;
      run_streak integer;
    BEGIN
      FOR prof IN SELECT id FROM public.profiles LOOP
        run_streak := 0;

        FOR m IN
          SELECT id::text AS id, kickoff
          FROM public.matches
          WHERE public._match_is_finished(matches.*)
          ORDER BY kickoff ASC NULLS LAST, id ASC
        LOOP
          SELECT ps.exact_hit, ps.winner_hit
          INTO ex_hit, win_hit
          FROM public.pick_scores ps
          WHERE ps.profile_id = prof.id AND ps.match_id = m.id;

          IF NOT FOUND THEN
            run_streak := 0;
            CONTINUE;
          END IF;

          IF ex_hit OR win_hit THEN
            run_streak := run_streak + 1;
          ELSE
            run_streak := 0;
          END IF;
        END LOOP;

        UPDATE public.profiles SET streak = run_streak WHERE id = prof.id;
      END LOOP;
    END;
    $body$;
  $fn$;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.score_all_finished_matches()
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    DECLARE
      m record;
      prof record;
      pick jsonb;
      g record;
      mid_text text;
      scored_matches integer := 0;
      scored_picks integer := 0;
    BEGIN
      FOR m IN
        SELECT *
        FROM public.matches
        WHERE public._match_is_finished(matches.*)
      LOOP
        scored_matches := scored_matches + 1;
        mid_text := m.id::text;

        FOR prof IN
          SELECT id, picks
          FROM public.profiles
          WHERE picks IS NOT NULL AND picks <> '{}'::jsonb
        LOOP
          pick := prof.picks -> mid_text;
          IF pick IS NULL THEN
            CONTINUE;
          END IF;

          SELECT * INTO g
          FROM public._grade_pick(pick, m.home_score::integer, m.away_score::integer);

          INSERT INTO public.pick_scores (
            profile_id, match_id, points_awarded, exact_hit, winner_hit, scored_at
          )
          VALUES (prof.id, mid_text, g.points_awarded, g.exact_hit, g.winner_hit, now())
          ON CONFLICT (profile_id, match_id) DO UPDATE SET
            points_awarded = excluded.points_awarded,
            exact_hit = excluded.exact_hit,
            winner_hit = excluded.winner_hit,
            scored_at = now();

          scored_picks := scored_picks + 1;
        END LOOP;
      END LOOP;

      UPDATE public.profiles p SET
        points = coalesce((
          SELECT sum(ps.points_awarded)::integer
          FROM public.pick_scores ps
          WHERE ps.profile_id = p.id
        ), 0),
        exacts = coalesce((
          SELECT count(*)::integer
          FROM public.pick_scores ps
          WHERE ps.profile_id = p.id AND ps.exact_hit
        ), 0)
      WHERE p.id IS NOT NULL;

      PERFORM public.recompute_profile_streaks();

      RETURN jsonb_build_object(
        'scored_matches', scored_matches,
        'scored_picks', scored_picks
      );
    END;
    $body$;
  $fn$;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.sync_pulpo_indexes(updates jsonb)
    RETURNS integer
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    DECLARE
      row jsonb;
      updated_count integer := 0;
      affected integer;
    BEGIN
      IF updates IS NULL OR jsonb_typeof(updates) <> 'array' THEN
        RETURN 0;
      END IF;

      FOR row IN SELECT * FROM jsonb_array_elements(updates) LOOP
        UPDATE public.profiles
        SET
          pulpo_index = greatest(0, least(100, coalesce((row->>'pulpo_index')::integer, 0))),
          pulpo_stats = coalesce(row->'pulpo_stats', '{}'::jsonb)
        WHERE id = (row->>'profile_id')::uuid;

        GET DIAGNOSTICS affected = row_count;
        IF affected > 0 THEN
          updated_count := updated_count + 1;
        END IF;
      END LOOP;

      RETURN updated_count;
    END;
    $body$;
  $fn$;

  GRANT EXECUTE ON FUNCTION public.score_all_finished_matches() TO authenticated;
  GRANT EXECUTE ON FUNCTION public.sync_pulpo_indexes(jsonb) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.recompute_profile_streaks() TO authenticated;

  RAISE NOTICE '[pulpo_scoring] Funciones RPC instaladas. Ejecuta: select public.score_all_finished_matches();';
END;
$pulpo_functions$;
