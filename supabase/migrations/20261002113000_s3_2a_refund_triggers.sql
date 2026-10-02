-- 3.2a — Auslöser R2 (Trigger + RPC-Antworten refund_cents), late_payment,
-- Backfill der 2 done refund_payment-Jobs.
-- allow: registrations_request_online_refund,unregister_from_course,admin_unregister_user_from_course,cancel_course

-- ---------------------------------------------------------------------------
-- 1. Trigger: Online-Erstattung bei Soft-Cancel
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.registrations_request_online_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM 'cancelled'::public.registration_status THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM 'cancelled'::public.registration_status THEN
    RETURN NEW;
  END IF;

  IF NEW.cancel_reason = 'course_cancelled' THEN
    PERFORM yogaflow_private.request_online_refunds_for_registration(
      NEW.id, 'course_cancelled', NEW.cancelled_by
    );
  ELSIF NEW.cancel_reason = 'participant' THEN
    IF NEW.cancellation_deadline IS NULL OR pg_catalog.now() < NEW.cancellation_deadline THEN
      PERFORM yogaflow_private.request_online_refunds_for_registration(
        NEW.id, 'self_cancel_in_window', NEW.cancelled_by
      );
    END IF;
  ELSIF NEW.cancel_reason = 'studio' THEN
    PERFORM yogaflow_private.request_online_refunds_for_registration(
      NEW.id, 'staff_unregister', NEW.cancelled_by
    );
  ELSIF NEW.cancel_reason = 'member_removed' THEN
    PERFORM yogaflow_private.request_online_refunds_for_registration(
      NEW.id, 'member_removed', NEW.cancelled_by
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS registrations_request_online_refund ON public.registrations;
CREATE TRIGGER registrations_request_online_refund
  AFTER UPDATE OF status, cancellation_timestamp, cancel_reason
  ON public.registrations
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.registrations_request_online_refund();

REVOKE ALL ON FUNCTION yogaflow_private.registrations_request_online_refund()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. unregister_from_course — refund_cents in Antwort
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
  v_tenant uuid;
  v_refund_cents integer := 0;
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

  SELECT id, status, coverage_status, cancellation_deadline, pass_id, tenant_id
  INTO v_reg_id, v_registration_status, v_coverage, v_deadline, v_pass_id, v_tenant
  FROM public.registrations
  WHERE course_id = p_course_id
    AND user_id = v_user_id
    AND status IN ('registered', 'waitlist', 'pending_payment')
    AND cancellation_timestamp IS NULL;

  IF v_registration_status IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Keine aktive Anmeldung für diesen Kurs gefunden.'
    );
  END IF;

  IF v_registration_status IN ('registered', 'pending_payment') THEN
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

  PERFORM yogaflow_private.cancel_payment_attempts_for_registration(
    v_reg_id, 'PARTICIPANT_CANCEL'
  );

  PERFORM public.compact_waitlist_positions(p_course_id);

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

  v_refund_cents := yogaflow_private.refund_cents_this_xact(
    v_tenant, 'self_cancel_in_window'
  );

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
      'pass_remaining', v_pass_remaining,
      'refund_cents', v_refund_cents
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', v_message,
    'pass_refunded', v_pass_refunded,
    'pass_remaining', v_pass_remaining,
    'refund_cents', v_refund_cents
  );
END;
$$;

REVOKE ALL ON FUNCTION public.unregister_from_course(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_from_course(uuid, uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. admin_unregister — refund_cents
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
  v_refund_cents             integer := 0;
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
    AND status IN ('registered', 'waitlist', 'pending_payment')
    AND cancellation_timestamp IS NULL;

  IF v_registration_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_registered');
  END IF;

  IF v_actor_role = 'teacher'
     AND (v_registration_is_waitlist
          OR v_registration_status NOT IN (
            'registered'::public.registration_status,
            'pending_payment'::public.registration_status
          )) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Teachers can only unregister active participants from their own courses'
    );
  END IF;

  v_was_registered := (v_registration_status IN ('registered', 'pending_payment') AND NOT v_registration_is_waitlist);

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

  PERFORM yogaflow_private.cancel_payment_attempts_for_registration(
    v_reg_id, 'STUDIO_CANCEL'
  );

  PERFORM public.compact_waitlist_positions(p_course_id);

  IF v_coverage = 'pass'::public.registration_coverage_status
     AND v_pass_id IS NOT NULL
  THEN
    PERFORM yogaflow_private.reverse_redemption(
      v_reg_id, v_actor_id, 'studio_unregister'
    );
    v_pass_refunded := true;
  END IF;

  v_refund_cents := yogaflow_private.refund_cents_this_xact(
    v_actor_tenant, 'staff_unregister'
  );

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
      'pass_refunded', v_pass_refunded,
      'refund_cents', v_refund_cents
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Teilnehmer erfolgreich abgemeldet.',
    'pass_refunded', v_pass_refunded,
    'refund_cents', v_refund_cents
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_unregister_user_from_course(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unregister_user_from_course(uuid, uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. cancel_course — nur Rückgabe um refund_cents ergänzen (Körper = DEV)
--    Diff: Variable v_refund_cents + Feld in Return. Trigger erledigt R2.
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
  v_refund_cents integer := 0;
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
      AND status IN ('registered', 'waitlist', 'pending_payment')
      AND cancellation_timestamp IS NULL;

    UPDATE public.courses
    SET status = 'canceled',
        canceled_at = v_at,
        canceled_by = v_actor,
        cancel_note = v_note
    WHERE id = v_course.id;

    PERFORM yogaflow_private.cancel_payment_attempts_for_registration(r.id, 'COURSE_CANCELLED')
    FROM public.registrations r
    WHERE r.course_id = v_course.id
      AND r.status = 'pending_payment'::public.registration_status
      AND r.cancellation_timestamp IS NULL;

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

    UPDATE public.registrations
    SET status = 'cancelled',
        cancellation_timestamp = v_at,
        cancelled_by = v_actor,
        cancel_reason = 'course_cancelled',
        waitlist_position = NULL
    WHERE course_id = v_course.id
      AND status = 'pending_payment'::public.registration_status
      AND cancellation_timestamp IS NULL;

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

  v_refund_cents := yogaflow_private.refund_cents_this_xact(v_tenant, 'course_cancelled');

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'canceled_course_ids', to_jsonb(v_canceled_ids),
    'cancelled_registrations', v_cancelled_total,
    'paid_registrations', v_paid_total,
    'pass_refunded', v_pass_refunded,
    'pass_refunded_inactive', v_pass_refunded_inactive,
    'refund_cents', v_refund_cents
  );
END;
$function$;

COMMENT ON FUNCTION public.cancel_course(uuid, text, text) IS
  'Sagt Kurs(e) ab. Soft-Cancel; Online-Erstattung via Trigger (course_cancelled).';

REVOKE ALL ON FUNCTION public.cancel_course(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_course(uuid, text, text)
  TO authenticated;
