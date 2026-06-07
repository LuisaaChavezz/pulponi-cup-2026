-- Pulponi Cup — Persistencia: UPDATE/INSERT propio perfil + activity_log
-- Ejecutar en Supabase SQL Editor si guardar perfil/picks/actividad falla en silencio (RLS).
-- Seguro para re-ejecutar. NO borra datos.

-- ── profiles: actualizar e insertar el propio perfil ────────────────────────
DO $profiles_write$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE NOTICE 'profiles no existe; omitiendo políticas de escritura.';
    RETURN;
  END IF;

  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
  CREATE POLICY "profiles_update_own"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

  DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
  CREATE POLICY "profiles_insert_own"
    ON public.profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

  RAISE NOTICE 'Políticas profiles_update_own y profiles_insert_own aplicadas.';
END;
$profiles_write$;

-- ── activity_log: insertar actividad propia ─────────────────────────────────
DO $activity_log_insert$
BEGIN
  IF to_regclass('public.activity_log') IS NULL THEN
    RAISE NOTICE 'activity_log no existe; omitiendo política insert.';
    RETURN;
  END IF;

  ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "activity_log_insert_own" ON public.activity_log;
  CREATE POLICY "activity_log_insert_own"
    ON public.activity_log
    FOR INSERT
    TO authenticated
    WITH CHECK (profile_id = auth.uid());

  RAISE NOTICE 'Política activity_log_insert_own aplicada.';
END;
$activity_log_insert$;
