-- 2.1b-b Teil B1 — Nachrücken E2 + email_deliveries (ohne Versand).
--
-- Bezug: Entscheidungen S1–S8, S6a–S6d (Julius 29.09.2026).
-- Basis promote_from_waitlist: DEV Stand nach 20260929140001 (pg_get_functiondef).
--
-- Bewusst nicht: pg_net, Cron-Versand, Edge Function dispatch-emails (B2),
-- Client-Oberfläche (C/D), succeeded (2.2a).
--
-- Rückweg:
--   DROP FUNCTION IF EXISTS public.mark_email_delivery(uuid, text, text);
--   DROP FUNCTION IF EXISTS yogaflow_private.mark_email_delivery(uuid, text, text);
--   DROP FUNCTION IF EXISTS public.claim_email_deliveries(integer);
--   DROP FUNCTION IF EXISTS yogaflow_private.claim_email_deliveries(integer);
--   DROP TRIGGER IF EXISTS email_deliveries_no_delete ON public.email_deliveries;
--   DROP FUNCTION IF EXISTS yogaflow_private.email_deliveries_no_delete();
--   DROP TABLE IF EXISTS public.email_deliveries;
--   DROP FUNCTION IF EXISTS yogaflow_private.promotion_hold_deadline(uuid);
--   -- promote_from_waitlist / remove_member / delete_tenant_complete
--   -- aus 20260929140001 wiederherstellen.

-- ===========================================================================
-- 1. Helfer promotion_hold_deadline (S2)
-- ===========================================================================

