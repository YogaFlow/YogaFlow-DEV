-- A9 — Kurs absagen und zurücknehmen (ohne E-Mail, ohne automatische Erstattung).
--
-- Bezug: Nachtrag N8 / Story A9, Epic 3.2 (Online-Erstattung bleibt dort),
-- Entscheidungen K1–K8 vom 27.09.2026.
--   K1 Owner/Admin alle Kurse, Lehrende nur is_course_teacher
--   K2 single oder series_from_here (Beginn ≥ dieser Termin, noch nicht begonnen)
--   K3 Rücknahme gleicher Umfang, solange nicht begonnen
--   K4 begonnen → ALREADY_STARTED
--   K5 Glocke, optionaler Grund ≤ 200 Zeichen, keine E-Mail
--   K6 Löschen ohne Anmeldungszeile unverändert
--   K7 keine Gegenzeile; paid bleibt paid
--   K8 Karteneinheit nur als Kommentar-Platzhalter für A6
--
-- register_for_course prüft den Kursstatus bereits und wird nicht ersetzt.
--
-- Rückweg (Funktionen danach aus den genannten Dateien neu anlegen):
--   DROP FUNCTION IF EXISTS public.uncancel_course(uuid, text);
--   DROP FUNCTION IF EXISTS public.cancel_course(uuid, text, text);
--   DROP TRIGGER IF EXISTS courses_status_guard ON public.courses;
--   DROP FUNCTION IF EXISTS yogaflow_private.courses_status_guard();
--   ALTER TABLE public.courses
--     DROP CONSTRAINT IF EXISTS courses_canceled_by_fkey,
--     DROP CONSTRAINT IF EXISTS courses_cancel_note_length,
--     DROP CONSTRAINT IF EXISTS courses_canceled_at_consistent,
--     DROP CONSTRAINT IF EXISTS courses_status_valid,
--     DROP COLUMN IF EXISTS cancel_note,
--     DROP COLUMN IF EXISTS canceled_by,
--     DROP COLUMN IF EXISTS canceled_at,
--     ALTER COLUMN status DROP NOT NULL;
--   promote_from_waitlist: Körper aus 20260922154530.
--   admin_register_user_for_course: Körper aus 20260921233700.

-- ---------------------------------------------------------------------------
-- 1. status absichern, Absage-Spalten
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(
           format('%s (%s)', COALESCE(status, '<NULL>'), n),
           ', ' ORDER BY COALESCE(status, '<NULL>')
         )
    INTO v_bad
  FROM (
    SELECT status, count(*) AS n
    FROM public.courses
    WHERE status IS NULL
       OR status NOT IN ('active', 'canceled', 'not_planned')
    GROUP BY status
  ) s;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'A9: courses.status enthält ungültige Werte: %', v_bad;
  END IF;
END;
$$;

ALTER TABLE public.courses
  ADD COLUMN canceled_at timestamptz,
  ADD COLUMN canceled_by uuid,
  ADD COLUMN cancel_note text;

ALTER TABLE public.courses
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.courses
  ADD CONSTRAINT courses_status_valid
    CHECK (status IN ('active', 'canceled', 'not_planned'));

ALTER TABLE public.courses
  ADD CONSTRAINT courses_canceled_at_consistent
    CHECK ((status = 'canceled') = (canceled_at IS NOT NULL));

ALTER TABLE public.courses
  ADD CONSTRAINT courses_cancel_note_length
    CHECK (cancel_note IS NULL OR char_length(cancel_note) <= 200);

ALTER TABLE public.courses
  ADD CONSTRAINT courses_canceled_by_fkey
    FOREIGN KEY (canceled_by) REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.courses.canceled_at IS
  'Gesetzt genau dann, wenn status = canceled. Gleicher Zeitstempel steht auf den durch diese Absage stornierten Buchungen.';
COMMENT ON COLUMN public.courses.canceled_by IS
  'Profil, das abgesagt hat. Zweiter FK courses → users neben teacher_id. Embeds brauchen courses_teacher_id_fkey.';
