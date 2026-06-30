-- Trono Kraken (badge 'el-elegido'): garantizar SIEMPRE un único dueño.
--
-- Bug previo: el DELETE/INSERT del badge vivían dentro del IF "si cambió el
-- líder", por lo que cuando el líder NO cambiaba nunca se limpiaban duplicados
-- y se podía quedar con 2 dueños del trono al mismo tiempo.
--
-- Fix: siempre se eliminan TODOS los registros del badge y se reinserta uno
-- solo, fuera del IF de transferencia. El historial solo se registra cuando
-- realmente cambia el dueño.

CREATE OR REPLACE FUNCTION public.update_lider_badge()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_points NUMERIC;
  v_current_elegido uuid;
  v_new_elegido uuid;
  v_previous_username TEXT;
  v_new_username TEXT;
BEGIN
  SELECT MAX(points) INTO v_max_points
  FROM profiles
  WHERE username != 'el-kraken';

  -- Tomar solo UN registro actual (por si hay duplicados), el más antiguo.
  SELECT ub.profile_id INTO v_current_elegido
  FROM user_badges ub
  WHERE ub.badge_id = 'el-elegido'
  ORDER BY ub.earned_at ASC
  LIMIT 1;

  -- ¿El actual elegido sigue en el máximo? (campeón pegajoso ante empates)
  IF v_current_elegido IS NOT NULL THEN
    SELECT id INTO v_new_elegido
    FROM profiles
    WHERE id = v_current_elegido
      AND points = v_max_points
    LIMIT 1;
  END IF;

  -- Si el actual ya no está en el máximo, dar el trono al nuevo líder.
  IF v_new_elegido IS NULL THEN
    SELECT id INTO v_new_elegido
    FROM profiles
    WHERE points = v_max_points
      AND username != 'el-kraken'
    ORDER BY username ASC
    LIMIT 1;
  END IF;

  -- Registrar historial solo si realmente cambió el dueño.
  IF v_new_elegido IS DISTINCT FROM v_current_elegido THEN
    SELECT p.username INTO v_previous_username FROM profiles p WHERE p.id = v_current_elegido;
    SELECT p.username INTO v_new_username FROM profiles p WHERE p.id = v_new_elegido;

    INSERT INTO elegido_history (previous_username, new_username)
    VALUES (v_previous_username, v_new_username);
  END IF;

  -- SIEMPRE limpiar TODOS los registros del badge antes de asignar
  -- (garantiza un único dueño, incluso si ya había duplicados).
  DELETE FROM user_badges WHERE badge_id = 'el-elegido';

  -- Reinsertar exactamente uno (si hay un líder válido).
  IF v_new_elegido IS NOT NULL THEN
    INSERT INTO user_badges (id, profile_id, badge_id, earned_at)
    VALUES (gen_random_uuid(), v_new_elegido, 'el-elegido', NOW());
  END IF;
END;
$$;
