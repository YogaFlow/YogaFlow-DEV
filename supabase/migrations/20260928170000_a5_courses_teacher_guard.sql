-- A5 — Lehrer-Guard auf courses (RLS WITH CHECK + Trigger).
--
-- Zweck:
--   1) Policy courses_update_own_or_manager: Lehrende dürfen teacher_id nicht
--      auf jemand anderen umschreiben (WITH CHECK: Manager oder teacher_id =
--      get_my_member_id()). Vorher nur tenant_id → API-Lücke.
--   2) Policy staff_insert_courses: Lehrende dürfen beim INSERT nur sich selbst
--      als teacher_id setzen (Manager frei). Vorher nur tenant + is_staff().
--   3) Trigger: teacher_id muss auf ein Profil im selben Studio mit Rolle
--      teacher/admin/owner zeigen, nicht anonymisiert. Sonst INVALID_TEACHER.
--      Vorher nur FK auf users(id), kein Tenant-/Rollen-Check.
--
-- Inventur 28.09.2026 (nur Zahlen): invalid_teacher_courses DEV 0, PROD 0.
--
-- Rückweg (Kommentar, läuft nicht):
--
-- DROP TRIGGER IF EXISTS courses_teacher_guard ON public.courses;
-- DROP FUNCTION IF EXISTS yogaflow_private.courses_teacher_guard();
-- DROP POLICY IF EXISTS "courses_update_own_or_manager" ON public.courses;
-- CREATE POLICY "courses_update_own_or_manager"
--   ON public.courses FOR UPDATE
--   TO authenticated
--   USING (
--     (tenant_id = yogaflow_private.get_my_tenant_id())
--     AND ((teacher_id = (SELECT yogaflow_private.get_my_member_id()))
--          OR yogaflow_private.is_tenant_manager())
--   )
--   WITH CHECK (tenant_id = yogaflow_private.get_my_tenant_id());
-- DROP POLICY IF EXISTS "staff_insert_courses" ON public.courses;
-- CREATE POLICY "staff_insert_courses"
--   ON public.courses FOR INSERT
--   TO authenticated
--   WITH CHECK (
--     (tenant_id = yogaflow_private.get_my_tenant_id())
--     AND yogaflow_private.is_staff()
--   );

-- ---------------------------------------------------------------------------
-- 1. UPDATE-Policy: teacher_id darf von Lehrenden nicht fremd gesetzt werden
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "courses_update_own_or_manager" ON public.courses;
CREATE POLICY "courses_update_own_or_manager"
  ON public.courses FOR UPDATE
  TO authenticated
  USING (
    (tenant_id = yogaflow_private.get_my_tenant_id())
    AND (
      (teacher_id = (SELECT yogaflow_private.get_my_member_id()))
      OR yogaflow_private.is_tenant_manager()
    )
  )
  WITH CHECK (
    (tenant_id = yogaflow_private.get_my_tenant_id())
    AND (
      yogaflow_private.is_tenant_manager()
      OR (teacher_id = yogaflow_private.get_my_member_id())
    )
  );

-- ---------------------------------------------------------------------------
-- 2. INSERT-Policy: Lehrende nur mit sich selbst als Kursleitung
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "staff_insert_courses" ON public.courses;
CREATE POLICY "staff_insert_courses"
  ON public.courses FOR INSERT
  TO authenticated
  WITH CHECK (
    (tenant_id = yogaflow_private.get_my_tenant_id())
    AND yogaflow_private.is_staff()
    AND (
      yogaflow_private.is_tenant_manager()
      OR (teacher_id = yogaflow_private.get_my_member_id())
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Trigger: gültige Kursleitung (Studio + Rolle)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.courses_teacher_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ok boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = NEW.teacher_id
      AND u.tenant_id = NEW.tenant_id
      AND u.role IN ('teacher', 'admin', 'owner')
      AND u.anonymized_at IS NULL
  )
  INTO v_ok;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'INVALID_TEACHER'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS courses_teacher_guard ON public.courses;
CREATE TRIGGER courses_teacher_guard
  BEFORE INSERT OR UPDATE OF teacher_id
  ON public.courses
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.courses_teacher_guard();

REVOKE ALL ON FUNCTION yogaflow_private.courses_teacher_guard() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION yogaflow_private.courses_teacher_guard() IS
  'A5: teacher_id muss Profil im selben Studio mit Rolle teacher/admin/owner sein, nicht anonymisiert.';

-- ---------------------------------------------------------------------------
-- 4. Selbstprüfung
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_update_check text;
  v_insert_check text;
  v_invalid integer;
BEGIN
  SELECT pg_get_expr(pol.polwithcheck, pol.polrelid)
    INTO v_update_check
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'courses'
    AND pol.polname = 'courses_update_own_or_manager'
    AND pol.polcmd = 'w';

  IF v_update_check IS NULL
     OR v_update_check NOT ILIKE '%is_tenant_manager%'
     OR v_update_check NOT ILIKE '%get_my_member_id%'
  THEN
    RAISE EXCEPTION 'A5: courses_update_own_or_manager WITH CHECK fehlt Manager/self-Check';
  END IF;

  SELECT pg_get_expr(pol.polwithcheck, pol.polrelid)
    INTO v_insert_check
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'courses'
    AND pol.polname = 'staff_insert_courses'
    AND pol.polcmd = 'a';

  IF v_insert_check IS NULL
     OR v_insert_check NOT ILIKE '%is_staff%'
     OR v_insert_check NOT ILIKE '%is_tenant_manager%'
     OR v_insert_check NOT ILIKE '%get_my_member_id%'
  THEN
    RAISE EXCEPTION 'A5: staff_insert_courses WITH CHECK fehlt Manager/self-Check';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'courses'
      AND t.tgname = 'courses_teacher_guard'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'A5: Trigger courses_teacher_guard fehlt';
  END IF;

  IF has_function_privilege('anon', 'yogaflow_private.courses_teacher_guard()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'yogaflow_private.courses_teacher_guard()', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'A5: courses_teacher_guard hat Client-EXECUTE';
  END IF;

  SELECT count(*)::integer
    INTO v_invalid
  FROM public.courses c
  LEFT JOIN public.users u ON u.id = c.teacher_id
  WHERE u.id IS NULL
     OR u.tenant_id IS DISTINCT FROM c.tenant_id
     OR u.role NOT IN ('teacher', 'admin', 'owner')
     OR u.anonymized_at IS NOT NULL;

  IF v_invalid <> 0 THEN
    RAISE EXCEPTION 'A5: % Kurse verstoßen gegen den Lehrer-Guard', v_invalid;
  END IF;
END $$;
