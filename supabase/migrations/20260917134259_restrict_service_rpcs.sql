-- Zweck (Release 2026-09, Befund B1 vom 17.09.2026):
-- Supabase vergibt für neue Funktionen in public per Default Privileges EXECUTE an
-- anon und authenticated. REVOKE ... FROM PUBLIC entzieht das nicht.
-- 20260911185000 hat lookup_login_by_email / lookup_studio_slug_for_login nur
-- PUBLIC und anon entzogen -> jedes Login konnte Konten studioübergreifend
-- nachschlagen. Zusätzlich schon auf PROD offen und gefahrlos zu schließen:
-- complete_email_verification (nur Edge verify-email mit Service-Role),
-- cleanup_future_registrations_on_role_upgrade (nur Trigger),
-- admin_(un)register_* und close_past_course_registrations (anon unnötig).
-- Belege: release-2026-09/audit/bericht.md (grep src/: 0 Client-Aufrufe für die
-- ersten drei; Trigger brauchen kein EXECUTE des Aufrufers).
--
-- Rückweg:
--   GRANT EXECUTE ON FUNCTION public.lookup_login_by_email(text) TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.lookup_studio_slug_for_login(uuid, text) TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.complete_email_verification(uuid, text) TO anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.cleanup_future_registrations_on_role_upgrade() TO anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.admin_register_user_for_course(uuid, uuid) TO anon;
--   GRANT EXECUTE ON FUNCTION public.admin_unregister_user_from_course(uuid, uuid) TO anon;
--   GRANT EXECUTE ON FUNCTION public.close_past_course_registrations() TO anon;

-- 1. Nur Edge Functions (service_role)
REVOKE ALL ON FUNCTION public.lookup_login_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_login_by_email(text) TO service_role;

REVOKE ALL ON FUNCTION public.lookup_studio_slug_for_login(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_studio_slug_for_login(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.complete_email_verification(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_email_verification(uuid, text) TO service_role;

-- 2. Nur Trigger
REVOKE ALL ON FUNCTION public.cleanup_future_registrations_on_role_upgrade() FROM PUBLIC, anon, authenticated;

-- 3. Client-RPCs: anon raus, authenticated ausdrücklich behalten
REVOKE ALL ON FUNCTION public.admin_register_user_for_course(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_register_user_for_course(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_unregister_user_from_course(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_unregister_user_from_course(uuid, uuid) TO authenticated, service_role;

-- close_past_course_registrations: bleibt für authenticated (registrationMaintenance.ts),
-- Entfernen der Funktion ist für Geldkette Story 0.2 geplant.
REVOKE ALL ON FUNCTION public.close_past_course_registrations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_past_course_registrations() TO authenticated, service_role;

-- 4. Selbstprüfung
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.lookup_login_by_email(text)',                      false, false, true),
      ('public.lookup_studio_slug_for_login(uuid, text)',         false, false, true),
      ('public.complete_email_verification(uuid, text)',          false, false, true),
      ('public.cleanup_future_registrations_on_role_upgrade()',   false, false, NULL::boolean),
      ('public.admin_register_user_for_course(uuid, uuid)',       false, true,  true),
      ('public.admin_unregister_user_from_course(uuid, uuid)',    false, true,  true),
      ('public.close_past_course_registrations()',                false, true,  true)
    ) AS t(fn, exp_anon, exp_auth, exp_service)
  LOOP
    IF has_function_privilege('anon', r.fn, 'EXECUTE') IS DISTINCT FROM r.exp_anon THEN
      RAISE EXCEPTION 'B1: % anon EXECUTE, erwartet %', r.fn, r.exp_anon;
    END IF;
    IF has_function_privilege('authenticated', r.fn, 'EXECUTE') IS DISTINCT FROM r.exp_auth THEN
      RAISE EXCEPTION 'B1: % authenticated EXECUTE, erwartet %', r.fn, r.exp_auth;
    END IF;
    IF r.exp_service IS NOT NULL
       AND has_function_privilege('service_role', r.fn, 'EXECUTE') IS DISTINCT FROM r.exp_service THEN
      RAISE EXCEPTION 'B1: % service_role EXECUTE, erwartet %', r.fn, r.exp_service;
    END IF;
  END LOOP;
END $$;