CREATE OR REPLACE FUNCTION yogaflow_private.promotion_hold_deadline(p_course uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT LEAST(
    pg_catalog.now() + interval '12 hours',
    (c.date + COALESCE(c.time, TIME '00:00:00'))
      AT TIME ZONE 'Europe/Berlin'
      - interval '2 hours'
  )
  FROM public.courses c
  WHERE c.id = p_course;
$function$;

COMMENT ON FUNCTION yogaflow_private.promotion_hold_deadline(uuid) IS
  'S2: least(now()+12h, Kursbeginn−2h), Kursbeginn Europe/Berlin.';

REVOKE ALL ON FUNCTION yogaflow_private.promotion_hold_deadline(uuid)
  FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 2. Tabelle email_deliveries (S6a)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE RESTRICT,
  kind text NOT NULL,
  registration_id uuid NOT NULL REFERENCES public.registrations (id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  locked_until timestamptz,
  last_error_code text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT email_deliveries_event_id_unique UNIQUE (event_id),
  CONSTRAINT email_deliveries_kind_check
    CHECK (kind IN ('waitlist_promoted_payment_required')),
  CONSTRAINT email_deliveries_status_check
    CHECK (status IN ('pending', 'sending', 'sent', 'skipped', 'failed')),
  CONSTRAINT email_deliveries_attempts_nonneg
    CHECK (attempts >= 0),
  CONSTRAINT email_deliveries_error_code_format
    CHECK (
      last_error_code IS NULL
      OR last_error_code ~ '^[A-Z_]{3,64}$'
    )
);

CREATE INDEX IF NOT EXISTS email_deliveries_claim_idx
  ON public.email_deliveries (status, next_attempt_at);

CREATE INDEX IF NOT EXISTS email_deliveries_tenant_idx
  ON public.email_deliveries (tenant_id);

CREATE INDEX IF NOT EXISTS email_deliveries_registration_idx
  ON public.email_deliveries (registration_id);

COMMENT ON TABLE public.email_deliveries IS
  'Outbox für E-Mails (S6). Keine Empfängeradresse, kein Inhalt. Versand in B2.';

ALTER TABLE public.email_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.email_deliveries FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.email_deliveries TO service_role;
-- Keine Policy für authenticated (S6a). RLS an → authenticated sieht nichts.

CREATE OR REPLACE FUNCTION yogaflow_private.email_deliveries_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF pg_catalog.current_setting('yogaflow.allow_email_delivery_delete', true) = 'on'
     AND current_user::text NOT IN ('anon', 'authenticated')
  THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'email_deliveries: DELETE nicht erlaubt'
    USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS email_deliveries_no_delete ON public.email_deliveries;
CREATE TRIGGER email_deliveries_no_delete
  BEFORE DELETE ON public.email_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.email_deliveries_no_delete();

REVOKE ALL ON FUNCTION yogaflow_private.email_deliveries_no_delete()
  FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 3. claim_email_deliveries / mark_email_delivery (S6c) — nur service_role
-- ===========================================================================

CREATE OR REPLACE FUNCTION yogaflow_private.claim_email_deliveries(p_limit integer)
RETURNS SETOF public.email_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_limit integer := GREATEST(COALESCE(p_limit, 0), 0);
  v_row public.email_deliveries%ROWTYPE;
BEGIN
  IF v_limit = 0 THEN
    RETURN;
  END IF;

  FOR v_row IN
    SELECT *
    FROM public.email_deliveries d
    WHERE d.next_attempt_at <= pg_catalog.now()
      AND (
        d.status = 'pending'
        OR (
          d.status = 'sending'
          AND d.locked_until IS NOT NULL
          AND d.locked_until < pg_catalog.now()
        )
      )
    ORDER BY d.next_attempt_at ASC, d.id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  LOOP
    UPDATE public.email_deliveries
    SET
      status = 'sending',
      locked_until = pg_catalog.now() + interval '5 minutes'
    WHERE id = v_row.id
    RETURNING * INTO v_row;

    RETURN NEXT v_row;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.claim_email_deliveries(integer) IS
  'Holt ausstehende Outbox-Zeilen (FOR UPDATE SKIP LOCKED). Nur service_role.';

REVOKE ALL ON FUNCTION yogaflow_private.claim_email_deliveries(integer)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_email_deliveries(p_limit integer)
RETURNS SETOF public.email_deliveries
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT * FROM yogaflow_private.claim_email_deliveries(p_limit);
$function$;

REVOKE ALL ON FUNCTION public.claim_email_deliveries(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_deliveries(integer)
  TO service_role;

CREATE OR REPLACE FUNCTION yogaflow_private.mark_email_delivery(
  p_id uuid,
  p_status text,
  p_error_code text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row public.email_deliveries%ROWTYPE;
  v_code text;
  v_attempts integer;
  v_delay interval;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('sent', 'skipped', 'failed') THEN
    RAISE EXCEPTION 'INVALID_STATUS'
      USING ERRCODE = '22023';
  END IF;

  IF p_error_code IS NOT NULL AND p_error_code !~ '^[A-Z_]{3,64}$' THEN
    RAISE EXCEPTION 'INVALID_ERROR_CODE'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_row
  FROM public.email_deliveries
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_status = 'sent' THEN
    UPDATE public.email_deliveries
    SET
      status = 'sent',
      sent_at = pg_catalog.now(),
      locked_until = NULL,
      last_error_code = NULL
    WHERE id = p_id;
    RETURN;
  END IF;

  IF p_status = 'skipped' THEN
    UPDATE public.email_deliveries
    SET
      status = 'skipped',
      locked_until = NULL,
      last_error_code = p_error_code
    WHERE id = p_id;
    RETURN;
  END IF;

  -- failed = dieser Versuch; Retry oder endgültig failed (S6c).
  v_code := p_error_code;
  v_attempts := v_row.attempts + 1;

  IF v_attempts >= 5 THEN
    UPDATE public.email_deliveries
    SET
      status = 'failed',
      attempts = v_attempts,
      locked_until = NULL,
      last_error_code = v_code
    WHERE id = p_id;
    RETURN;
  END IF;

  v_delay := CASE v_attempts
    WHEN 1 THEN interval '1 minute'
    WHEN 2 THEN interval '5 minutes'
    WHEN 3 THEN interval '15 minutes'
    ELSE interval '60 minutes'
  END;

  UPDATE public.email_deliveries
  SET
    status = 'pending',
    attempts = v_attempts,
    next_attempt_at = pg_catalog.now() + v_delay,
    locked_until = NULL,
    last_error_code = v_code
  WHERE id = p_id;
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.mark_email_delivery(uuid, text, text) IS
  'Abschluss oder Fehlversuch einer Outbox-Zeile. Retry 1/5/15/60 Min., nach 5 failed.';

REVOKE ALL ON FUNCTION yogaflow_private.mark_email_delivery(uuid, text, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_email_delivery(
  p_id uuid,
  p_status text,
  p_error_code text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT yogaflow_private.mark_email_delivery(p_id, p_status, p_error_code);
$function$;

REVOKE ALL ON FUNCTION public.mark_email_delivery(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_email_delivery(uuid, text, text)
  TO service_role;

-- ===========================================================================
-- 4. promote_from_waitlist (S1–S5, S6b) — Diff nur geplante Änderungen
-- ===========================================================================

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
  v_course_price numeric;
  v_tenant_id uuid;
  v_status text;
  v_notification_body text;
  v_pass_id uuid;
  v_remaining integer;
  v_redeem_ok boolean;
  v_online_req boolean;
  v_deadline timestamptz;
  v_event_id uuid;
BEGIN
  SELECT max_participants, title, date, time, price, tenant_id, status
  INTO v_max_participants, v_course_title, v_course_date, v_course_time,
       v_course_price, v_tenant_id, v_status
  FROM public.courses
  WHERE id = p_course_id
  FOR UPDATE;

  IF NOT FOUND OR v_status IS DISTINCT FROM 'active' THEN
    RETURN;
  END IF;

  v_current_count := yogaflow_private.course_occupied_seats(p_course_id);

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

    -- S1/S3: Online-Pflicht nur bei kostenpflichtigem Kurs.
    v_online_req := yogaflow_private.online_payment_required(v_tenant_id)
      AND COALESCE(v_course_price, 0) > 0;

    IF v_online_req THEN
      v_deadline := yogaflow_private.promotion_hold_deadline(p_course_id);
      -- S3: Frist nicht in der Zukunft → niemand rückt nach.
      IF v_deadline IS NULL OR v_deadline <= pg_catalog.now() THEN
        PERFORM yogaflow_private.insert_event(
          v_tenant_id,
          'waitlist.promotion_skipped',
          'course',
          p_course_id,
          pg_catalog.jsonb_build_object(
            'course_id', p_course_id,
            'reason_code', 'TOO_CLOSE_TO_START'
          ),
          pg_catalog.gen_random_uuid()
        );
        EXIT;
      END IF;
    END IF;

    v_redeem_ok := false;
    v_remaining := NULL;

    IF NOT v_online_req THEN
      -- S1 Fall 1: wie heute registered (+ Karte bei Zustimmung).
      UPDATE public.registrations
      SET status = 'registered',
          is_waitlist = false,
          waitlist_position = NULL,
          registered_at = pg_catalog.now()
      WHERE id = v_next_user.id;

      IF v_next_user.coverage_intent IS NOT DISTINCT FROM 'pass' THEN
        BEGIN
          v_pass_id := yogaflow_private.pick_pass_for_registration(
            v_next_user.user_id, p_course_id
          );
          IF v_pass_id IS NOT NULL THEN
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

    ELSIF v_next_user.coverage_intent IS NOT DISTINCT FROM 'pass' THEN
      -- S1 Fall 2: Online-Pflicht + Karte → registered+pass, sonst Fall 3.
      UPDATE public.registrations
      SET status = 'registered',
          is_waitlist = false,
          waitlist_position = NULL,
          registered_at = pg_catalog.now()
      WHERE id = v_next_user.id;

      BEGIN
        v_pass_id := yogaflow_private.pick_pass_for_registration(
          v_next_user.user_id, p_course_id
        );
        IF v_pass_id IS NOT NULL THEN
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

      IF v_redeem_ok THEN
        v_notification_body := pg_catalog.format(
          'Du hast einen Platz im Kurs „%s“ am %s um %s bekommen.',
          v_course_title,
          pg_catalog.to_char(v_course_date, 'DD.MM.YYYY'),
          pg_catalog.to_char(v_course_time, 'HH24:MI')
        );
        v_notification_body := v_notification_body
          || pg_catalog.format(
            ' Mit deiner Karte bezahlt (noch %s).',
            v_remaining
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
      ELSE
        -- Einlösen gescheitert → pending_payment (S1 Fall 3).
        UPDATE public.registrations
        SET status = 'pending_payment'::public.registration_status,
            is_waitlist = false,
            waitlist_position = NULL,
            hold_expires_at = v_deadline,
            hold_reason = 'promotion',
            coverage_status = 'open'::public.registration_coverage_status,
            registered_at = pg_catalog.now()
        WHERE id = v_next_user.id;

        v_event_id := yogaflow_private.insert_event(
          v_tenant_id,
          'registration.pending_payment',
          'registration',
          v_next_user.id,
          pg_catalog.jsonb_build_object(
            'registration_id', v_next_user.id,
            'course_id', p_course_id,
            'user_id', v_next_user.user_id,
            'hold_reason', 'promotion',
            'hold_expires_at', v_deadline
          ),
          pg_catalog.gen_random_uuid()
        );

        PERFORM yogaflow_private.insert_audit(
          v_tenant_id,
          NULL,
          'registration.pending_payment',
          'registrations',
          v_next_user.id,
          ARRAY['status', 'hold_expires_at', 'hold_reason', 'coverage_status']::text[],
          v_event_id
        );

        INSERT INTO public.email_deliveries (
          tenant_id,
          event_id,
          kind,
          registration_id,
          status,
          next_attempt_at
        ) VALUES (
          v_tenant_id,
          v_event_id,
          'waitlist_promoted_payment_required',
          v_next_user.id,
          'pending',
          pg_catalog.now()
        );

        v_notification_body := pg_catalog.format(
          'Du bist nachgerückt in „%s“ am %s um %s. Bitte bezahle online, sonst verfällt der Platz.',
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
          'waitlist_promoted_payment_required',
          v_notification_body,
          p_course_id,
          '/my-registrations',
          pg_catalog.jsonb_build_object(
            'promoted_from_waitlist', true,
            'hold_expires_at', v_deadline
          )
        );
      END IF;

    ELSE
      -- S1 Fall 3: Online-Pflicht ohne (erfolgreiche) Karte → pending_payment.
      UPDATE public.registrations
      SET status = 'pending_payment'::public.registration_status,
          is_waitlist = false,
          waitlist_position = NULL,
          hold_expires_at = v_deadline,
          hold_reason = 'promotion',
          coverage_status = 'open'::public.registration_coverage_status,
          coverage_intent = NULL,
          registered_at = pg_catalog.now()
      WHERE id = v_next_user.id;

      v_event_id := yogaflow_private.insert_event(
        v_tenant_id,
        'registration.pending_payment',
        'registration',
        v_next_user.id,
        pg_catalog.jsonb_build_object(
          'registration_id', v_next_user.id,
          'course_id', p_course_id,
          'user_id', v_next_user.user_id,
          'hold_reason', 'promotion',
          'hold_expires_at', v_deadline
        ),
        pg_catalog.gen_random_uuid()
      );

      PERFORM yogaflow_private.insert_audit(
        v_tenant_id,
        NULL,
        'registration.pending_payment',
        'registrations',
        v_next_user.id,
        ARRAY['status', 'hold_expires_at', 'hold_reason', 'coverage_status']::text[],
        v_event_id
      );

      INSERT INTO public.email_deliveries (
        tenant_id,
        event_id,
        kind,
        registration_id,
        status,
        next_attempt_at
      ) VALUES (
        v_tenant_id,
        v_event_id,
        'waitlist_promoted_payment_required',
        v_next_user.id,
        'pending',
        pg_catalog.now()
      );

      v_notification_body := pg_catalog.format(
        'Du bist nachgerückt in „%s“ am %s um %s. Bitte bezahle online, sonst verfällt der Platz.',
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
        'waitlist_promoted_payment_required',
        v_notification_body,
        p_course_id,
        '/my-registrations',
        pg_catalog.jsonb_build_object(
          'promoted_from_waitlist', true,
          'hold_expires_at', v_deadline
        )
      );
    END IF;

    v_current_count := v_current_count + 1;
  END LOOP;

  PERFORM public.compact_waitlist_positions(p_course_id);
END;
$function$;

COMMENT ON FUNCTION public.promote_from_waitlist(uuid) IS
  'Nachrücken S1–S5. Online-Pflicht → pending_payment + Outbox; sonst wie bisher. S3: TOO_CLOSE_TO_START.';

REVOKE ALL ON FUNCTION public.promote_from_waitlist(uuid)
  FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 5. remove_member — email_deliveries vor Löschen (4.3 / S6a)
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.remove_member(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_tenant uuid;
  v_target public.users%ROWTYPE;
  v_upcoming integer;
  v_cancelled integer := 0;
  v_deleted_regs integer := 0;
  v_money boolean;
  v_mode text;
  v_old_auth uuid;
  v_remaining integer;
  v_event_id uuid;
  v_fields text[];
BEGIN
  v_actor := yogaflow_private.get_my_member_id();
  IF NOT yogaflow_private.is_tenant_manager() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  v_tenant := yogaflow_private.get_my_tenant_id();

  SELECT *
    INTO v_target
  FROM public.users
  WHERE id = p_member_id;

  IF NOT FOUND OR v_target.tenant_id IS DISTINCT FROM v_tenant THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_target.id = v_actor THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'CANNOT_REMOVE_SELF');
  END IF;

  IF v_target.role = 'owner' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'OWNER_NOT_REMOVABLE');
  END IF;

  IF v_target.anonymized_at IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ALREADY_REMOVED');
  END IF;

  SELECT count(*)::integer
    INTO v_upcoming
  FROM public.courses c
  WHERE c.teacher_id = v_target.id
    AND c.status = 'active'
    AND (c.date + COALESCE(c.time, TIME '00:00:00'))
          AT TIME ZONE 'Europe/Berlin' > pg_catalog.now();

  IF v_upcoming > 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error', 'HAS_UPCOMING_COURSES',
      'upcoming_courses', v_upcoming
    );
  END IF;

  SELECT *
    INTO v_target
  FROM public.users
  WHERE id = p_member_id
  FOR UPDATE;

  IF NOT FOUND OR v_target.tenant_id IS DISTINCT FROM v_tenant THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_target.anonymized_at IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ALREADY_REMOVED');
  END IF;

  IF v_target.role = 'owner' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'OWNER_NOT_REMOVABLE');
  END IF;

  v_old_auth := v_target.auth_user_id;

  PERFORM 1
  FROM public.courses c
  WHERE c.id IN (
    SELECT r.course_id
    FROM public.registrations r
    JOIN public.courses c2 ON c2.id = r.course_id
    WHERE r.user_id = v_target.id
      AND r.tenant_id = v_tenant
      AND r.cancellation_timestamp IS NULL
      AND r.status IN (
        'registered'::public.registration_status,
        'waitlist'::public.registration_status,
        'pending_payment'::public.registration_status
      )
      AND c2.status = 'active'
      AND (c2.date + COALESCE(c2.time, TIME '00:00:00'))
            AT TIME ZONE 'Europe/Berlin' > pg_catalog.now()
  )
  ORDER BY c.id
  FOR UPDATE;

  UPDATE public.registrations r
  SET
    status = 'cancelled'::public.registration_status,
    cancellation_timestamp = pg_catalog.now(),
    cancelled_by = v_actor,
    cancel_reason = 'member_removed',
    waitlist_position = NULL
  FROM public.courses c
  WHERE r.course_id = c.id
    AND r.user_id = v_target.id
    AND r.tenant_id = v_tenant
    AND r.cancellation_timestamp IS NULL
    AND r.status IN (
      'registered'::public.registration_status,
      'waitlist'::public.registration_status,
      'pending_payment'::public.registration_status
    )
    AND c.status = 'active'
    AND (c.date + COALESCE(c.time, TIME '00:00:00'))
          AT TIME ZONE 'Europe/Berlin' > pg_catalog.now();

  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  PERFORM yogaflow_private.cancel_payment_attempts_for_registration(r.id, 'MEMBER_REMOVED')
  FROM public.registrations r
  WHERE r.user_id = v_target.id
    AND r.tenant_id = v_tenant
    AND r.cancel_reason = 'member_removed'
    AND r.hold_reason IS NOT NULL;

  v_money := EXISTS (
    SELECT 1
    FROM public.registrations r
    WHERE r.user_id = v_target.id
      AND (
        r.coverage_status IN (
          'paid'::public.registration_coverage_status,
          'waived'::public.registration_coverage_status,
          'pass'::public.registration_coverage_status
        )
        OR r.pass_id IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM public.payments p WHERE p.registration_id = r.id
        )
      )
  ) OR EXISTS (
    SELECT 1 FROM public.payments p WHERE p.recorded_by = v_target.id
  ) OR EXISTS (
    SELECT 1 FROM public.audit_log a WHERE a.actor_member_id = v_target.id
  ) OR EXISTS (
    SELECT 1
    FROM public.courses c
    WHERE c.teacher_id = v_target.id
      AND NOT (
        c.status = 'active'
        AND (c.date + COALESCE(c.time, TIME '00:00:00'))
              AT TIME ZONE 'Europe/Berlin' > pg_catalog.now()
      )
  ) OR EXISTS (
    SELECT 1 FROM public.passes p WHERE p.member_id = v_target.id
  );

  IF NOT v_money THEN
    v_mode := 'deleted';
    SELECT count(*)::integer
      INTO v_deleted_regs
    FROM public.registrations
    WHERE user_id = v_target.id;

    PERFORM pg_catalog.set_config('yogaflow.allow_payment_delete', 'on', true);
    PERFORM pg_catalog.set_config('yogaflow.allow_email_delivery_delete', 'on', true);

    -- S6a / 4.3: Outbox vor Löschen der Person/Anmeldungen.
    DELETE FROM public.email_deliveries d
    WHERE d.registration_id IN (
      SELECT r.id FROM public.registrations r WHERE r.user_id = v_target.id
    );

    DELETE FROM public.payment_attempts a
    WHERE a.payment_id IS NULL
      AND a.registration_id IN (
        SELECT r.id FROM public.registrations r WHERE r.user_id = v_target.id
      );

    DELETE FROM public.users WHERE id = v_target.id;
    v_fields := ARRAY['id']::text[];
  ELSE
    v_mode := 'anonymized';

    DELETE FROM public.messages
    WHERE sender_id = v_target.id OR recipient_id = v_target.id;

    DELETE FROM public.user_notifications
    WHERE user_id = v_target.id;

    PERFORM pg_catalog.set_config('yogaflow.allow_payment_delete', 'on', true);
    PERFORM pg_catalog.set_config('yogaflow.allow_email_delivery_delete', 'on', true);

    -- S6a / 4.3: alle Outbox-Zeilen der Person (auch behaltene Anmeldungen).
    DELETE FROM public.email_deliveries d
    WHERE d.registration_id IN (
      SELECT r.id FROM public.registrations r WHERE r.user_id = v_target.id
    );

    DELETE FROM public.payment_attempts a
    WHERE a.payment_id IS NULL
      AND a.registration_id IN (
        SELECT r.id
        FROM public.registrations r
        WHERE r.user_id = v_target.id
          AND r.cancel_reason IS DISTINCT FROM 'member_removed'
          AND r.coverage_status NOT IN (
            'paid'::public.registration_coverage_status,
            'waived'::public.registration_coverage_status,
            'pass'::public.registration_coverage_status
          )
          AND r.pass_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.payments p WHERE p.registration_id = r.id
          )
      );

    DELETE FROM public.registrations r
    WHERE r.user_id = v_target.id
      AND r.cancel_reason IS DISTINCT FROM 'member_removed'
      AND r.coverage_status NOT IN (
        'paid'::public.registration_coverage_status,
        'waived'::public.registration_coverage_status,
        'pass'::public.registration_coverage_status
      )
      AND r.pass_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.payments p WHERE p.registration_id = r.id
      );

    GET DIAGNOSTICS v_deleted_regs = ROW_COUNT;

    PERFORM pg_catalog.set_config('yogaflow.allow_member_removal', 'on', true);

    UPDATE public.users
    SET
      first_name = 'Entfernte',
      last_name = 'Person',
      email = 'entfernt-' || id::text || '@anonymisiert.invalid',
      street = NULL,
      house_number = NULL,
      postal_code = NULL,
      city = NULL,
      phone = NULL,
      email_verified = false,
      email_verified_at = NULL,
      role = 'user',
      anonymized_at = pg_catalog.now(),
      auth_user_id = NULL
    WHERE id = v_target.id;

    v_fields := ARRAY[
      'anonymized_at',
      'auth_user_id',
      'email',
      'first_name',
      'last_name',
      'street',
      'house_number',
      'postal_code',
      'city',
      'phone',
      'email_verified',
      'email_verified_at',
      'role'
    ]::text[];
  END IF;

  v_event_id := yogaflow_private.insert_event(
    v_tenant,
    'member.removed',
    'member',
    v_target.id,
    pg_catalog.jsonb_build_object(
      'member_id', v_target.id,
      'mode', v_mode,
      'cancelled_registrations', v_cancelled,
      'deleted_registrations', v_deleted_regs
    ),
    pg_catalog.gen_random_uuid()
  );

  PERFORM yogaflow_private.insert_audit(
    v_tenant,
    v_actor,
    'member.removed',
    'users',
    v_target.id,
    v_fields,
    v_event_id
  );

  SELECT count(*)::integer
    INTO v_remaining
  FROM public.users
  WHERE auth_user_id = v_old_auth;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'mode', v_mode,
    'auth_user_id', v_old_auth,
    'remaining_profiles', v_remaining,
    'cancelled_registrations', v_cancelled,
    'deleted_registrations', v_deleted_regs
  );