COMMENT ON COLUMN public.courses.cancel_note IS
  'Optionaler Grund, höchstens 200 Zeichen, erscheint in der Glocke.';

-- ---------------------------------------------------------------------------
-- 2. Guard: Status-Spalten nur aus den RPCs
-- INSERT ohne Schalter nur status = active und leere Absagefelder.
-- not_planned legt kein Weg in src/ oder den Seeds an (CreateCourse setzt
-- status nicht, Default ist active; seed-dev und seed-showcase schreiben active).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.courses_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.canceled_at IS NOT DISTINCT FROM OLD.canceled_at
     AND NEW.canceled_by IS NOT DISTINCT FROM OLD.canceled_by
     AND NEW.cancel_note IS NOT DISTINCT FROM OLD.cancel_note
  THEN
    RETURN NEW;
  END IF;

  IF pg_catalog.current_setting('yogaflow.allow_course_status', true) = 'on'
     AND current_user::text NOT IN ('anon', 'authenticated')
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT'
     AND NEW.status = 'active'
     AND NEW.canceled_at IS NULL
     AND NEW.canceled_by IS NULL
     AND NEW.cancel_note IS NULL
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'courses: Status nur über cancel_course/uncancel_course'
    USING ERRCODE = '42501';
END;
$function$;

CREATE TRIGGER courses_status_guard
  BEFORE INSERT OR UPDATE OF status, canceled_at, canceled_by, cancel_note
  ON public.courses
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.courses_status_guard();

