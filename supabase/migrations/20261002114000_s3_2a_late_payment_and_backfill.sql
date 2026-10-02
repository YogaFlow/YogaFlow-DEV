-- 3.2a — late_payment statt direktem enqueue;
-- Backfill der 2 done refund_payment-Jobs.
-- allow: complete_online_payment

-- ---------------------------------------------------------------------------
-- 1. complete_online_payment: REFUND_REQUIRED → request_refund(..., late_payment)
--    Nur der Spätfall-Block ändert sich; Körper sonst wie 20261001100000.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.complete_online_payment(
  p_provider_ref text,
  p_amount_cents integer,
  p_currency text,
  p_received_at timestamptz,
  p_livemode boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_attempt public.payment_attempts%ROWTYPE;
  v_reg public.registrations%ROWTYPE;
  v_course public.courses%ROWTYPE;
  v_existing public.payments%ROWTYPE;
  v_payment_id uuid;
  v_event_id uuid;
  v_new_reg_id uuid;
  v_reason text;
  v_notification_body text;
  v_seat_free boolean;
  v_not_started boolean;
  v_already_booked boolean;
  v_other_id uuid;
  v_refund_res jsonb;
BEGIN
  IF p_provider_ref IS NULL OR pg_catalog.btrim(p_provider_ref) = '' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ATTEMPT_NOT_FOUND');
  END IF;

  SELECT * INTO v_existing
  FROM public.payments
  WHERE provider = 'stripe'::public.payment_provider
    AND provider_ref = p_provider_ref
  LIMIT 1;

  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'code', 'ALREADY_COMPLETED',
      'payment_id', v_existing.id
    );
  END IF;

  SELECT * INTO v_attempt
  FROM public.payment_attempts
  WHERE provider = 'stripe'::public.payment_provider
    AND provider_ref = p_provider_ref
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ATTEMPT_NOT_FOUND');
  END IF;

  IF v_attempt.livemode IS DISTINCT FROM COALESCE(p_livemode, false) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'LIVEMODE_MISMATCH');
  END IF;

  IF v_attempt.amount_cents IS DISTINCT FROM p_amount_cents
     OR upper(COALESCE(p_currency, '')) IS DISTINCT FROM upper(v_attempt.currency)
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'AMOUNT_MISMATCH');
  END IF;

  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = v_attempt.registration_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ATTEMPT_NOT_FOUND');
  END IF;

  SELECT * INTO v_course
  FROM public.courses
  WHERE id = v_reg.course_id
  FOR UPDATE;

  PERFORM pg_catalog.set_config('yogaflow.allow_payment_attempt_change', 'on', true);

  IF v_reg.status = 'pending_payment'::public.registration_status THEN
    INSERT INTO public.payments (
      tenant_id, subject_type, subject_id, registration_id,
      provider, provider_ref, method, status,
      amount_cents, currency, received_at, recorded_by
    ) VALUES (
      v_reg.tenant_id, 'registration', v_reg.id, v_reg.id,
      'stripe'::public.payment_provider, p_provider_ref,
      'card'::public.payment_method, 'succeeded'::public.payment_status,
      p_amount_cents, upper(COALESCE(p_currency, 'EUR')),
      COALESCE(p_received_at, pg_catalog.now()), NULL
    )
    RETURNING id INTO v_payment_id;

    IF v_attempt.status IN ('initiated', 'processing') THEN
      UPDATE public.payment_attempts
      SET status = 'succeeded', payment_id = v_payment_id
      WHERE id = v_attempt.id;
    ELSE
      UPDATE public.payment_attempts
      SET payment_id = v_payment_id
      WHERE id = v_attempt.id;
    END IF;

    FOR v_other_id IN
      SELECT a.id
      FROM public.payment_attempts a
      WHERE a.registration_id = v_reg.id
        AND a.id IS DISTINCT FROM v_attempt.id
        AND a.status IN ('initiated', 'processing')
      ORDER BY a.id
    LOOP
      PERFORM yogaflow_private.set_payment_attempt_status(
        v_other_id, 'canceled', 'SUPERSEDED', NULL
      );
    END LOOP;

    UPDATE public.registrations
    SET
      status = 'registered'::public.registration_status,
      coverage_status = 'paid'::public.registration_coverage_status,
      is_waitlist = false,
      waitlist_position = NULL
    WHERE id = v_reg.id;

    v_event_id := yogaflow_private.insert_event(
      v_reg.tenant_id, 'payment.recorded', 'payment', v_payment_id,
      pg_catalog.jsonb_build_object(
        'payment_id', v_payment_id,
        'registration_id', v_reg.id,
        'amount_cents', p_amount_cents,
        'currency', upper(COALESCE(p_currency, 'EUR')),
        'method', 'card', 'provider', 'stripe',
        'received_at', COALESCE(p_received_at, pg_catalog.now())
      ),
      pg_catalog.gen_random_uuid()
    );

    PERFORM yogaflow_private.insert_event(
      v_reg.tenant_id, 'registration.payment_completed', 'registration', v_reg.id,
      pg_catalog.jsonb_build_object(
        'registration_id', v_reg.id,
        'payment_id', v_payment_id,
        'course_id', v_reg.course_id
      ),
      pg_catalog.gen_random_uuid()
    );

    PERFORM yogaflow_private.insert_audit(
      v_reg.tenant_id, NULL, 'payment.recorded', 'payments', v_payment_id,
      ARRAY[
        'amount_cents', 'currency', 'method', 'provider',
        'status', 'received_at', 'registration_id', 'provider_ref'
      ]::text[],
      v_event_id
    );

    PERFORM yogaflow_private.insert_audit(
      v_reg.tenant_id, NULL, 'payment.recorded', 'registrations', v_reg.id,
      ARRAY['status', 'coverage_status']::text[],
      v_event_id
    );

    v_notification_body := pg_catalog.format(
      'Zahlung für „%s“ am %s um %s bestätigt.',
      v_course.title,
      pg_catalog.to_char(v_course.date, 'DD.MM.YYYY'),
      pg_catalog.to_char(v_course.time, 'HH24:MI')
    );

    INSERT INTO public.user_notifications (
      tenant_id, user_id, type, body, course_id, action_path, metadata
    ) VALUES (
      v_reg.tenant_id, v_reg.user_id, 'payment_succeeded', v_notification_body,
      v_reg.course_id, '/my-registrations',
      pg_catalog.jsonb_build_object('payment_id', v_payment_id, 'registration_id', v_reg.id)
    );

    INSERT INTO public.email_deliveries (
      tenant_id, event_id, kind, registration_id, status, next_attempt_at
    ) VALUES (
      v_reg.tenant_id, v_event_id, 'payment_succeeded', v_reg.id, 'pending', pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
      'success', true, 'code', 'COMPLETED',
      'payment_id', v_payment_id, 'registration_id', v_reg.id
    );
  END IF;

  v_not_started := v_course.id IS NOT NULL
    AND v_course.status = 'active'
    AND (v_course.date + COALESCE(v_course.time, TIME '00:00:00'))
          AT TIME ZONE 'Europe/Berlin' > pg_catalog.now();

  v_already_booked := (
      v_reg.status = 'registered'::public.registration_status
      AND v_reg.cancellation_timestamp IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.registrations r
      WHERE r.course_id = v_reg.course_id
        AND r.user_id = v_reg.user_id
        AND r.id IS DISTINCT FROM v_reg.id
        AND r.cancellation_timestamp IS NULL
        AND r.status IN (
          'registered'::public.registration_status,
          'pending_payment'::public.registration_status,
          'waitlist'::public.registration_status
        )
    );

  v_seat_free := yogaflow_private.course_occupied_seats(v_reg.course_id)
    < COALESCE(v_course.max_participants, 0);

  IF v_not_started AND NOT v_already_booked AND v_seat_free THEN
    INSERT INTO public.registrations (
      user_id, course_id, tenant_id, status, is_waitlist, waitlist_position, coverage_status
    ) VALUES (
      v_reg.user_id, v_reg.course_id, v_reg.tenant_id,
      'registered'::public.registration_status, false, NULL,
      'paid'::public.registration_coverage_status
    )
    RETURNING id INTO v_new_reg_id;

    INSERT INTO public.payments (
      tenant_id, subject_type, subject_id, registration_id,
      provider, provider_ref, method, status,
      amount_cents, currency, received_at, recorded_by
    ) VALUES (
      v_reg.tenant_id, 'registration', v_new_reg_id, v_new_reg_id,
      'stripe'::public.payment_provider, p_provider_ref,
      'card'::public.payment_method, 'succeeded'::public.payment_status,
      p_amount_cents, upper(COALESCE(p_currency, 'EUR')),
      COALESCE(p_received_at, pg_catalog.now()), NULL
    )
    RETURNING id INTO v_payment_id;

    IF v_attempt.status IN ('initiated', 'processing') THEN
      UPDATE public.payment_attempts
      SET status = 'canceled',
          failure_code = COALESCE(failure_code, 'HOLD_EXPIRED'),
          payment_id = v_payment_id
      WHERE id = v_attempt.id;
    ELSE
      UPDATE public.payment_attempts
      SET payment_id = v_payment_id
      WHERE id = v_attempt.id;
    END IF;

    v_event_id := yogaflow_private.insert_event(
      v_reg.tenant_id, 'payment.recorded', 'payment', v_payment_id,
      pg_catalog.jsonb_build_object(
        'payment_id', v_payment_id, 'registration_id', v_new_reg_id,
        'amount_cents', p_amount_cents,
        'currency', upper(COALESCE(p_currency, 'EUR')),
        'method', 'card', 'provider', 'stripe',
        'received_at', COALESCE(p_received_at, pg_catalog.now())
      ),
      pg_catalog.gen_random_uuid()
    );

    PERFORM yogaflow_private.insert_audit(
      v_reg.tenant_id, NULL, 'payment.recorded', 'payments', v_payment_id,
      ARRAY[
        'amount_cents', 'currency', 'method', 'provider',
        'status', 'received_at', 'registration_id', 'provider_ref'
      ]::text[],
      v_event_id
    );

    PERFORM yogaflow_private.insert_event(
      v_reg.tenant_id, 'registration.restored_after_payment', 'registration', v_new_reg_id,
      pg_catalog.jsonb_build_object(
        'registration_id', v_new_reg_id,
        'payment_id', v_payment_id,
        'previous_registration_id', v_reg.id,
        'course_id', v_reg.course_id
      ),
      pg_catalog.gen_random_uuid()
    );

    v_notification_body := pg_catalog.format(
      'Zahlung für „%s“ am %s um %s bestätigt.',
      v_course.title,
      pg_catalog.to_char(v_course.date, 'DD.MM.YYYY'),
      pg_catalog.to_char(v_course.time, 'HH24:MI')
    );

    INSERT INTO public.user_notifications (
      tenant_id, user_id, type, body, course_id, action_path, metadata
    ) VALUES (
      v_reg.tenant_id, v_reg.user_id, 'payment_succeeded', v_notification_body,
      v_reg.course_id, '/my-registrations',
      pg_catalog.jsonb_build_object('payment_id', v_payment_id, 'registration_id', v_new_reg_id)
    );

    INSERT INTO public.email_deliveries (
      tenant_id, event_id, kind, registration_id, status, next_attempt_at
    ) VALUES (
      v_reg.tenant_id, v_event_id, 'payment_succeeded', v_new_reg_id, 'pending', pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
      'success', true, 'code', 'RESTORED',
      'payment_id', v_payment_id, 'registration_id', v_new_reg_id
    );
  END IF;

  IF NOT v_not_started THEN
    v_reason := 'COURSE_NOT_ACTIVE';
  ELSIF v_already_booked THEN
    v_reason := 'ALREADY_BOOKED';
  ELSE
    v_reason := 'NO_SEAT';
  END IF;

  INSERT INTO public.payments (
    tenant_id, subject_type, subject_id, registration_id,
    provider, provider_ref, method, status,
    amount_cents, currency, received_at, recorded_by
  ) VALUES (
    v_reg.tenant_id, 'registration', v_reg.id, v_reg.id,
    'stripe'::public.payment_provider, p_provider_ref,
    'card'::public.payment_method, 'succeeded'::public.payment_status,
    p_amount_cents, upper(COALESCE(p_currency, 'EUR')),
    COALESCE(p_received_at, pg_catalog.now()), NULL
  )
  RETURNING id INTO v_payment_id;

  IF v_attempt.status IN ('initiated', 'processing') THEN
    UPDATE public.payment_attempts
    SET status = 'canceled',
        failure_code = COALESCE(failure_code, 'HOLD_EXPIRED'),
        payment_id = v_payment_id
    WHERE id = v_attempt.id;
  ELSE
    UPDATE public.payment_attempts
    SET payment_id = v_payment_id
    WHERE id = v_attempt.id;
  END IF;

  v_event_id := yogaflow_private.insert_event(
    v_reg.tenant_id, 'payment.recorded', 'payment', v_payment_id,
    pg_catalog.jsonb_build_object(
      'payment_id', v_payment_id, 'registration_id', v_reg.id,
      'amount_cents', p_amount_cents,
      'currency', upper(COALESCE(p_currency, 'EUR')),
      'method', 'card', 'provider', 'stripe',
      'received_at', COALESCE(p_received_at, pg_catalog.now())
    ),
    pg_catalog.gen_random_uuid()
  );

  PERFORM yogaflow_private.insert_audit(
    v_reg.tenant_id, NULL, 'payment.recorded', 'payments', v_payment_id,
    ARRAY[
      'amount_cents', 'currency', 'method', 'provider',
      'status', 'received_at', 'registration_id', 'provider_ref'
    ]::text[],
    v_event_id
  );

  PERFORM yogaflow_private.insert_event(
    v_reg.tenant_id, 'payment.refund_required', 'payment', v_payment_id,
    pg_catalog.jsonb_build_object(
      'payment_id', v_payment_id,
      'registration_id', v_reg.id,
      'course_id', v_reg.course_id,
      'reason', v_reason
    ),
    pg_catalog.gen_random_uuid()
  );

  -- 3.2a: late_payment-Datensatz + Job mit refund_id (ersetzt direkten enqueue)
  v_refund_res := yogaflow_private.request_refund(
    v_payment_id, NULL, 'late_payment', NULL, NULL
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'code', 'REFUND_REQUIRED',
    'payment_id', v_payment_id,
    'reason', v_reason,
    'refund_id', v_refund_res -> 'refund_id',
    'refund_cents', COALESCE((v_refund_res ->> 'amount_cents')::integer, 0)
  );
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.complete_online_payment(text, integer, text, timestamptz, boolean) IS
  'Abschluss COMPLETED/RESTORED/REFUND_REQUIRED. REFUND_REQUIRED → request_refund late_payment.';

