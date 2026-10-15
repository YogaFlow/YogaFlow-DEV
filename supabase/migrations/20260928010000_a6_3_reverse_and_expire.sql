-- A6-3 — Zurückbuchen, Nachrücken mit Karte, manual_adjustment, Verfall.
--
-- Zweck: Abmeldung/Studio/Kursabsage buchen Einheiten zurück; Absage-Rücknahme
-- und Nachrücken lösen erneut ein; adjust_pass_units; expire_passes + pg_cron.
--
-- Bezug: A6, W1–W13, E17. Ersetzt den Zwischenstand aus A6-2
-- („Abmeldung bucht nicht zurück“).
--
-- Reason-Codes in pass_movements.reason (keine Freitexte in Events/Audit):
--   self_in_window, studio_unregister, course_cancelled,
--   waitlist_promotion_failed (reserviert), plus Freitext nur bei manual_adjustment.
--
-- PROD: pg_cron muss im Release mitlaufen — siehe docs/RELEASE_GELDKETTE_PLAN.md.
--
-- Rückweg (Kommentar, läuft nicht):
--   SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'yogaflow_expire_passes';
--   DROP FUNCTION IF EXISTS yogaflow_private.expire_passes(integer);
--   DROP FUNCTION IF EXISTS public.adjust_pass_units(uuid, integer, text);
--   -- Vorfassungen: unregister/admin_unregister ← 20260926144500
--   -- promote/cancel/uncancel ← 20260927143000

-- ---------------------------------------------------------------------------
-- 0. pg_cron (Supabase: Schema pg_catalog, Rechte für postgres)
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- ---------------------------------------------------------------------------
-- 1. unregister_from_course — Körper A1 + Rückbuchung in der Frist (W2)
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
  v_reg_id uuid;
  v_coverage public.registration_coverage_status;
  v_deadline timestamptz;
  v_pass_id uuid;
  v_pass_refunded boolean := false;
  v_pass_remaining integer;
  v_message text;
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

  SELECT id, status, coverage_status, cancellation_deadline, pass_id
  INTO v_reg_id, v_registration_status, v_coverage, v_deadline, v_pass_id
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
  WHERE id = v_reg_id;

  PERFORM public.compact_waitlist_positions(p_course_id);

  -- Diff A6-3: registered + Deckung pass → in der Frist (oder fehlende Frist) zurück.
  -- cancellation_deadline NULL bei pass sollte der Freeze-Trigger verhindern.
  -- Falls doch: kulant zurückbuchen (wie „in der Frist“), damit niemand die
  -- Einheit verliert wegen fehlendem Freeze.
  IF v_registration_status = 'registered'
     AND v_coverage = 'pass'::public.registration_coverage_status
     AND v_pass_id IS NOT NULL
  THEN
    IF v_deadline IS NULL OR now() < v_deadline THEN
      PERFORM yogaflow_private.reverse_redemption(
        v_reg_id, v_user_id, 'self_in_window'
      );
      v_pass_refunded := true;
      v_pass_remaining := yogaflow_private.pass_remaining(v_pass_id);
    END IF;
  END IF;

  IF v_waitlist_user_id IS NOT NULL THEN
    v_message := 'Abgemeldet. Ein Wartelisten-Teilnehmer wurde nachgerückt.';
  ELSE
    v_message := 'Erfolgreich abgemeldet.';
  END IF;

  IF v_coverage = 'pass'::public.registration_coverage_status
     AND v_registration_status = 'registered'
  THEN
    IF v_pass_refunded THEN
      v_message := v_message || ' Deine Karteneinheit ist zurückgebucht.';
    ELSE
      v_message := v_message || ' Die Frist ist vorbei, die Einheit bleibt verbraucht.';
    END IF;
  END IF;

  IF v_waitlist_user_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', v_message,
      'promoted_user_id', v_waitlist_user_id,
      'pass_refunded', v_pass_refunded,
      'pass_remaining', v_pass_remaining
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', v_message,
    'pass_refunded', v_pass_refunded,
    'pass_remaining', v_pass_remaining
  );
END;
$$;

