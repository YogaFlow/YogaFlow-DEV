-- Sicherheits-Hotfix — Kursleitung auf courses nur gültig setzbar (Trigger).
--
-- Zweck:
--   teacher_id darf beim Anlegen und beim Ändern nur auf ein Profil zeigen,
--   das der Aufrufer vergeben darf:
--     - owner/admin im Studio des Kurses: jedes Profil desselben Studios mit
--       Rolle owner/admin/teacher.
--     - teacher: nur das eigene Profil in diesem Studio.
--     - alle anderen Clients: nie.
--   Sonst INVALID_TEACHER (22023). Nicht-Client-Rollen (service_role,
--   postgres, SECURITY-DEFINER-Funktionen, Migrationen) sind ausgenommen.
--   UPDATE ohne Änderung an teacher_id ist frei — CreateCourse/EditCourse
--   schicken teacher_id bei jedem Speichern mit.
--
-- Befund (PROD, 28.09.2026, nur lesend):
--   courses_update_own_or_manager WITH CHECK prüft nur
--   tenant_id = get_my_tenant_id(); staff_insert_courses WITH CHECK nur
--   tenant_id und is_staff(). courses.teacher_id hat nur den FK auf
--   users(id). Eine Lehrerin kann damit den eigenen Kurs auf jedes Profil
--   umschreiben und Kurse für jedes Profil anlegen (andere Lehrende,
--   Teilnehmende, Profile anderer Studios); owner/admin ebenso auf
--   Teilnehmende und Profile anderer Studios. Kurse mit ungültiger
--   Kursleitung auf PROD: 0 von 48.
--
-- Verhältnis zu 20260928170000_a5_courses_teacher_guard (nur Julius/DEV):
--   Eigener Name, weil yogaflow_private.courses_teacher_guard() dort
--   users.anonymized_at liest, das es auf main/PROD nicht gibt. Auf DEV
--   laufen beide Trigger nebeneinander; eine Zeile besteht nur, wenn beide
--   sie durchlassen. Keiner verändert NEW.
--
-- SECURITY INVOKER wie courses_status_guard/payments_no_delete: current_user
-- muss der Aufrufer sein, sonst lässt sich Client und Server nicht trennen.
-- Die Profilzeilen werden unter RLS gelesen (users_select_own,
-- users_select_managers). Verdeckt RLS eine Zeile, schlägt die Prüfung fehl,
-- nie umgekehrt.
--
-- Rückweg (Kommentar, läuft nicht):
--
-- DROP TRIGGER IF EXISTS courses_teacher_guard_hotfix ON public.courses;
-- DROP FUNCTION IF EXISTS yogaflow_private.courses_teacher_guard_hotfix();

CREATE OR REPLACE FUNCTION yogaflow_private.courses_teacher_guard_hotfix()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_me         uuid;
  v_my_role    text;
  v_target_ok  boolean;
BEGIN
  IF current_user::text NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.teacher_id IS NOT DISTINCT FROM OLD.teacher_id
  THEN
    RETURN NEW;
  END IF;

  IF current_user::text = 'anon' OR NEW.teacher_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_TEACHER'
      USING ERRCODE = '22023';
  END IF;

  v_me := yogaflow_private.get_my_member_id();

  SELECT u.role
    INTO v_my_role
  FROM public.users u
  WHERE u.id = v_me
    AND u.tenant_id = NEW.tenant_id;

  IF v_my_role IN ('owner', 'admin') THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = NEW.teacher_id
        AND u.tenant_id = NEW.tenant_id
        AND u.role IN ('owner', 'admin', 'teacher')
    )
    INTO v_target_ok;
  ELSIF v_my_role = 'teacher' THEN
    v_target_ok := (NEW.teacher_id = v_me);
  ELSE
    v_target_ok := false;
  END IF;

  IF NOT coalesce(v_target_ok, false) THEN
    RAISE EXCEPTION 'INVALID_TEACHER'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.courses_teacher_guard_hotfix() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION yogaflow_private.courses_teacher_guard_hotfix() IS
  'Hotfix: teacher_id nur durch owner/admin auf Staff des Studios, durch teacher nur auf sich selbst. Nicht-Client-Rollen frei.';

DROP TRIGGER IF EXISTS courses_teacher_guard_hotfix ON public.courses;
CREATE TRIGGER courses_teacher_guard_hotfix
  BEFORE INSERT OR UPDATE OF teacher_id
  ON public.courses
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.courses_teacher_guard_hotfix();

-- ---------------------------------------------------------------------------
-- Selbstprüfung
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_config   text[];
  v_secdef   boolean;
  v_invalid  integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    WHERE t.tgrelid = 'public.courses'::regclass
      AND t.tgname = 'courses_teacher_guard_hotfix'
      AND t.tgfoid = 'yogaflow_private.courses_teacher_guard_hotfix()'::regprocedure
      AND t.tgenabled = 'O'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'Hotfix: Trigger courses_teacher_guard_hotfix fehlt oder ist nicht aktiv';
  END IF;

  IF has_function_privilege('anon', 'yogaflow_private.courses_teacher_guard_hotfix()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'yogaflow_private.courses_teacher_guard_hotfix()', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Hotfix: courses_teacher_guard_hotfix hat Client-EXECUTE';
  END IF;

  SELECT p.proconfig, p.prosecdef
    INTO v_config, v_secdef
  FROM pg_proc p
  WHERE p.oid = 'yogaflow_private.courses_teacher_guard_hotfix()'::regprocedure;

  IF v_config IS DISTINCT FROM ARRAY['search_path=""'] THEN
    RAISE EXCEPTION 'Hotfix: search_path ist %, erwartet leer', v_config;
  END IF;

  IF v_secdef THEN
    RAISE EXCEPTION 'Hotfix: courses_teacher_guard_hotfix darf nicht SECURITY DEFINER sein';
  END IF;

  SELECT count(*)::integer
    INTO v_invalid
  FROM public.courses c
  LEFT JOIN public.users u ON u.id = c.teacher_id
  WHERE u.id IS NULL
     OR u.tenant_id IS DISTINCT FROM c.tenant_id
     OR u.role NOT IN ('owner', 'admin', 'teacher');

  RAISE NOTICE 'Hotfix: Kurse mit ungültiger Kursleitung (Altbestand): %', v_invalid;
END $$;