END;
$function$;

COMMENT ON FUNCTION public.remove_member(uuid) IS
  'Entfernt ein Profil. Löscht email_deliveries im Löschpfad (S6a/4.3).';

REVOKE ALL ON FUNCTION public.remove_member(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_member(uuid) TO authenticated;

-- ===========================================================================
-- 6. delete_tenant_complete — email_deliveries vor events (S6a)
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.delete_tenant_complete(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND: Kein Tenant mit dieser ID.'
      USING ERRCODE = 'P0002';
  END IF;

  ALTER TABLE public.users DISABLE TRIGGER prevent_last_owner_delete;
  BEGIN
    SET LOCAL yogaflow.allow_append_only_delete = 'on';
    SET LOCAL yogaflow.allow_payment_delete = 'on';
    SET LOCAL yogaflow.allow_pass_product_delete = 'on';
    SET LOCAL yogaflow.allow_pass_delete = 'on';
    SET LOCAL yogaflow.allow_email_delivery_delete = 'on';
    SET CONSTRAINTS public.registrations_pass_id_fkey DEFERRED;
    SET CONSTRAINTS public.coverage_waive_batches_tenant_id_fkey DEFERRED;
    SET CONSTRAINTS public.registrations_coverage_waived_batch_id_fkey DEFERRED;

    DELETE FROM public.ledger_event_log WHERE tenant_id = p_tenant_id;
    DELETE FROM public.ledger_entries WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenant_tax_settings WHERE tenant_id = p_tenant_id;

    DELETE FROM public.provider_events_raw WHERE tenant_id = p_tenant_id;
    DELETE FROM public.provider_capabilities WHERE tenant_id = p_tenant_id;
    DELETE FROM public.provider_accounts WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenant_payment_settings WHERE tenant_id = p_tenant_id;

    DELETE FROM public.audit_log WHERE tenant_id = p_tenant_id;
    DELETE FROM public.email_deliveries WHERE tenant_id = p_tenant_id;
    DELETE FROM public.events WHERE tenant_id = p_tenant_id;
    DELETE FROM public.user_notifications WHERE tenant_id = p_tenant_id;
    DELETE FROM public.messages WHERE tenant_id = p_tenant_id;
    DELETE FROM public.pass_movements WHERE tenant_id = p_tenant_id;
    DELETE FROM public.passes WHERE tenant_id = p_tenant_id;
    DELETE FROM public.payment_attempts WHERE tenant_id = p_tenant_id;
    DELETE FROM public.payments
      WHERE tenant_id = p_tenant_id
        AND reverses_payment_id IS NOT NULL;
    DELETE FROM public.payments WHERE tenant_id = p_tenant_id;
    DELETE FROM public.registrations WHERE tenant_id = p_tenant_id;
    DELETE FROM public.coverage_waive_batches WHERE tenant_id = p_tenant_id;
    DELETE FROM public.courses WHERE tenant_id = p_tenant_id;
    DELETE FROM public.pass_products WHERE tenant_id = p_tenant_id;
    DELETE FROM public.users WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenants WHERE id = p_tenant_id;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.users ENABLE TRIGGER prevent_last_owner_delete;
    RAISE;
  END;

  ALTER TABLE public.users ENABLE TRIGGER prevent_last_owner_delete;
END;
$function$;

COMMENT ON FUNCTION public.delete_tenant_complete(uuid) IS
  'Löscht einen Mandanten inkl. email_deliveries (2.1b-b B1). Nur postgres/service_role.';

REVOKE ALL ON FUNCTION public.delete_tenant_complete(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tenant_complete(uuid)
  TO postgres, service_role;

-- ===========================================================================
-- 7. Selbstprüfung
-- ===========================================================================

DO $$
DECLARE
  v_def text;
  v_oid oid;
  v_ok boolean;
  v_n integer;
BEGIN
  IF to_regprocedure('yogaflow_private.promotion_hold_deadline(uuid)') IS NULL THEN
    RAISE EXCEPTION 'B1: promotion_hold_deadline fehlt';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'promote_from_waitlist';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'B1: promote_from_waitlist fehlt';
  END IF;
  IF position('promotion_hold_deadline' in v_def) = 0 THEN
    RAISE EXCEPTION 'B1: promote_from_waitlist ohne promotion_hold_deadline';
  END IF;
  IF position('pending_payment' in v_def) = 0 THEN
    RAISE EXCEPTION 'B1: promote_from_waitlist ohne pending_payment';
  END IF;
  IF position('email_deliveries' in v_def) = 0 THEN
    RAISE EXCEPTION 'B1: promote_from_waitlist ohne email_deliveries';
  END IF;
  IF position('waitlist_promoted_payment_required' in v_def) = 0 THEN
    RAISE EXCEPTION 'B1: promote_from_waitlist ohne neuen Glocken-Typ';
  END IF;
  IF position('TOO_CLOSE_TO_START' in v_def) = 0 THEN
    RAISE EXCEPTION 'B1: promote_from_waitlist ohne TOO_CLOSE_TO_START';
  END IF;

  IF to_regclass('public.email_deliveries') IS NULL THEN
    RAISE EXCEPTION 'B1: email_deliveries fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'email_deliveries' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'B1: email_deliveries ohne RLS';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'email_deliveries'
      AND (
        roles IS NULL
        OR 'authenticated' = ANY (roles)
        OR 'anon' = ANY (roles)
        OR 'public' = ANY (roles)
      )
  ) THEN
    RAISE EXCEPTION 'B1: email_deliveries hat Policy für anon/authenticated/public';
  END IF;

  -- Rechte: neue Objekte ohne EXECUTE für anon/authenticated
  FOREACH v_oid IN ARRAY ARRAY[
    to_regprocedure('yogaflow_private.promotion_hold_deadline(uuid)'),
    to_regprocedure('yogaflow_private.claim_email_deliveries(integer)'),
    to_regprocedure('public.claim_email_deliveries(integer)'),
    to_regprocedure('yogaflow_private.mark_email_delivery(uuid,text,text)'),
    to_regprocedure('public.mark_email_delivery(uuid,text,text)'),
    to_regprocedure('yogaflow_private.email_deliveries_no_delete()')
  ]
  LOOP
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'B1: erwartete Funktion fehlt';
    END IF;
    SELECT NOT has_function_privilege('anon', v_oid, 'EXECUTE')
       AND NOT has_function_privilege('authenticated', v_oid, 'EXECUTE')
      INTO v_ok;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'B1: anon/authenticated hat EXECUTE auf %', v_oid::regprocedure;
    END IF;
  END LOOP;

  SELECT NOT has_table_privilege('anon', 'public.email_deliveries', 'SELECT')
     AND NOT has_table_privilege('authenticated', 'public.email_deliveries', 'SELECT')
     AND NOT has_table_privilege('anon', 'public.email_deliveries', 'INSERT')
     AND NOT has_table_privilege('authenticated', 'public.email_deliveries', 'INSERT')
    INTO v_ok;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'B1: anon/authenticated hat Tabellenrechte auf email_deliveries';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'delete_tenant_complete';
  IF position('DELETE FROM public.email_deliveries' in v_def) = 0 THEN
    RAISE EXCEPTION 'B1: delete_tenant_complete ohne email_deliveries';
  END IF;
  IF position('DELETE FROM public.email_deliveries' in v_def)
       > position('DELETE FROM public.events' in v_def)
  THEN
    RAISE EXCEPTION 'B1: email_deliveries muss vor events gelöscht werden';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'remove_member';
  IF position('email_deliveries' in v_def) = 0 THEN
    RAISE EXCEPTION 'B1: remove_member ohne email_deliveries';
  END IF;

  SELECT count(*)::integer INTO v_n
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'email_deliveries'
    AND grantee IN ('anon', 'authenticated');
  IF v_n > 0 THEN
    RAISE EXCEPTION 'B1: email_deliveries hat Grants an anon/authenticated';
  END IF;
END;
$$;