-- remove_member: siehe 20261002114100 (K7-Körper + refund_cents).

-- ---------------------------------------------------------------------------
-- 2. Backfill: 2 done refund_payment ohne refund_id → late_payment + refund_id
-- ---------------------------------------------------------------------------

DO $backfill$
DECLARE
  v_job record;
  v_pay public.payments%ROWTYPE;
  v_rev public.payments%ROWTYPE;
  v_refund_id uuid;
  n integer := 0;
BEGIN
  FOR v_job IN
    SELECT j.*
    FROM public.provider_jobs j
    WHERE j.kind = 'refund_payment'
      AND j.refund_id IS NULL
      AND j.payment_id IS NOT NULL
    ORDER BY j.created_at ASC
    FOR UPDATE
  LOOP
    SELECT * INTO v_pay FROM public.payments WHERE id = v_job.payment_id;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_rev
    FROM public.payments
    WHERE reverses_payment_id = v_pay.id
    ORDER BY created_at ASC
    LIMIT 1;

    INSERT INTO public.payment_refunds (
      tenant_id, payment_id, amount_cents, reason, status,
      provider_ref, reversal_payment_id, created_at, updated_at
    ) VALUES (
      v_job.tenant_id,
      v_pay.id,
      CASE WHEN FOUND THEN pg_catalog.abs(v_rev.amount_cents) ELSE v_pay.amount_cents END,
      'late_payment',
      CASE WHEN v_job.status = 'done' AND FOUND THEN 'succeeded' ELSE 'failed' END,
      CASE WHEN FOUND THEN v_rev.provider_ref ELSE NULL END,
      CASE WHEN FOUND THEN v_rev.id ELSE NULL END,
      v_job.created_at,
      COALESCE(v_job.done_at, v_job.updated_at, pg_catalog.now())
    )
    RETURNING id INTO v_refund_id;

    UPDATE public.provider_jobs
    SET refund_id = v_refund_id
    WHERE id = v_job.id;

    n := n + 1;
  END LOOP;

  RAISE NOTICE '3.2a backfill refund jobs: %', n;
END;
$backfill$;

DO $check$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n
  FROM public.provider_jobs
  WHERE kind = 'refund_payment' AND refund_id IS NULL;
  IF v_n > 0 THEN
    RAISE EXCEPTION '3.2a: % refund_payment ohne refund_id nach Backfill', v_n;
  END IF;
END;
$check$;

ALTER TABLE public.provider_jobs
  DROP CONSTRAINT IF EXISTS provider_jobs_kind_payload_check;

ALTER TABLE public.provider_jobs
  ADD CONSTRAINT provider_jobs_kind_payload_check CHECK (
    (kind = 'cancel_payment_intent' AND attempt_id IS NOT NULL AND payment_id IS NULL AND refund_id IS NULL)
    OR (kind = 'refund_payment' AND payment_id IS NOT NULL AND attempt_id IS NULL AND refund_id IS NOT NULL)
  );