REVOKE ALL ON FUNCTION yogaflow_private.courses_status_guard() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. promote_from_waitlist: abgesagter Kurs rückt niemanden nach
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.promote_from_waitlist(p_course_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_max_participants integer;
  v_current_count integer;
  v_next_user record;
  v_course_title text;
  v_course_date date;
  v_course_time time;
  v_tenant_id uuid;
  v_status text;
  v_notification_body text;
BEGIN
  SELECT max_participants, title, date, time, tenant_id, status
  INTO v_max_participants, v_course_title, v_course_date, v_course_time, v_tenant_id, v_status
  FROM public.courses
  WHERE id = p_course_id
  FOR UPDATE;

  IF NOT FOUND OR v_status IS DISTINCT FROM 'active' THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_current_count
  FROM public.registrations
  WHERE course_id = p_course_id
    AND status = 'registered'
    AND is_waitlist = false
    AND cancellation_timestamp IS NULL;

  WHILE v_current_count < v_max_participants LOOP
    SELECT id, user_id, waitlist_position INTO v_next_user
    FROM public.registrations
    WHERE course_id = p_course_id
      AND is_waitlist = true
      AND status = 'waitlist'
      AND cancellation_timestamp IS NULL
    ORDER BY waitlist_position ASC
    LIMIT 1;

    EXIT WHEN v_next_user.id IS NULL;

    UPDATE public.registrations
    SET status = 'registered',
        is_waitlist = false,
        waitlist_position = NULL,
        registered_at = pg_catalog.now()
    WHERE id = v_next_user.id;

    v_notification_body := pg_catalog.format(
      'Du hast einen Platz im Kurs „%s“ am %s um %s bekommen.',
      v_course_title,
      pg_catalog.to_char(v_course_date, 'DD.MM.YYYY'),
      pg_catalog.to_char(v_course_time, 'HH24:MI')
    );

    INSERT INTO public.user_notifications (
      tenant_id,
      user_id,
      type,
      body,
      course_id,
      action_path,
      metadata
    ) VALUES (
      v_tenant_id,
      v_next_user.user_id,
      'waitlist_promoted',
      v_notification_body,
      p_course_id,
      '/my-courses',
      pg_catalog.jsonb_build_object('promoted_from_waitlist', true)
    );

    v_current_count := v_current_count + 1;
  END LOOP;

  PERFORM public.compact_waitlist_positions(p_course_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.promote_from_waitlist(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. admin_register_user_for_course: kein Eintrag in einen inaktiven Kurs
--    Körper wie 20260921233700, plus COURSE_NOT_AVAILABLE.
--    register_for_course bleibt unverändert.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_register_user_for_course(p_user_id uuid, p_course_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor_id           uuid;
  v_actor_role         text;
  v_actor_tenant       uuid;
  v_course_tenant      uuid;
  v_teacher_id         uuid;
  v_max_participants   integer;
  v_course_date        date;
  v_course_title       text;
  v_course_time        time;
  v_course_status      text;
  v_current_count      integer;
  v_next_position      integer;
  v_notification_body  text;
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

  SELECT tenant_id, teacher_id, max_participants, date, title, time, status
  INTO v_course_tenant, v_teacher_id, v_max_participants, v_course_date, v_course_title, v_course_time, v_course_status
  FROM public.courses WHERE id = p_course_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Course not found');
  END IF;

  IF v_course_tenant IS DISTINCT FROM v_actor_tenant THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cross-tenant operation not allowed');
  END IF;

  IF v_course_status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'COURSE_NOT_AVAILABLE');
  END IF;

  IF v_actor_role = 'teacher' AND v_teacher_id IS DISTINCT FROM v_actor_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Teachers can only add participants to their own courses');
  END IF;

  IF p_user_id IS NOT DISTINCT FROM v_teacher_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Course teachers cannot be added as participants to their own course');
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
    RETURN jsonb_build_object('success', false, 'error', 'Cannot register for past courses');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.registrations
    WHERE course_id = p_course_id
      AND user_id = p_user_id
      AND cancellation_timestamp IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_registered');
  END IF;

  SELECT COUNT(*) INTO v_current_count
  FROM public.registrations
  WHERE course_id = p_course_id
    AND status = 'registered'
    AND is_waitlist = false
    AND cancellation_timestamp IS NULL;

  IF v_current_count >= v_max_participants THEN
    SELECT COUNT(*)::integer + 1 INTO v_next_position
    FROM public.registrations
    WHERE course_id = p_course_id
      AND is_waitlist = true
      AND status = 'waitlist'
      AND cancellation_timestamp IS NULL;

    INSERT INTO public.registrations (user_id, course_id, tenant_id, status, is_waitlist, waitlist_position)
    VALUES (p_user_id, p_course_id, v_actor_tenant, 'waitlist', true, v_next_position);

    v_notification_body := format(
      'Du wurdest für den Kurs "%s" auf die Warteliste gesetzt (Platz %s).',
      v_course_title,
      v_next_position
    );

    INSERT INTO public.user_notifications (
      tenant_id, user_id, type, body, course_id, action_path, metadata
    ) VALUES (
      v_actor_tenant,
      p_user_id,
      'course_waitlisted',
      v_notification_body,
      p_course_id,
      '/my-courses',
      jsonb_build_object('added_by_user_id', v_actor_id, 'waitlist_position', v_next_position)
    );

    RETURN jsonb_build_object(
      'success', true,
      'on_waitlist', true,
      'waitlist_position', v_next_position
    );
  ELSE
    INSERT INTO public.registrations (user_id, course_id, tenant_id, status, is_waitlist)
    VALUES (p_user_id, p_course_id, v_actor_tenant, 'registered', false);

    v_notification_body := format(
      'Du wurdest zum Kurs "%s" am %s um %s hinzugefügt.',
      v_course_title,
      to_char(v_course_date, 'DD.MM.YYYY'),
      to_char(v_course_time, 'HH24:MI')
    );

    INSERT INTO public.user_notifications (
      tenant_id, user_id, type, body, course_id, action_path, metadata
    ) VALUES (
      v_actor_tenant,
      p_user_id,
      'course_added',
      v_notification_body,
      p_course_id,
      '/my-courses',
      jsonb_build_object('added_by_user_id', v_actor_id)
    );

    RETURN jsonb_build_object('success', true, 'on_waitlist', false);
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_register_user_for_course(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_register_user_for_course(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. cancel_course / uncancel_course
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_course(
  p_course_id uuid,
  p_scope text DEFAULT 'single',
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid;
  v_tenant uuid;
  v_manager boolean;
  v_note text;
  v_anchor public.courses%ROWTYPE;
  v_course public.courses%ROWTYPE;
  v_ids uuid[];
  v_at timestamptz;
  v_cancelled integer;
  v_paid integer;
  v_body text;
  v_owner_body text;
  v_paid_sentence text;
  v_causation uuid := pg_catalog.gen_random_uuid();
  v_event_id uuid;
  v_canceled_ids uuid[] := '{}';
  v_cancelled_total integer := 0;
  v_paid_total integer := 0;
BEGIN
  v_actor := yogaflow_private.get_my_member_id();
  v_tenant := yogaflow_private.get_my_tenant_id();
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF p_scope IS NULL OR p_scope NOT IN ('single', 'series_from_here') THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_SCOPE');
  END IF;

  v_note := NULLIF(pg_catalog.btrim(p_note), '');
  IF v_note IS NOT NULL AND pg_catalog.char_length(v_note) > 200 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOTE_TOO_LONG');
  END IF;

  SELECT *
    INTO v_anchor
  FROM public.courses
  WHERE id = p_course_id;

  IF NOT FOUND OR v_anchor.tenant_id IS DISTINCT FROM v_tenant THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  v_manager := yogaflow_private.is_tenant_manager();
  IF NOT v_manager AND NOT yogaflow_private.is_course_teacher(p_course_id) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF (v_anchor.date + COALESCE(v_anchor.time, TIME '00:00:00'))
       AT TIME ZONE 'Europe/Berlin' <= pg_catalog.now()
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ALREADY_STARTED');
  END IF;

  IF v_anchor.status = 'canceled' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ALREADY_CANCELED');
  END IF;

  IF v_anchor.status IS DISTINCT FROM 'active' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'COURSE_NOT_AVAILABLE');
  END IF;

  SELECT pg_catalog.array_agg(c.id ORDER BY c.id)
    INTO v_ids
  FROM public.courses c
  WHERE c.tenant_id = v_tenant
    AND c.status = 'active'
    AND (c.date + COALESCE(c.time, TIME '00:00:00'))
        >= (v_anchor.date + COALESCE(v_anchor.time, TIME '00:00:00'))
    AND (c.date + COALESCE(c.time, TIME '00:00:00'))
          AT TIME ZONE 'Europe/Berlin' > pg_catalog.now()
    AND (
      (p_scope = 'single' AND c.id = p_course_id)
      OR (
        p_scope = 'series_from_here'
        AND (
          (v_anchor.series_id IS NULL AND c.id = p_course_id)
          OR (v_anchor.series_id IS NOT NULL AND c.series_id = v_anchor.series_id)
        )
      )
    )
    AND (v_manager OR c.teacher_id = v_actor);

  IF v_ids IS NULL OR pg_catalog.array_length(v_ids, 1) IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  PERFORM 1
  FROM public.courses
  WHERE id = ANY (v_ids)
  ORDER BY id
  FOR UPDATE;

  PERFORM pg_catalog.set_config('yogaflow.allow_course_status', 'on', true);

  FOR v_course IN
    SELECT *
    FROM public.courses
    WHERE id = ANY (v_ids)
    ORDER BY id
  LOOP
    IF v_course.status IS DISTINCT FROM 'active' THEN
      CONTINUE;
    END IF;

    v_at := pg_catalog.clock_timestamp();

    SELECT count(*)::integer,
           count(*) FILTER (WHERE coverage_status = 'paid')::integer
      INTO v_cancelled, v_paid
    FROM public.registrations
    WHERE course_id = v_course.id
      AND status IN ('registered', 'waitlist')
      AND cancellation_timestamp IS NULL;

    UPDATE public.courses
    SET status = 'canceled',
        canceled_at = v_at,
        canceled_by = v_actor,
        cancel_note = v_note
    WHERE id = v_course.id;

    UPDATE public.registrations
    SET status = 'cancelled',
        cancellation_timestamp = v_at,
        cancelled_by = v_actor,
        cancel_reason = 'course_cancelled',
        waitlist_position = NULL
    WHERE course_id = v_course.id
      AND status = 'waitlist'
      AND cancellation_timestamp IS NULL;

    UPDATE public.registrations
    SET status = 'cancelled',
        cancellation_timestamp = v_at,
        cancelled_by = v_actor,
        cancel_reason = 'course_cancelled',
        waitlist_position = NULL
    WHERE course_id = v_course.id
      AND status = 'registered'
      AND cancellation_timestamp IS NULL;

    -- A6: hier Karteneinlösungen dieses Kurses zurückbuchen (pass_movements redeem_reversal).

    v_body := pg_catalog.format(
      'Der Kurs „%s“ am %s um %s fällt aus.',
      v_course.title,
      pg_catalog.to_char(v_course.date, 'DD.MM.YYYY'),
      pg_catalog.to_char(v_course.time, 'HH24:MI')
    );
    IF v_note IS NOT NULL THEN
      v_body := v_body || ' Grund: ' || v_note || '.';
    END IF;

    INSERT INTO public.user_notifications (
      tenant_id, user_id, type, body, course_id, action_path, metadata
    )
    SELECT v_course.tenant_id,
           r.user_id,
           'course_canceled',
           v_body,
           v_course.id,
           '/my-courses',
           pg_catalog.jsonb_build_object('scope', p_scope)
    FROM public.registrations r
    WHERE r.course_id = v_course.id
      AND r.cancel_reason = 'course_cancelled'
      AND r.cancellation_timestamp = v_at;

    IF NOT v_manager AND v_paid > 0 THEN
      v_paid_sentence := CASE
        WHEN v_paid = 1 THEN '1 Person hatte bereits bezahlt'
        ELSE v_paid::text || ' Personen hatten bereits bezahlt'
      END;
      v_owner_body := pg_catalog.format(
        '%s am %s abgesagt. %s.',
        v_course.title,
        pg_catalog.to_char(v_course.date, 'DD.MM.YYYY'),
        v_paid_sentence
      );

      INSERT INTO public.user_notifications (
        tenant_id, user_id, type, body, course_id, action_path, metadata
      )
      SELECT v_tenant,
             u.id,
             'course_canceled',
             v_owner_body,
             v_course.id,
             '/course/' || v_course.id::text || '/kassieren',
             pg_catalog.jsonb_build_object('paid_count', v_paid, 'for_managers', true)
      FROM public.users u
      WHERE u.tenant_id = v_tenant
        AND u.role IN ('owner', 'admin');
    END IF;

    v_event_id := yogaflow_private.insert_event(
      v_course.tenant_id,
      'course.canceled',
      'course',
      v_course.id,
      pg_catalog.jsonb_build_object(
        'course_id', v_course.id,
        'scope', p_scope,
        'cancelled_registrations', v_cancelled,
        'paid_registrations', v_paid
      ),
      v_causation
    );

    PERFORM yogaflow_private.insert_audit(
      v_course.tenant_id,
      v_actor,
      'course.canceled',
      'courses',
      v_course.id,
      ARRAY['status', 'canceled_at', 'canceled_by', 'cancel_note']::text[],
      v_event_id
    );

    v_canceled_ids := v_canceled_ids || v_course.id;
    v_cancelled_total := v_cancelled_total + v_cancelled;
    v_paid_total := v_paid_total + v_paid;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'canceled_course_ids', to_jsonb(v_canceled_ids),
    'cancelled_registrations', v_cancelled_total,
    'paid_registrations', v_paid_total
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.uncancel_course(
  p_course_id uuid,
  p_scope text DEFAULT 'single'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid;
  v_tenant uuid;
  v_manager boolean;
  v_anchor public.courses%ROWTYPE;
  v_course public.courses%ROWTYPE;
  v_ids uuid[];
  v_reg record;
  v_active integer;
  v_slots integer;
  v_kept integer;
  v_body text;
  v_causation uuid := pg_catalog.gen_random_uuid();
  v_event_id uuid;
  v_current uuid;
  v_conflict uuid;
  v_restored integer := 0;
  v_this integer := 0;
  v_uncanceled_ids uuid[] := '{}';
  v_overflow uuid[] := '{}';
BEGIN
  v_actor := yogaflow_private.get_my_member_id();
  v_tenant := yogaflow_private.get_my_tenant_id();
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF p_scope IS NULL OR p_scope NOT IN ('single', 'series_from_here') THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_SCOPE');
  END IF;

  SELECT *
    INTO v_anchor
  FROM public.courses
  WHERE id = p_course_id;

  IF NOT FOUND OR v_anchor.tenant_id IS DISTINCT FROM v_tenant THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  v_manager := yogaflow_private.is_tenant_manager();
  IF NOT v_manager AND NOT yogaflow_private.is_course_teacher(p_course_id) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF (v_anchor.date + COALESCE(v_anchor.time, TIME '00:00:00'))
       AT TIME ZONE 'Europe/Berlin' <= pg_catalog.now()
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ALREADY_STARTED');
  END IF;

  IF v_anchor.status IS DISTINCT FROM 'canceled' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_CANCELED');
  END IF;

  SELECT pg_catalog.array_agg(c.id ORDER BY c.id)
    INTO v_ids
  FROM public.courses c
  WHERE c.tenant_id = v_tenant
    AND c.status = 'canceled'
    AND (c.date + COALESCE(c.time, TIME '00:00:00'))
        >= (v_anchor.date + COALESCE(v_anchor.time, TIME '00:00:00'))
    AND (c.date + COALESCE(c.time, TIME '00:00:00'))
          AT TIME ZONE 'Europe/Berlin' > pg_catalog.now()
    AND (
      (p_scope = 'single' AND c.id = p_course_id)
      OR (
        p_scope = 'series_from_here'
        AND (
          (v_anchor.series_id IS NULL AND c.id = p_course_id)
          OR (v_anchor.series_id IS NOT NULL AND c.series_id = v_anchor.series_id)
        )
      )
    )
    AND (v_manager OR c.teacher_id = v_actor);

  IF v_ids IS NULL OR pg_catalog.array_length(v_ids, 1) IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  PERFORM 1
  FROM public.courses
  WHERE id = ANY (v_ids)
  ORDER BY id
  FOR UPDATE;

  PERFORM pg_catalog.set_config('yogaflow.allow_course_status', 'on', true);

  BEGIN
    FOR v_course IN
      SELECT *
      FROM public.courses
      WHERE id = ANY (v_ids)
        AND status = 'canceled'
      ORDER BY id
    LOOP
      v_current := v_course.id;

      SELECT count(*)::integer
        INTO v_active
      FROM public.registrations
      WHERE course_id = v_course.id
        AND status = 'registered'
        AND cancellation_timestamp IS NULL;

      v_slots := GREATEST(v_course.max_participants - v_active, 0);
      v_kept := 0;
      v_this := 0;

      UPDATE public.courses
      SET status = 'active',
          canceled_at = NULL,
          canceled_by = NULL,
          cancel_note = NULL
      WHERE id = v_course.id;

      FOR v_reg IN
        SELECT id, user_id, is_waitlist
        FROM public.registrations
        WHERE course_id = v_course.id
          AND status = 'cancelled'
          AND cancel_reason = 'course_cancelled'
          AND cancellation_timestamp = v_course.canceled_at
        ORDER BY signup_timestamp ASC NULLS LAST, id ASC
        FOR UPDATE
      LOOP
        IF v_reg.is_waitlist OR v_kept >= v_slots THEN
          UPDATE public.registrations
          SET status = 'waitlist',
              is_waitlist = true,
              cancellation_timestamp = NULL,
              cancelled_by = NULL,
              cancel_reason = NULL,
              waitlist_position = NULL
          WHERE id = v_reg.id;

          IF NOT v_reg.is_waitlist THEN
            v_overflow := v_overflow || v_reg.user_id;
          END IF;

          v_body := pg_catalog.format(
            'Der Kurs „%s“ am %s um %s findet doch statt. Du bist wieder auf der Warteliste.',
            v_course.title,
            pg_catalog.to_char(v_course.date, 'DD.MM.YYYY'),
            pg_catalog.to_char(v_course.time, 'HH24:MI')
          );
        ELSE
          UPDATE public.registrations
          SET status = 'registered',
              is_waitlist = false,
              cancellation_timestamp = NULL,
              cancelled_by = NULL,
              cancel_reason = NULL,
              waitlist_position = NULL
          WHERE id = v_reg.id;

          v_kept := v_kept + 1;

          v_body := pg_catalog.format(
            'Der Kurs „%s“ am %s um %s findet doch statt. Du bist wieder angemeldet.',
            v_course.title,
            pg_catalog.to_char(v_course.date, 'DD.MM.YYYY'),
            pg_catalog.to_char(v_course.time, 'HH24:MI')
          );
        END IF;

        INSERT INTO public.user_notifications (
          tenant_id, user_id, type, body, course_id, action_path, metadata
        ) VALUES (
          v_course.tenant_id,
          v_reg.user_id,
          'course_uncanceled',
          v_body,
          v_course.id,
          '/my-courses',
          pg_catalog.jsonb_build_object('scope', p_scope)
        );

        v_restored := v_restored + 1;
        v_this := v_this + 1;
      END LOOP;

      PERFORM public.compact_waitlist_positions(v_course.id);

      v_event_id := yogaflow_private.insert_event(
        v_course.tenant_id,
        'course.uncanceled',
        'course',
        v_course.id,
        pg_catalog.jsonb_build_object(
          'course_id', v_course.id,
          'scope', p_scope,
          'restored_registrations', v_this
        ),
        v_causation
      );

      PERFORM yogaflow_private.insert_audit(
        v_course.tenant_id,
        v_actor,
        'course.uncanceled',
        'courses',
        v_course.id,
        ARRAY['status', 'canceled_at', 'canceled_by', 'cancel_note']::text[],
        v_event_id
      );

      v_uncanceled_ids := v_uncanceled_ids || v_course.id;
    END LOOP;
  EXCEPTION
    WHEN unique_violation THEN
      v_conflict := v_current;
  END;

  IF v_conflict IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error', 'CONFLICT',
      'course_id', v_conflict
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'uncanceled_course_ids', to_jsonb(v_uncanceled_ids),
    'restored_registrations', v_restored,
    'overflow_to_waitlist', to_jsonb(v_overflow)
  );
END;
$function$;

COMMENT ON FUNCTION public.cancel_course(uuid, text, text) IS
  'Sagt einen Kurs oder die Serie ab diesem Termin ab. Warteliste zuerst, dann Angemeldete. Keine Erstattung, keine E-Mail.';
COMMENT ON FUNCTION public.uncancel_course(uuid, text) IS
  'Nimmt die Absage zurück, solange der Termin nicht begonnen hat. Nur Buchungen mit cancel_reason course_cancelled und dem canceled_at dieser Absage.';

REVOKE ALL ON FUNCTION public.cancel_course(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_course(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.uncancel_course(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uncancel_course(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Selbstprüfung
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_def text;
  v_del "char";
  v_sec boolean;
  v_msg text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'courses_status_valid'
      AND conrelid = 'public.courses'::regclass
  ) THEN
    RAISE EXCEPTION 'A9: courses_status_valid fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'courses_canceled_at_consistent'
      AND conrelid = 'public.courses'::regclass
  ) THEN
    RAISE EXCEPTION 'A9: courses_canceled_at_consistent fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'courses_cancel_note_length'
      AND conrelid = 'public.courses'::regclass
  ) THEN
    RAISE EXCEPTION 'A9: courses_cancel_note_length fehlt';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'courses'
      AND column_name = 'status'
      AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'A9: courses.status ist noch nullable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'courses'
      AND column_name IN ('canceled_at', 'canceled_by', 'cancel_note')
    HAVING count(*) = 3
  ) THEN
    RAISE EXCEPTION 'A9: Absage-Spalten fehlen';
  END IF;

  SELECT c.confdeltype
    INTO v_del
  FROM pg_constraint c
  WHERE c.conname = 'courses_canceled_by_fkey'
    AND c.conrelid = 'public.courses'::regclass;
  IF v_del IS DISTINCT FROM 'n' THEN
    RAISE EXCEPTION 'A9: canceled_by ist nicht ON DELETE SET NULL';
  END IF;

  SELECT pg_get_triggerdef(t.oid)
    INTO v_def
  FROM pg_trigger t
  WHERE t.tgname = 'courses_status_guard'
    AND t.tgrelid = 'public.courses'::regclass
    AND NOT t.tgisinternal;
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'A9: Trigger courses_status_guard fehlt';
  END IF;
  IF v_def NOT LIKE '%INSERT%' THEN
    RAISE EXCEPTION 'A9: courses_status_guard ohne INSERT';
  END IF;

  IF has_function_privilege('anon', 'yogaflow_private.courses_status_guard()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'yogaflow_private.courses_status_guard()', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'A9: Guard-Funktion ist ausführbar';
  END IF;

  SELECT pg_get_functiondef('public.promote_from_waitlist(uuid)'::regprocedure) INTO v_def;
  IF v_def NOT LIKE '%v_status IS DISTINCT FROM ''active''%' THEN
    RAISE EXCEPTION 'A9: promote_from_waitlist ohne Statusprüfung';
  END IF;

  SELECT pg_get_functiondef('public.admin_register_user_for_course(uuid, uuid)'::regprocedure) INTO v_def;
  IF v_def NOT LIKE '%COURSE_NOT_AVAILABLE%' THEN
    RAISE EXCEPTION 'A9: admin_register_user_for_course ohne COURSE_NOT_AVAILABLE';
  END IF;

  SELECT pg_get_functiondef('public.register_for_course(uuid, uuid)'::regprocedure) INTO v_def;
  IF v_def NOT LIKE '%Dieser Kurs ist nicht zur Anmeldung verfügbar.%' THEN
    RAISE EXCEPTION 'A9: register_for_course hat die Statusprüfung verloren';
  END IF;

  SELECT p.prosecdef
    INTO v_sec
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'cancel_course';
  IF v_sec IS NOT TRUE THEN
    RAISE EXCEPTION 'A9: cancel_course ist nicht SECURITY DEFINER';
  END IF;

  SELECT pg_get_functiondef('public.cancel_course(uuid, text, text)'::regprocedure) INTO v_def;
  IF v_def NOT LIKE '%SET search_path TO ''''%' THEN
    RAISE EXCEPTION 'A9: cancel_course ohne leeren search_path';
  END IF;

  SELECT p.prosecdef
    INTO v_sec
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'uncancel_course';
  IF v_sec IS NOT TRUE THEN
    RAISE EXCEPTION 'A9: uncancel_course ist nicht SECURITY DEFINER';
  END IF;

  SELECT pg_get_functiondef('public.uncancel_course(uuid, text)'::regprocedure) INTO v_def;
  IF v_def NOT LIKE '%SET search_path TO ''''%' THEN
    RAISE EXCEPTION 'A9: uncancel_course ohne leeren search_path';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.cancel_course(uuid, text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.cancel_course(uuid, text, text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.uncancel_course(uuid, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.uncancel_course(uuid, text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'A9: EXECUTE-Rechte der RPCs stimmen nicht';
  END IF;

  IF EXISTS (SELECT 1 FROM public.courses) THEN
    BEGIN
      UPDATE public.courses
      SET status = 'canceled'
      WHERE id = (SELECT id FROM public.courses ORDER BY id LIMIT 1);
      RAISE EXCEPTION 'A9: Guard hat direktes UPDATE durchgelassen';
    EXCEPTION
      WHEN insufficient_privilege THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        IF v_msg NOT LIKE '%cancel_course%' THEN
          RAISE;
        END IF;
    END;
  END IF;
END;
$$;
