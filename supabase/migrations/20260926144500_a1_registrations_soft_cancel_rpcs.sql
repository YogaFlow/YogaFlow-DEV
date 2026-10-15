-- A1 Schritt 2 — Soft-Cancel in RPCs, Nachrücken bei cancelled, Schreiben nur über RPCs.
--
-- Zweck: Abmelden setzt status = cancelled statt DELETE. Nachrücken auch bei Soft-Cancel.
-- Tabellenrechte für anon/authenticated auf Schreiboperationen entziehen; INSERT/UPDATE/
-- DELETE-Policies entfernen. SELECT-Policy unverändert (D5).
--
-- Bezug: Nachtrag A1, D1–D5; Schema aus 20260926141500 / 20260926141501.
--
-- Bewusst unverändert: delete_tenant_complete (DELETE bleibt), promote_waitlist_after_
-- registered_delete (CASCADE beim Profil-Löschen), register_for_course /
-- admin_register_user_for_course (nur Filter über cancellation_timestamp IS NULL).
--
-- Rückweg (vor PROD / vor weiteren A1-Schritten):
--   DROP TRIGGER IF EXISTS promote_waitlist_after_registered_cancel ON public.registrations;
--   -- Funktionen wiederherstellen aus:
--   --   unregister_from_course          ← 20260915003628_du_enrollment_rpc_messages.sql
--   --   admin_unregister_user_from_course ← 20260911173000_member_id_helpers_and_policies.sql
--   --   cleanup_future_registrations…  ← 20260907153100_teacher_enroll_waitlist_own_courses.sql
--   GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, SELECT
--     ON public.registrations TO anon, authenticated;
--   -- Policies wieder anlegen aus 20260911173000 (registrations_insert_own,
--   -- registrations_update_manager, registrations_delete).
--   -- EXECUTE-Grants: wie vor dieser Migration (Client-RPCs an authenticated).

