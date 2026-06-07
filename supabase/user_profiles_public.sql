-- Perfiles públicos: RLS de lectura para perfiles ajenos (autenticados)
-- Seguro para re-ejecutar. No falla si faltan tablas.
--
-- Orden recomendado en Supabase:
--   1. este archivo (RLS perfiles públicos + pick_scores mínima)
--   2. supabase/profiles_persistence_policies.sql (UPDATE/INSERT perfil + activity_log)
--   3. supabase/ranking_leaderboard.sql (vista leaderboard ⨝ auth.users)
--   3. supabase/pulpo_scoring.sql (RPC scoring + backfill, si hace falta)
--   3. supabase/achievements.sql (user_badges, si hace falta)
--
-- Si pick_scores no existe pero sí profiles + matches, este script la crea.
-- Los puntos agregados también viven en profiles.points / exacts / streak.

-- public.matches.id debe ser TEXT. pick_scores.match_id es TEXT.

-- ── Crear pick_scores si falta (requiere profiles + matches) ────────────────
DO $create_pick_scores$
DECLARE
  matches_id_type text;
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE NOTICE 'pick_scores no creada: falta public.profiles.';
    RETURN;
  END IF;

  IF to_regclass('public.matches') IS NULL THEN
    RAISE NOTICE 'pick_scores no creada: falta public.matches.';
    RETURN;
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
      RAISE NOTICE 'pick_scores eliminada (match_id era uuid); recreando como text.';
    ELSE
      RAISE NOTICE 'pick_scores ya existe; omitiendo CREATE.';
      RETURN;
    END IF;
  END IF;

  SELECT c.udt_name
  INTO matches_id_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'matches'
    AND c.column_name = 'id';

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

  RAISE NOTICE 'pick_scores creada (match_id text, matches.id=%).', matches_id_type;
END;
$create_pick_scores$;

-- Columnas de ranking en profiles (idempotente; no depende de pick_scores)
DO $profiles_cols$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE NOTICE 'profiles no existe; omitiendo columnas points/exacts/streak.';
    RETURN;
  END IF;

  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS points integer NOT NULL DEFAULT 0;
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS exacts integer NOT NULL DEFAULT 0;
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS streak integer NOT NULL DEFAULT 0;
END;
$profiles_cols$;

-- ── activity_log: lectura entre miembros ────────────────────────────────────
DO $activity_log_policy$
BEGIN
  IF to_regclass('public.activity_log') IS NULL THEN
    RAISE NOTICE 'activity_log no existe; omitiendo políticas.';
    RETURN;
  END IF;

  ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "activity_log_select_authenticated" ON public.activity_log;
  CREATE POLICY "activity_log_select_authenticated"
    ON public.activity_log
    FOR SELECT
    TO authenticated
    USING (true);

  RAISE NOTICE 'Política activity_log_select_authenticated aplicada.';
END;
$activity_log_policy$;

-- ── pick_scores: historial público de picks ──────────────────────────────────
DO $pick_scores_policy$
BEGIN
  IF to_regclass('public.pick_scores') IS NULL THEN
    RAISE NOTICE 'pick_scores no existe; omitiendo políticas. Ejecuta pulpo_scoring.sql.';
    RETURN;
  END IF;

  ALTER TABLE public.pick_scores ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "pick_scores_select_authenticated" ON public.pick_scores;
  CREATE POLICY "pick_scores_select_authenticated"
    ON public.pick_scores
    FOR SELECT
    TO authenticated
    USING (true);

  RAISE NOTICE 'Política pick_scores_select_authenticated aplicada.';
END;
$pick_scores_policy$;

-- ── user_badges: badges desbloqueados ───────────────────────────────────────
DO $user_badges_policy$
BEGIN
  IF to_regclass('public.user_badges') IS NULL THEN
    RAISE NOTICE 'user_badges no existe; omitiendo políticas. Ejecuta achievements.sql.';
    RETURN;
  END IF;

  ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "user_badges_select_authenticated" ON public.user_badges;
  CREATE POLICY "user_badges_select_authenticated"
    ON public.user_badges
    FOR SELECT
    TO authenticated
    USING (true);

  RAISE NOTICE 'Política user_badges_select_authenticated aplicada.';
END;
$user_badges_policy$;

-- ── ranking_history: mejor posición en perfil público ───────────────────────
-- Nota: tras ejecutar ranking_leaderboard.sql, ranking_history_select filtra auth.users.
DO $ranking_history_policy$
BEGIN
  IF to_regclass('public.ranking_history') IS NULL THEN
    RAISE NOTICE 'ranking_history no existe; omitiendo políticas (opcional).';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ranking_history'
      AND policyname = 'ranking_history_select_authenticated'
  ) THEN
    RAISE NOTICE 'ranking_history_select_authenticated ya definida (ver ranking_leaderboard.sql).';
    RETURN;
  END IF;

  ALTER TABLE public.ranking_history ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "ranking_history_select_authenticated"
    ON public.ranking_history
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM auth.users u
        WHERE u.id = ranking_history.profile_id
      )
    );

  RAISE NOTICE 'Política ranking_history_select_authenticated aplicada.';
END;
$ranking_history_policy$;