REVOKE ALL ON FUNCTION public.unregister_from_course(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_from_course(uuid, uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. admin_unregister_user_from_course — immer zurück (W1)
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
  v_reg_id                   uuid;
  v_coverage                 public.registration_coverage_status;
  v_pass_id                  uuid;
  v_pass_refunded            boolean := false;
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

  SELECT id, status, is_waitlist, coverage_status, pass_id
  INTO v_reg_id, v_registration_status, v_registration_is_waitlist, v_coverage, v_pass_id
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
  WHERE id = v_reg_id;

  PERFORM public.compact_waitlist_positions(p_course_id);

  -- Diff A6-3: Deckung pass → immer zurück (W1), unabhängig von der Frist.
  IF v_coverage = 'pass'::public.registration_coverage_status
     AND v_pass_id IS NOT NULL
  THEN
    PERFORM yogaflow_private.reverse_redemption(
      v_reg_id, v_actor_id, 'studio_unregister'
    );
    v_pass_refunded := true;
  END IF;

  v_notification_body := format(
    'Du wurdest vom Kurs "%s" am %s um %s abgemeldet.',
    v_course_title,
    to_char(v_course_date, 'DD.MM.YYYY'),
    to_char(v_course_time, 'HH24:MI')
  );
  IF v_pass_refunded THEN
    v_notification_body := v_notification_body
      || ' Deine Karteneinheit ist zurückgebucht.';
  END IF;

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
      'promoted_user_id', v_waitlist_user_id,
      'pass_refunded', v_pass_refunded
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Teilnehmer erfolgreich abgemeldet.',
    'pass_refunded', v_pass_refunded
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_unregister_user_from_course(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unregister_user_from_course(uuid, uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. promote_from_waitlist — Nachrücken mit coverage_intent = pass
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
  v_pass_id uuid;
  v_remaining integer;
  v_redeem_ok boolean;
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
    SELECT id, user_id, waitlist_position, coverage_intent
      INTO v_next_user
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

    v_redeem_ok := false;
    v_remaining := NULL;

    -- Diff A6-3: Intent pass → einlösen. Subtransaktion: Fehler darf die
    -- Abmeldung der anderen Person (Trigger-Aufrufer) nie abbrechen.
    IF v_next_user.coverage_intent IS NOT DISTINCT FROM 'pass' THEN
      BEGIN
        v_pass_id := yogaflow_private.pick_pass_for_registration(
          v_next_user.user_id, p_course_id
        );
        IF v_pass_id IS NOT NULL THEN
          -- Akteur NULL = System (pass_movements.actor_member_id / audit erlaubt NULL).
          PERFORM yogaflow_private.redeem_pass(
            v_next_user.id, v_pass_id, NULL
          );
          v_remaining := yogaflow_private.pass_remaining(v_pass_id);
          v_redeem_ok := true;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_redeem_ok := false;
        v_remaining := NULL;
      END;

      UPDATE public.registrations
      SET coverage_intent = NULL
      WHERE id = v_next_user.id;
    END IF;

    IF v_next_user.coverage_intent IS NOT DISTINCT FROM 'pass' AND NOT v_redeem_ok THEN
      v_notification_body :=
        'Du bist nachgerückt. Deine Karte konnte nicht genutzt werden, bitte bezahle vor Ort.';
    ELSE
      v_notification_body := pg_catalog.format(
        'Du hast einen Platz im Kurs „%s“ am %s um %s bekommen.',
        v_course_title,
        pg_catalog.to_char(v_course_date, 'DD.MM.YYYY'),
        pg_catalog.to_char(v_course_time, 'HH24:MI')
      );
      IF v_redeem_ok THEN
        v_notification_body := v_notification_body
          || pg_catalog.format(
            ' Mit deiner Karte bezahlt (noch %s).',
            v_remaining
          );
      END IF;
    END IF;

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

REVOKE ALL ON FUNCTION public.promote_from_waitlist(uuid)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. cancel_course — Rückbuchung an A9-Markierung + E17
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
  v_pass_refunded integer := 0;
  v_pass_refunded_inactive integer := 0;
  v_pass_ref_course integer;
  v_pass_inactive_course integer;
  v_pass_user_ids uuid[];
  v_reg record;
  v_rev jsonb;
  v_e17 text;
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
    -- Diff A6-3: reverse_redemption je pass-Buchung; E17 bei pass_inactive.
    v_pass_ref_course := 0;
    v_pass_inactive_course := 0;
    v_pass_user_ids := ARRAY[]::uuid[];

    FOR v_reg IN
      SELECT id, user_id, pass_id
      FROM public.registrations
      WHERE course_id = v_course.id
        AND cancel_reason = 'course_cancelled'
        AND cancellation_timestamp = v_at
        AND coverage_status = 'pass'::public.registration_coverage_status
        AND pass_id IS NOT NULL
      ORDER BY id
    LOOP
      v_rev := yogaflow_private.reverse_redemption(
        v_reg.id, v_actor, 'course_cancelled'
      );
      v_pass_ref_course := v_pass_ref_course + 1;
      v_pass_user_ids := v_pass_user_ids || v_reg.user_id;
      IF COALESCE((v_rev ->> 'pass_inactive')::boolean, false) THEN
        v_pass_inactive_course := v_pass_inactive_course + 1;
      END IF;
    END LOOP;

    v_pass_refunded := v_pass_refunded + v_pass_ref_course;
    v_pass_refunded_inactive := v_pass_refunded_inactive + v_pass_inactive_course;

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
           CASE
             WHEN r.user_id = ANY (v_pass_user_ids)
             THEN v_body || ' Deine Karteneinheit ist zurückgebucht.'
             ELSE v_body
           END,
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

    -- E17: Einheiten auf abgelaufene/stornierte Karten zurückgebucht.
    IF v_pass_inactive_course > 0 THEN
      v_e17 := pg_catalog.format(
        '%s Einheiten wurden auf abgelaufene Karten zurückgebucht. Prüfe, ob du sie auf eine gültige Karte übertragen willst.',
        v_pass_inactive_course
      );
      INSERT INTO public.user_notifications (
        tenant_id, user_id, type, body, course_id, action_path, metadata
      )
      SELECT v_tenant,
             u.id,
             'course_canceled',
             v_e17,
             v_course.id,
             '/course/' || v_course.id::text || '/kassieren',
             pg_catalog.jsonb_build_object(
               'pass_refunded_inactive', v_pass_inactive_course,
               'for_managers', true
             )
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
        'paid_registrations', v_paid,
        'pass_refunded', v_pass_ref_course,
        'pass_refunded_inactive', v_pass_inactive_course
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
    'paid_registrations', v_paid_total,
    'pass_refunded', v_pass_refunded,
    'pass_refunded_inactive', v_pass_refunded_inactive
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. uncancel_course — erneut einlösen (W7), Subtransaktion je Buchung
-- ---------------------------------------------------------------------------

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
  v_last_kind text;
  v_last_reason text;
  v_pass_id uuid;
  v_failed_open integer;
  v_on_waitlist boolean;
  v_owner_body text;
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
      v_failed_open := 0;

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

          v_on_waitlist := true;

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
          v_on_waitlist := false;

          v_body := pg_catalog.format(
            'Der Kurs „%s“ am %s um %s findet doch statt. Du bist wieder angemeldet.',
            v_course.title,
            pg_catalog.to_char(v_course.date, 'DD.MM.YYYY'),
            pg_catalog.to_char(v_course.time, 'HH24:MI')
          );
        END IF;

        -- Diff A6-3: letzte Bewegung redeem_reversal/course_cancelled → erneut einlösen.
        SELECT m.kind, m.reason
          INTO v_last_kind, v_last_reason
        FROM public.pass_movements m
        WHERE m.registration_id = v_reg.id
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 1;

        IF v_last_kind = 'redeem_reversal'
           AND v_last_reason = 'course_cancelled'
        THEN
          IF v_on_waitlist THEN
            UPDATE public.registrations
            SET coverage_intent = 'pass'
            WHERE id = v_reg.id;
          ELSE
            BEGIN
              v_pass_id := yogaflow_private.pick_pass_for_registration(
                v_reg.user_id, v_course.id
              );
              IF v_pass_id IS NULL THEN
                v_failed_open := v_failed_open + 1;
              ELSE
                PERFORM yogaflow_private.redeem_pass(
                  v_reg.id, v_pass_id, v_actor
                );
              END IF;
            EXCEPTION WHEN OTHERS THEN
              v_failed_open := v_failed_open + 1;
            END;
          END IF;
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

      IF v_failed_open > 0 THEN
        v_owner_body := pg_catalog.format(
          '%s Buchungen konnten nicht erneut mit Karte bezahlt werden und sind offen.',
          v_failed_open
        );
        INSERT INTO public.user_notifications (
          tenant_id, user_id, type, body, course_id, action_path, metadata
        )
        SELECT v_tenant,
               u.id,
               'course_uncanceled',
               v_owner_body,
               v_course.id,
               '/course/' || v_course.id::text || '/kassieren',
               pg_catalog.jsonb_build_object(
                 'pass_reredeem_failed', v_failed_open,
                 'for_managers', true
               )
        FROM public.users u
        WHERE u.tenant_id = v_tenant
          AND u.role IN ('owner', 'admin');
      END IF;

      v_event_id := yogaflow_private.insert_event(
        v_course.tenant_id,
        'course.uncanceled',
        'course',
        v_course.id,
        pg_catalog.jsonb_build_object(
          'course_id', v_course.id,
          'scope', p_scope,
          'restored_registrations', v_this,
          'pass_reredeem_failed', v_failed_open
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
  'Sagt einen Kurs oder die Serie ab diesem Termin ab. Warteliste zuerst, dann Angemeldete. Karten zurück (course_cancelled); paid bleibt für Rückgabe-Liste.';
COMMENT ON FUNCTION public.uncancel_course(uuid, text) IS
  'Nimmt die Absage zurück. Buchungen mit letzter Bewegung redeem_reversal/course_cancelled werden erneut eingelöst; sonst open + Glocke (W7).';

REVOKE ALL ON FUNCTION public.cancel_course(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_course(uuid, text, text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.uncancel_course(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uncancel_course(uuid, text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. adjust_pass_units (W6)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.adjust_pass_units(
  p_pass_id uuid,
  p_delta integer,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid;
  v_tenant uuid;
  v_pass public.passes%ROWTYPE;
  v_reason text;
  v_remaining integer;
  v_after integer;
  v_event_id uuid;
  v_causation uuid := pg_catalog.gen_random_uuid();
  v_movement_id uuid;
BEGIN
  v_actor := yogaflow_private.get_my_member_id();
  v_tenant := yogaflow_private.get_my_tenant_id();
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF NOT yogaflow_private.is_tenant_manager() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF p_delta IS NULL OR p_delta = 0 OR pg_catalog.abs(p_delta) > 100 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_DELTA');
  END IF;

  v_reason := NULLIF(pg_catalog.btrim(COALESCE(p_reason, '')), '');
  IF v_reason IS NULL
     OR pg_catalog.char_length(v_reason) < 3
     OR pg_catalog.char_length(v_reason) > 200
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'REASON_REQUIRED');
  END IF;

  SELECT * INTO v_pass
  FROM public.passes
  WHERE id = p_pass_id
  FOR UPDATE;

  IF NOT FOUND OR v_pass.tenant_id IS DISTINCT FROM v_tenant THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_pass.status = 'revoked' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_ACTIVE');
  END IF;

  IF v_pass.status = 'expired'
     OR v_pass.valid_until < (pg_catalog.timezone('Europe/Berlin', pg_catalog.now()))::date
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'PASS_EXPIRED');
  END IF;

  IF v_pass.status IS DISTINCT FROM 'active' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_ACTIVE');
  END IF;

  v_remaining := yogaflow_private.pass_remaining(v_pass.id);
  v_after := v_remaining + p_delta;
  IF v_after < 0 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NEGATIVE_BALANCE');
  END IF;

  -- Freitext nur in pass_movements.reason, nie im Event.
  v_event_id := yogaflow_private.insert_event(
    v_pass.tenant_id,
    'pass.adjusted',
    'pass',
    v_pass.id,
    pg_catalog.jsonb_build_object(
      'pass_id', v_pass.id,
      'delta', p_delta,
      'remaining_after', v_after
    ),
    v_causation
  );

  INSERT INTO public.pass_movements (
    tenant_id,
    pass_id,
    delta,
    kind,
    reason,
    actor_member_id,
    event_id
  ) VALUES (
    v_pass.tenant_id,
    v_pass.id,
    p_delta,
    'manual_adjustment',
    v_reason,
    v_actor,
    v_event_id
  )
  RETURNING id INTO v_movement_id;

  PERFORM yogaflow_private.insert_audit(
    v_pass.tenant_id,
    v_actor,
    'pass.adjusted',
    'passes',
    v_pass.id,
    ARRAY[]::text[],
    v_event_id
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'movement_id', v_movement_id,
    'remaining', v_after
  );
END;
$function$;

COMMENT ON FUNCTION public.adjust_pass_units(uuid, integer, text) IS
  'Manuelle Korrektur des Kartenrests. Nur Owner/Admin, Grund Pflicht (W6). Grund nur in pass_movements.reason.';

REVOKE ALL ON FUNCTION public.adjust_pass_units(uuid, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_pass_units(uuid, integer, text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. expire_passes + Cron (W8)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.expire_passes(
  p_limit integer DEFAULT 500
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_today date := (pg_catalog.timezone('Europe/Berlin', pg_catalog.now()))::date;
  v_warn_day date := v_today + 14;
  v_limit integer := GREATEST(COALESCE(p_limit, 500), 0);
  v_processed integer := 0;
  v_pass public.passes%ROWTYPE;
  v_remaining integer;
  v_event_id uuid;
  v_causation uuid;
BEGIN
  IF v_limit = 0 THEN
    RETURN 0;
  END IF;

  -- Verfall: active + valid_until < heute (Berlin).
  FOR v_pass IN
    SELECT p.*
    FROM public.passes p
    WHERE p.status = 'active'
      AND p.valid_until < v_today
    ORDER BY p.valid_until ASC, p.id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  LOOP
    v_remaining := yogaflow_private.pass_remaining(v_pass.id);
    v_causation := pg_catalog.gen_random_uuid();

    IF v_remaining > 0 THEN
      v_event_id := yogaflow_private.insert_event(
        v_pass.tenant_id,
        'pass.expired',
        'pass',
        v_pass.id,
        pg_catalog.jsonb_build_object(
          'pass_id', v_pass.id,
          'remaining_before', v_remaining
        ),
        v_causation
      );

      INSERT INTO public.pass_movements (
        tenant_id,
        pass_id,
        delta,
        kind,
        actor_member_id,
        event_id
      ) VALUES (
        v_pass.tenant_id,
        v_pass.id,
        -v_remaining,
        'expire',
        NULL,
        v_event_id
      );
    ELSE
      v_event_id := yogaflow_private.insert_event(
        v_pass.tenant_id,
        'pass.expired',
        'pass',
        v_pass.id,
        pg_catalog.jsonb_build_object(
          'pass_id', v_pass.id,
          'remaining_before', 0
        ),
        v_causation
      );
    END IF;

    PERFORM pg_catalog.set_config('yogaflow.allow_pass_change', 'on', true);

    UPDATE public.passes
    SET status = 'expired'
    WHERE id = v_pass.id;

    v_processed := v_processed + 1;
  END LOOP;

  -- Vorwarnung: gültig bis heute+14, Rest > 0, noch kein pass.expiring.
  FOR v_pass IN
    SELECT p.*
    FROM public.passes p
    WHERE p.status = 'active'
      AND p.valid_until = v_warn_day
      AND yogaflow_private.pass_remaining(p.id) > 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.events e
        WHERE e.type = 'pass.expiring'
          AND e.subject_type = 'pass'
          AND e.subject_id = p.id
      )
    ORDER BY p.id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(v_limit - v_processed, 0)
  LOOP
    v_remaining := yogaflow_private.pass_remaining(v_pass.id);
    v_causation := pg_catalog.gen_random_uuid();

    PERFORM yogaflow_private.insert_event(
      v_pass.tenant_id,
      'pass.expiring',
      'pass',
      v_pass.id,
      pg_catalog.jsonb_build_object(
        'pass_id', v_pass.id,
        'valid_until', v_pass.valid_until,
        'remaining', v_remaining
      ),
      v_causation
    );

    v_processed := v_processed + 1;
  END LOOP;

  RETURN v_processed;
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.expire_passes(integer) IS
  'Verfall und 14-Tage-Vorwarnung (Europe/Berlin). Nur service_role/postgres. Idempotent.';

REVOKE ALL ON FUNCTION yogaflow_private.expire_passes(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION yogaflow_private.expire_passes(integer)
  TO postgres, service_role;

-- Öffentlicher Alias für service_role / Tests (PostgREST sieht yogaflow_private nicht).
CREATE OR REPLACE FUNCTION public.expire_passes(p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT yogaflow_private.expire_passes(p_limit);
$function$;

COMMENT ON FUNCTION public.expire_passes(integer) IS
  'Alias für yogaflow_private.expire_passes. Nur service_role/postgres.';

REVOKE ALL ON FUNCTION public.expire_passes(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_passes(integer)
  TO postgres, service_role;

-- Job ersetzen (gleicher Name), stündlich Minute 5.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'yogaflow_expire_passes'
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'yogaflow_expire_passes',
    '5 * * * *',
    $cron$SELECT yogaflow_private.expire_passes();$cron$
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Selbstprüfung (statisch)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_def text;
  v_sec boolean;
BEGIN
  SELECT pg_get_functiondef('public.unregister_from_course(uuid,uuid)'::regprocedure)
    INTO v_def;
  IF v_def IS NULL OR v_def NOT LIKE '%reverse_redemption%' THEN
    RAISE EXCEPTION 'A6-3: unregister_from_course ohne reverse_redemption';
  END IF;
  IF v_def NOT LIKE '%self_in_window%' THEN
    RAISE EXCEPTION 'A6-3: unregister_from_course ohne self_in_window';
  END IF;

  SELECT pg_get_functiondef(
    'public.admin_unregister_user_from_course(uuid,uuid)'::regprocedure
  ) INTO v_def;
  IF v_def IS NULL OR v_def NOT LIKE '%reverse_redemption%' THEN
    RAISE EXCEPTION 'A6-3: admin_unregister ohne reverse_redemption';
  END IF;
  IF v_def NOT LIKE '%studio_unregister%' THEN
    RAISE EXCEPTION 'A6-3: admin_unregister ohne studio_unregister';
  END IF;

  SELECT pg_get_functiondef('public.cancel_course(uuid,text,text)'::regprocedure)
    INTO v_def;
  IF v_def IS NULL OR v_def NOT LIKE '%reverse_redemption%' THEN
    RAISE EXCEPTION 'A6-3: cancel_course ohne reverse_redemption';
  END IF;
  IF v_def NOT LIKE '%course_cancelled%' THEN
    RAISE EXCEPTION 'A6-3: cancel_course ohne course_cancelled';
  END IF;

  SELECT pg_get_functiondef('public.uncancel_course(uuid,text)'::regprocedure)
    INTO v_def;
  IF v_def IS NULL OR v_def NOT LIKE '%redeem_pass%' THEN
    RAISE EXCEPTION 'A6-3: uncancel_course ohne redeem_pass';
  END IF;

  SELECT pg_get_functiondef('public.promote_from_waitlist(uuid)'::regprocedure)
    INTO v_def;
  IF v_def IS NULL OR v_def NOT LIKE '%redeem_pass%' THEN
    RAISE EXCEPTION 'A6-3: promote_from_waitlist ohne redeem_pass';
  END IF;

  SELECT p.prosecdef, pg_get_functiondef(p.oid)
    INTO v_sec, v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'adjust_pass_units';

  IF NOT COALESCE(v_sec, false) THEN
    RAISE EXCEPTION 'A6-3: adjust_pass_units nicht SECURITY DEFINER';
  END IF;

  -- Leerer search_path: Definition enthält SET search_path TO '' bzw. = ''.
  IF position('search_path' IN v_def) = 0
     OR v_def LIKE '%search_path TO ''public''%'
     OR v_def LIKE '%search_path TO public%'
  THEN
    RAISE EXCEPTION 'A6-3: adjust_pass_units search_path nicht leer';
  END IF;

  IF has_function_privilege('anon', 'public.adjust_pass_units(uuid,integer,text)', 'EXECUTE')
     OR NOT has_function_privilege(
          'authenticated',
          'public.adjust_pass_units(uuid,integer,text)',
          'EXECUTE'
        )
  THEN
    RAISE EXCEPTION 'A6-3: EXECUTE auf adjust_pass_units falsch';
  END IF;

  IF has_function_privilege(
       'authenticated',
       'yogaflow_private.expire_passes(integer)',
       'EXECUTE'
     )
     OR has_function_privilege(
          'anon',
          'yogaflow_private.expire_passes(integer)',
          'EXECUTE'
        )
     OR has_function_privilege(
          'authenticated',
          'public.expire_passes(integer)',
          'EXECUTE'
        )
     OR has_function_privilege(
          'anon',
          'public.expire_passes(integer)',
          'EXECUTE'
        )
  THEN
    RAISE EXCEPTION 'A6-3: expire_passes darf nicht für anon/authenticated EXECUTE haben';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'yogaflow_expire_passes'
  ) THEN
    RAISE EXCEPTION 'A6-3: Cron-Job yogaflow_expire_passes fehlt';
  END IF;

  -- Keine reason-Keys in Event-Payloads der neuen RPCs.
  SELECT pg_get_functiondef('public.adjust_pass_units(uuid,integer,text)'::regprocedure)
    INTO v_def;
  IF v_def LIKE '%insert_event%'
     AND v_def LIKE '%jsonb_build_object%'
     AND v_def LIKE '%''reason''%'
  THEN
    RAISE EXCEPTION 'A6-3: adjust_pass_units Event enthält reason';
  END IF;

  SELECT pg_get_functiondef('yogaflow_private.expire_passes(integer)'::regprocedure)
    INTO v_def;
  IF v_def LIKE '%''reason''%' THEN
    RAISE EXCEPTION 'A6-3: expire_passes Event enthält reason';
  END IF;
END;
$$;