-- ---------------------------------------------------------------------------
-- B1 — unregister_from_course (Soft-Cancel)
-- Vorfassung: 20260915003628
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.unregister_from_course(
  p_course_id uuid,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := yogaflow_private.get_my_member_id();
  v_registration_status public.registration_status;
  v_waitlist_user_id uuid;
  v_course_date date;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Bitte melde dich an.'
    );
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id <> v_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Nicht autorisiert.'
    );
  END IF;

  -- Gleiche Sperrreihenfolge wie register_for_course (Kurs vor Anmeldung).
  -- Fehlt der Kurs, liefert die folgende Select wie bisher „Keine aktive Anmeldung“.
  SELECT date INTO v_course_date
  FROM public.courses
  WHERE id = p_course_id
  FOR UPDATE;

  IF v_course_date IS NOT NULL AND v_course_date < CURRENT_DATE THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Von vergangenen Kursen kann man sich nicht mehr abmelden.'
    );
  END IF;

  SELECT status INTO v_registration_status
  FROM public.registrations
  WHERE course_id = p_course_id
    AND user_id = v_user_id
    AND status IN ('registered', 'waitlist')
    AND cancellation_timestamp IS NULL;

  IF v_registration_status IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Keine aktive Anmeldung für diesen Kurs gefunden.'
    );
  END IF;

  IF v_registration_status = 'registered' THEN
    SELECT user_id
    INTO v_waitlist_user_id
    FROM public.registrations
    WHERE course_id = p_course_id
      AND status = 'waitlist'
      AND cancellation_timestamp IS NULL
    ORDER BY waitlist_position ASC NULLS LAST, signup_timestamp ASC NULLS LAST, id ASC
    LIMIT 1;
  END IF;

  UPDATE public.registrations
  SET
    status = 'cancelled',
    cancellation_timestamp = now(),
    cancelled_by = v_user_id,
    cancel_reason = 'participant',
    waitlist_position = NULL
  WHERE course_id = p_course_id
    AND user_id = v_user_id
    AND status IN ('registered', 'waitlist')
    AND cancellation_timestamp IS NULL;

  PERFORM public.compact_waitlist_positions(p_course_id);

  IF v_waitlist_user_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'message',
      'Abgemeldet. Ein Wartelisten-Teilnehmer wurde nachgerückt.',
      'promoted_user_id', v_waitlist_user_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Erfolgreich abgemeldet.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.unregister_from_course(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_from_course(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- B1 — admin_unregister_user_from_course (Soft-Cancel)
-- Vorfassung: 20260911173000
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_unregister_user_from_course(
  p_user_id uuid,
  p_course_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor_id                 uuid;
  v_actor_role               text;
  v_actor_tenant             uuid;
  v_course_tenant            uuid;
  v_teacher_id               uuid;
  v_course_date              date;
  v_course_title             text;
  v_course_time              time;
  v_registration_status      public.registration_status;
  v_registration_is_waitlist boolean;
  v_was_registered           boolean;
  v_waitlist_user_id         uuid;
  v_notification_body        text;
BEGIN
  v_actor_id := yogaflow_private.get_my_member_id();
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT role, tenant_id INTO v_actor_role, v_actor_tenant
  FROM public.users WHERE id = v_actor_id;

  IF v_actor_role NOT IN ('owner', 'admin', 'teacher') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions');
  END IF;

  SELECT tenant_id, teacher_id, date, title, time
  INTO v_course_tenant, v_teacher_id, v_course_date, v_course_title, v_course_time
  FROM public.courses
  WHERE id = p_course_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Course not found');
  END IF;

  IF v_course_tenant IS DISTINCT FROM v_actor_tenant THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cross-tenant operation not allowed');
  END IF;

  IF v_actor_role = 'teacher' AND v_teacher_id IS DISTINCT FROM v_actor_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Teachers can only unregister participants from their own courses');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_user_id
      AND tenant_id = v_actor_tenant
      AND role IN ('user', 'teacher')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user not found or not a participant');
  END IF;

  IF v_course_date < CURRENT_DATE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot unregister from past courses');
  END IF;

  SELECT status, is_waitlist
  INTO v_registration_status, v_registration_is_waitlist
  FROM public.registrations
  WHERE course_id = p_course_id
    AND user_id = p_user_id
    AND status IN ('registered', 'waitlist')
    AND cancellation_timestamp IS NULL;

  IF v_registration_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_registered');
  END IF;

  IF v_actor_role = 'teacher'
     AND (v_registration_is_waitlist OR v_registration_status <> 'registered') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Teachers can only unregister active participants from their own courses'
    );
  END IF;

  v_was_registered := (v_registration_status = 'registered' AND NOT v_registration_is_waitlist);

  IF v_was_registered THEN
    SELECT user_id
    INTO v_waitlist_user_id
    FROM public.registrations
    WHERE course_id = p_course_id
      AND status = 'waitlist'
      AND is_waitlist = true
      AND cancellation_timestamp IS NULL
    ORDER BY waitlist_position ASC NULLS LAST, signup_timestamp ASC NULLS LAST, id ASC
    LIMIT 1;
  END IF;

  UPDATE public.registrations
  SET
    status = 'cancelled',
    cancellation_timestamp = now(),
    cancelled_by = v_actor_id,
    cancel_reason = 'studio',
    waitlist_position = NULL
  WHERE course_id = p_course_id
    AND user_id = p_user_id
    AND status IN ('registered', 'waitlist')
    AND cancellation_timestamp IS NULL;

  PERFORM public.compact_waitlist_positions(p_course_id);

  v_notification_body := format(
    'Du wurdest vom Kurs "%s" am %s um %s abgemeldet.',
    v_course_title,
    to_char(v_course_date, 'DD.MM.YYYY'),
    to_char(v_course_time, 'HH24:MI')
  );

  INSERT INTO public.user_notifications (
    tenant_id, user_id, type, body, course_id, action_path, metadata
  ) VALUES (
    v_actor_tenant,
    p_user_id,
    'course_removed',
    v_notification_body,
    p_course_id,
    '/my-courses',
    jsonb_build_object('removed_by_user_id', v_actor_id)
  );

  IF v_was_registered AND v_waitlist_user_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Teilnehmer abgemeldet. Ein Wartelisten-Teilnehmer wurde nachgerückt.',
      'promoted_user_id', v_waitlist_user_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Teilnehmer erfolgreich abgemeldet.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_unregister_user_from_course(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unregister_user_from_course(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- B1 — cleanup_future_registrations_on_role_upgrade (Soft-Cancel)
-- Vorfassung: 20260907153100 — ohne Datumsfilter, löschte auch Anmeldungen
-- vergangener Kurse. Mit Soft-Cancel würde das Teilnahmen verfälschen
-- (status=cancelled trotz stattgefundener Stunde). Deshalb nur Kurse, die
-- laut prevent_past_course_registration / check_registration_course_not_past
-- noch nicht „in der Vergangenheit“ sind: c.date >= CURRENT_DATE
-- (dort: IF v_course_date < CURRENT_DATE THEN ablehnen).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cleanup_future_registrations_on_role_upgrade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF OLD.role = 'user'
     AND NEW.role IN ('admin', 'owner')
     AND NEW.id IS NOT NULL
  THEN
    -- Kurse in fester Id-Reihenfolge sperren (gleiche Reihenfolge wie register).
    PERFORM 1
    FROM public.courses c
    WHERE c.id IN (
      SELECT r.course_id
      FROM public.registrations r
      JOIN public.courses c2 ON c2.id = r.course_id
      WHERE r.user_id = NEW.id
        AND c2.tenant_id = NEW.tenant_id
        AND r.cancellation_timestamp IS NULL
        AND r.status IN ('registered', 'waitlist')
        AND c2.date >= CURRENT_DATE
    )
    ORDER BY c.id
    FOR UPDATE;

    UPDATE public.registrations r
    SET
      status = 'cancelled',
      cancellation_timestamp = now(),
      cancelled_by = NULL,
      cancel_reason = 'role_change',
      waitlist_position = NULL
    FROM public.courses c
    WHERE r.course_id = c.id
      AND r.user_id = NEW.id
      AND c.tenant_id = NEW.tenant_id
      AND r.cancellation_timestamp IS NULL
      AND r.status IN ('registered', 'waitlist')
      AND c.date >= CURRENT_DATE;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_future_registrations_on_role_upgrade() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- B2 — Nachrücken beim Übergang registered → cancelled
-- Trigger-Funktion unverändert nutzbar (nur OLD.course_id, kein TG_OP).
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS promote_waitlist_after_registered_cancel ON public.registrations;
CREATE TRIGGER promote_waitlist_after_registered_cancel
  AFTER UPDATE OF status ON public.registrations
  FOR EACH ROW
  WHEN (
    OLD.status = 'registered'::registration_status
    AND NEW.status = 'cancelled'::registration_status
  )
  EXECUTE FUNCTION public.trg_promote_waitlist_after_registered_delete();

-- Wartelisten-Storno: compact_waitlist_after_leave deckt den Fall bereits ab
-- (WHEN: old.is_waitlist AND old.cancellation_timestamp IS NULL AND
--  new.cancellation_timestamp IS NOT NULL bzw. status <> waitlist).
-- compact_waitlist_positions filtert stornierte über status = 'waitlist' und
-- cancellation_timestamp IS NULL — keine Anpassung nötig.

-- ---------------------------------------------------------------------------
-- B3 — Schreiben nur noch über SECURITY DEFINER-RPCs
-- ---------------------------------------------------------------------------

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.registrations FROM anon, authenticated;

-- Kein anon-Lesepfad in src/ oder supabase/functions/ (Vorprüfung A/4).
REVOKE SELECT ON public.registrations FROM anon;

DROP POLICY IF EXISTS "registrations_insert_own" ON public.registrations;
DROP POLICY IF EXISTS "registrations_update_manager" ON public.registrations;
DROP POLICY IF EXISTS "registrations_delete" ON public.registrations;

-- registrations_select bleibt (D5).

-- Client-RPCs: EXECUTE nur authenticated (register/admin_register unverändert belassen,
-- nur REVOKE/GRANT absichern falls Defaults nach REPLACE).
REVOKE ALL ON FUNCTION public.register_for_course(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_for_course(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_register_user_for_course(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_register_user_for_course(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.promote_from_waitlist(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.compact_waitlist_positions(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_promote_waitlist_after_registered_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_compact_waitlist() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- B4 — Selbstprüfung
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_col text;
  v_n int;
  v_def text;
BEGIN
  IF has_table_privilege('anon', 'public.registrations', 'INSERT')
     OR has_table_privilege('anon', 'public.registrations', 'UPDATE')
     OR has_table_privilege('anon', 'public.registrations', 'DELETE')
     OR has_table_privilege('anon', 'public.registrations', 'TRUNCATE')
  THEN
    RAISE EXCEPTION 'A1 step2: anon hat noch Schreibrechte auf registrations';
  END IF;

  IF has_table_privilege('authenticated', 'public.registrations', 'INSERT')
     OR has_table_privilege('authenticated', 'public.registrations', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.registrations', 'DELETE')
     OR has_table_privilege('authenticated', 'public.registrations', 'TRUNCATE')
  THEN
    RAISE EXCEPTION 'A1 step2: authenticated hat noch Schreibrechte auf registrations';
  END IF;

  IF has_table_privilege('anon', 'public.registrations', 'SELECT') THEN
    RAISE EXCEPTION 'A1 step2: anon hat noch SELECT auf registrations';
  END IF;

  FOR v_col IN
    SELECT a.attname
    FROM pg_attribute a
    WHERE a.attrelid = 'public.registrations'::regclass
      AND a.attnum > 0
      AND NOT a.attisdropped
  LOOP
    IF has_column_privilege('authenticated', 'public.registrations', v_col, 'UPDATE') THEN
      RAISE EXCEPTION 'A1 step2: authenticated hat UPDATE auf Spalte %', v_col;
    END IF;
    IF has_column_privilege('anon', 'public.registrations', v_col, 'UPDATE') THEN
      RAISE EXCEPTION 'A1 step2: anon hat UPDATE auf Spalte %', v_col;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_n
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'registrations'
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'A1 step2: noch % INSERT/UPDATE/DELETE-Policies auf registrations', v_n;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'registrations'
      AND t.tgname = 'promote_waitlist_after_registered_delete'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'A1 step2: promote_waitlist_after_registered_delete fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'registrations'
      AND t.tgname = 'promote_waitlist_after_registered_cancel'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'A1 step2: promote_waitlist_after_registered_cancel fehlt';
  END IF;

  SELECT pg_get_triggerdef(t.oid) INTO v_def
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'registrations'
    AND t.tgname = 'promote_waitlist_after_registered_cancel';

  IF v_def IS NULL
     OR v_def NOT ILIKE '%AFTER UPDATE OF status%'
     OR v_def NOT ILIKE '%old.status = ''registered''%'
     OR v_def NOT ILIKE '%new.status = ''cancelled''%'
  THEN
    RAISE EXCEPTION 'A1 step2: promote_waitlist_after_registered_cancel WHEN falsch: %', v_def;
  END IF;

  SELECT count(*) INTO v_n
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'yogaflow_private')
    AND (
      p.prosrc ~* 'DELETE[[:space:]]+FROM[[:space:]]+(public\.)?registrations'
    )
    AND p.proname IS DISTINCT FROM 'delete_tenant_complete';
  IF v_n <> 0 THEN
    RAISE EXCEPTION
      'A1 step2: % Funktionen außer delete_tenant_complete enthalten DELETE FROM registrations',
      v_n;
  END IF;

  SELECT array_to_string(p.proconfig, ',') INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'cleanup_future_registrations_on_role_upgrade';

  IF v_def IS NULL OR v_def NOT ILIKE '%pg_temp%' THEN
    RAISE EXCEPTION 'A1 step2: cleanup_future_registrations_on_role_upgrade ohne pg_temp: %', v_def;
  END IF;

  SELECT p.prosrc INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'cleanup_future_registrations_on_role_upgrade';

  IF v_def IS NULL
     OR v_def NOT ILIKE '%date >= CURRENT_DATE%'
  THEN
    RAISE EXCEPTION
      'A1 step2: cleanup_future ohne Datumsfilter (date >= CURRENT_DATE): %',
      left(coalesce(v_def, ''), 200);
  END IF;

  SELECT p.prosrc INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'unregister_from_course';

  IF v_def IS NULL
     OR v_def NOT ILIKE '%Von vergangenen Kursen kann man sich nicht mehr abmelden%'
  THEN
    RAISE EXCEPTION 'A1 step2: unregister_from_course ohne Past-Kurs-Sperre';
  END IF;

  IF NOT has_function_privilege(
       'authenticated',
       'public.unregister_from_course(uuid,uuid)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.unregister_from_course(uuid,uuid)',
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION 'A1 step2: EXECUTE auf unregister_from_course falsch';
  END IF;

  IF NOT has_function_privilege(
       'authenticated',
       'public.admin_unregister_user_from_course(uuid,uuid)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.admin_unregister_user_from_course(uuid,uuid)',
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION 'A1 step2: EXECUTE auf admin_unregister_user_from_course falsch';
  END IF;

  IF NOT has_function_privilege(
       'authenticated',
       'public.register_for_course(uuid,uuid)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.register_for_course(uuid,uuid)',
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION 'A1 step2: EXECUTE auf register_for_course falsch';
  END IF;

  IF NOT has_function_privilege(
       'authenticated',
       'public.admin_register_user_for_course(uuid,uuid)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.admin_register_user_for_course(uuid,uuid)',
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION 'A1 step2: EXECUTE auf admin_register_user_for_course falsch';
  END IF;
END;
$$;
