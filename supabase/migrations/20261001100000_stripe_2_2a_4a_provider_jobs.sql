-- 2.2a-4a — provider_jobs Outbox, Cancel/Refund-Aufträge, Haltefelder, remove_member W5
-- (nur DEV anwenden; Function payments-jobs folgt in 4b)
--
-- Rückweg (DEV):
--   DROP TRIGGER IF EXISTS payment_attempts_enqueue_cancel ON public.payment_attempts;
--   DROP FUNCTION IF EXISTS yogaflow_private.payment_attempts_enqueue_cancel();
--   SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'yogaflow_process_provider_jobs';
--   DROP FUNCTION IF EXISTS public.finish_provider_job(uuid, text, text);
--   DROP FUNCTION IF EXISTS yogaflow_private.finish_provider_job(uuid, text, text);
--   DROP FUNCTION IF EXISTS public.claim_provider_jobs(integer);
--   DROP FUNCTION IF EXISTS yogaflow_private.claim_provider_jobs(integer);
--   DROP FUNCTION IF EXISTS yogaflow_private.invoke_provider_jobs();
--   DROP FUNCTION IF EXISTS yogaflow_private.enqueue_provider_job(uuid, text, uuid, uuid);
--   DROP TABLE IF EXISTS public.provider_jobs;
--   -- complete_online_payment / remove_member / mark_online_payment_failed /
--   -- delete_tenant_complete aus 2.2a-1 / 2.1b-b wiederherstellen.



-- ===========================================================================
-- A. Tabelle provider_jobs
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.provider_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  kind text NOT NULL,
  attempt_id uuid REFERENCES public.payment_attempts (id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.payments (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  tries integer NOT NULL DEFAULT 0,
  next_run_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  done_at timestamptz,
  CONSTRAINT provider_jobs_kind_check
    CHECK (kind IN ('cancel_payment_intent', 'refund_payment')),
  CONSTRAINT provider_jobs_status_check
    CHECK (status IN ('pending', 'running', 'done', 'failed')),
  CONSTRAINT provider_jobs_tries_nonneg CHECK (tries >= 0),
  CONSTRAINT provider_jobs_kind_payload_check CHECK (
    (kind = 'cancel_payment_intent' AND attempt_id IS NOT NULL AND payment_id IS NULL)
    OR (kind = 'refund_payment' AND payment_id IS NOT NULL AND attempt_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS provider_jobs_kind_attempt_unique
  ON public.provider_jobs (kind, attempt_id)
  WHERE attempt_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS provider_jobs_kind_payment_unique
  ON public.provider_jobs (kind, payment_id)
  WHERE payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS provider_jobs_claim_idx
  ON public.provider_jobs (status, next_run_at);

COMMENT ON TABLE public.provider_jobs IS
  '2.2a-4a Outbox: Stripe-Aufträge (Cancel/Refund). Nur service_role über claim/finish.';

ALTER TABLE public.provider_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.provider_jobs FROM PUBLIC, anon, authenticated;
-- keine Policies → Client sieht nichts; Owner/service_role über DEFINER-RPCs



-- ===========================================================================
-- B. Aufträge anlegen (Helfer + Trigger + geänderte RPCs)
-- ===========================================================================

CREATE OR REPLACE FUNCTION yogaflow_private.enqueue_provider_job(
  p_tenant uuid,
  p_kind text,
  p_attempt_id uuid,
  p_payment_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF p_kind = 'cancel_payment_intent' THEN
    IF p_attempt_id IS NULL THEN
      RAISE EXCEPTION 'enqueue_provider_job: attempt_id fehlt';
    END IF;
    INSERT INTO public.provider_jobs (
      tenant_id, kind, attempt_id, payment_id, status, tries, next_run_at
    ) VALUES (
      p_tenant, 'cancel_payment_intent', p_attempt_id, NULL, 'pending', 0, pg_catalog.now()
    )
    ON CONFLICT (kind, attempt_id) WHERE attempt_id IS NOT NULL
    DO NOTHING
    RETURNING id INTO v_id;
  ELSIF p_kind = 'refund_payment' THEN
    IF p_payment_id IS NULL THEN
      RAISE EXCEPTION 'enqueue_provider_job: payment_id fehlt';
    END IF;
    INSERT INTO public.provider_jobs (
      tenant_id, kind, attempt_id, payment_id, status, tries, next_run_at
    ) VALUES (
      p_tenant, 'refund_payment', NULL, p_payment_id, 'pending', 0, pg_catalog.now()
    )
    ON CONFLICT (kind, payment_id) WHERE payment_id IS NOT NULL
    DO NOTHING
    RETURNING id INTO v_id;
  ELSE
    RAISE EXCEPTION 'enqueue_provider_job: kind %', p_kind;
  END IF;

  RETURN v_id;
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.enqueue_provider_job(uuid, text, uuid, uuid) IS
  'Legt Cancel-/Refund-Auftrag an (ON CONFLICT DO NOTHING).';

REVOKE ALL ON FUNCTION yogaflow_private.enqueue_provider_job(uuid, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION yogaflow_private.payment_attempts_enqueue_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status IN ('failed', 'canceled')
     AND NEW.provider_ref IS NOT NULL
     AND NEW.payment_id IS NULL
  THEN
    PERFORM yogaflow_private.enqueue_provider_job(
      NEW.tenant_id,
      'cancel_payment_intent',
      NEW.id,
      NULL
    );
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.payment_attempts_enqueue_cancel() IS
  'W2: Status → failed/canceled mit pi_… ohne payment_id → Cancel-Auftrag.';

DROP TRIGGER IF EXISTS payment_attempts_enqueue_cancel ON public.payment_attempts;
CREATE TRIGGER payment_attempts_enqueue_cancel
  AFTER UPDATE OF status ON public.payment_attempts
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.payment_attempts_enqueue_cancel();


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
BEGIN
  IF p_provider_ref IS NULL OR pg_catalog.btrim(p_provider_ref) = '' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ATTEMPT_NOT_FOUND');
  END IF;

  -- Idempotent: Zahlungszeile mit (stripe, ref) schon da.
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

  -- Normalfall (K4): Buchung noch pending_payment — auch bei Versuch failed/canceled.
  IF v_reg.status = 'pending_payment'::public.registration_status THEN
    INSERT INTO public.payments (
      tenant_id,
      subject_type,
      subject_id,
      registration_id,
      provider,
      provider_ref,
      method,
      status,
      amount_cents,
      currency,
      received_at,
      recorded_by
    ) VALUES (
      v_reg.tenant_id,
      'registration',
      v_reg.id,
      v_reg.id,
      'stripe'::public.payment_provider,
      p_provider_ref,
      'card'::public.payment_method,
      'succeeded'::public.payment_status,
      p_amount_cents,
      upper(COALESCE(p_currency, 'EUR')),
      COALESCE(p_received_at, pg_catalog.now()),
      NULL
    )
    RETURNING id INTO v_payment_id;

    IF v_attempt.status IN ('initiated', 'processing') THEN
      UPDATE public.payment_attempts
      SET
        status = 'succeeded',
        payment_id = v_payment_id
      WHERE id = v_attempt.id;
    ELSE
      -- failed/canceled: Status bleibt, nur payment_id (GUC).
      UPDATE public.payment_attempts
      SET payment_id = v_payment_id
      WHERE id = v_attempt.id;
    END IF;

    -- Andere aktive Versuche derselben Buchung → SUPERSEDED.
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
      -- W6: Haltefelder behalten (Verlauf)
      is_waitlist = false,
      waitlist_position = NULL
    WHERE id = v_reg.id;

    v_event_id := yogaflow_private.insert_event(
      v_reg.tenant_id,
      'payment.recorded',
      'payment',
      v_payment_id,
      pg_catalog.jsonb_build_object(
        'payment_id', v_payment_id,
        'registration_id', v_reg.id,
        'amount_cents', p_amount_cents,
        'currency', upper(COALESCE(p_currency, 'EUR')),
        'method', 'card',
        'provider', 'stripe',
        'received_at', COALESCE(p_received_at, pg_catalog.now())
      ),
      pg_catalog.gen_random_uuid()
    );

    PERFORM yogaflow_private.insert_event(
      v_reg.tenant_id,
      'registration.payment_completed',
      'registration',
      v_reg.id,
      pg_catalog.jsonb_build_object(
        'registration_id', v_reg.id,
        'payment_id', v_payment_id,
        'course_id', v_reg.course_id
      ),
      pg_catalog.gen_random_uuid()
    );

    PERFORM yogaflow_private.insert_audit(
      v_reg.tenant_id,
      NULL,
      'payment.recorded',
      'payments',
      v_payment_id,
      ARRAY[
        'amount_cents', 'currency', 'method', 'provider',
        'status', 'received_at', 'registration_id', 'provider_ref'
      ]::text[],
      v_event_id
    );

    PERFORM yogaflow_private.insert_audit(
      v_reg.tenant_id,
      NULL,
      'payment.recorded',
      'registrations',
      v_reg.id,
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
      v_reg.tenant_id,
      v_reg.user_id,
      'payment_succeeded',
      v_notification_body,
      v_reg.course_id,
      '/my-registrations',
      pg_catalog.jsonb_build_object(
        'payment_id', v_payment_id,
        'registration_id', v_reg.id
      )
    );

    INSERT INTO public.email_deliveries (
      tenant_id, event_id, kind, registration_id, status, next_attempt_at
    ) VALUES (
      v_reg.tenant_id,
      v_event_id,
      'payment_succeeded',
      v_reg.id,
      'pending',
      pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'code', 'COMPLETED',
      'payment_id', v_payment_id,
      'registration_id', v_reg.id
    );
  END IF;

  -- Spätfall C4/K4: Buchung nicht mehr pending.
  -- Versuch failed wie canceled: Zahlung verbuchen, payment_id setzen, Status bleibt.
  -- payments_immutable: registration_id/subject_id nicht nachträglich änderbar
  -- → Zahlung direkt an neue Buchung (RESTORED) bzw. alte (REFUND_REQUIRED).

  v_not_started := v_course.id IS NOT NULL
    AND v_course.status = 'active'
    AND (v_course.date + COALESCE(v_course.time, TIME '00:00:00'))
          AT TIME ZONE 'Europe/Berlin' > pg_catalog.now();

  -- Doppelzahlung auf dieselbe (schon registered) Buchung → ALREADY_BOOKED.
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
      user_id,
      course_id,
      tenant_id,
      status,
      is_waitlist,
      waitlist_position,
      coverage_status
    ) VALUES (
      v_reg.user_id,
      v_reg.course_id,
      v_reg.tenant_id,
      'registered'::public.registration_status,
      false,
      NULL,
      'paid'::public.registration_coverage_status
    )
    RETURNING id INTO v_new_reg_id;

    INSERT INTO public.payments (
      tenant_id,
      subject_type,
      subject_id,
      registration_id,
      provider,
      provider_ref,
      method,
      status,
      amount_cents,
      currency,
      received_at,
      recorded_by
    ) VALUES (
      v_reg.tenant_id,
      'registration',
      v_new_reg_id,
      v_new_reg_id,
      'stripe'::public.payment_provider,
      p_provider_ref,
      'card'::public.payment_method,
      'succeeded'::public.payment_status,
      p_amount_cents,
      upper(COALESCE(p_currency, 'EUR')),
      COALESCE(p_received_at, pg_catalog.now()),
      NULL
    )
    RETURNING id INTO v_payment_id;

    IF v_attempt.status IN ('initiated', 'processing') THEN
      UPDATE public.payment_attempts
      SET
        status = 'canceled',
        failure_code = COALESCE(failure_code, 'HOLD_EXPIRED'),
        payment_id = v_payment_id
      WHERE id = v_attempt.id;
    ELSE
      UPDATE public.payment_attempts
      SET payment_id = v_payment_id
      WHERE id = v_attempt.id;
    END IF;

    v_event_id := yogaflow_private.insert_event(
      v_reg.tenant_id,
      'payment.recorded',
      'payment',
      v_payment_id,
      pg_catalog.jsonb_build_object(
        'payment_id', v_payment_id,
        'registration_id', v_new_reg_id,
        'amount_cents', p_amount_cents,
        'currency', upper(COALESCE(p_currency, 'EUR')),
        'method', 'card',
        'provider', 'stripe',
        'received_at', COALESCE(p_received_at, pg_catalog.now())
      ),
      pg_catalog.gen_random_uuid()
    );

    PERFORM yogaflow_private.insert_audit(
      v_reg.tenant_id,
      NULL,
      'payment.recorded',
      'payments',
      v_payment_id,
      ARRAY[
        'amount_cents', 'currency', 'method', 'provider',
        'status', 'received_at', 'registration_id', 'provider_ref'
      ]::text[],
      v_event_id
    );

    PERFORM yogaflow_private.insert_event(
      v_reg.tenant_id,
      'registration.restored_after_payment',
      'registration',
      v_new_reg_id,
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
      v_reg.tenant_id,
      v_reg.user_id,
      'payment_succeeded',
      v_notification_body,
      v_reg.course_id,
      '/my-registrations',
      pg_catalog.jsonb_build_object(
        'payment_id', v_payment_id,
        'registration_id', v_new_reg_id
      )
    );

    INSERT INTO public.email_deliveries (
      tenant_id, event_id, kind, registration_id, status, next_attempt_at
    ) VALUES (
      v_reg.tenant_id,
      v_event_id,
      'payment_succeeded',
      v_new_reg_id,
      'pending',
      pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'code', 'RESTORED',
      'payment_id', v_payment_id,
      'registration_id', v_new_reg_id
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
    tenant_id,
    subject_type,
    subject_id,
    registration_id,
    provider,
    provider_ref,
    method,
    status,
    amount_cents,
    currency,
    received_at,
    recorded_by
  ) VALUES (
    v_reg.tenant_id,
    'registration',
    v_reg.id,
    v_reg.id,
    'stripe'::public.payment_provider,
    p_provider_ref,
    'card'::public.payment_method,
    'succeeded'::public.payment_status,
    p_amount_cents,
    upper(COALESCE(p_currency, 'EUR')),
    COALESCE(p_received_at, pg_catalog.now()),
    NULL
  )
  RETURNING id INTO v_payment_id;

  IF v_attempt.status IN ('initiated', 'processing') THEN
    UPDATE public.payment_attempts
    SET
      status = 'canceled',
      failure_code = COALESCE(failure_code, 'HOLD_EXPIRED'),
      payment_id = v_payment_id
    WHERE id = v_attempt.id;
  ELSE
    UPDATE public.payment_attempts
    SET payment_id = v_payment_id
    WHERE id = v_attempt.id;
  END IF;

  v_event_id := yogaflow_private.insert_event(
    v_reg.tenant_id,
    'payment.recorded',
    'payment',
    v_payment_id,
    pg_catalog.jsonb_build_object(
      'payment_id', v_payment_id,
      'registration_id', v_reg.id,
      'amount_cents', p_amount_cents,
      'currency', upper(COALESCE(p_currency, 'EUR')),
      'method', 'card',
      'provider', 'stripe',
      'received_at', COALESCE(p_received_at, pg_catalog.now())
    ),
    pg_catalog.gen_random_uuid()
  );

  PERFORM yogaflow_private.insert_audit(
    v_reg.tenant_id,
    NULL,
    'payment.recorded',
    'payments',
    v_payment_id,
    ARRAY[
      'amount_cents', 'currency', 'method', 'provider',
      'status', 'received_at', 'registration_id', 'provider_ref'
    ]::text[],
    v_event_id
  );

  PERFORM yogaflow_private.insert_event(
    v_reg.tenant_id,
    'payment.refund_required',
    'payment',
    v_payment_id,
    pg_catalog.jsonb_build_object(
      'payment_id', v_payment_id,
      'registration_id', v_reg.id,
      'course_id', v_reg.course_id,
      'reason', v_reason
    ),
    pg_catalog.gen_random_uuid()
  );

  -- W3: Erstattung in derselben Transaktion anstoßen
  PERFORM yogaflow_private.enqueue_provider_job(
    v_reg.tenant_id,
    'refund_payment',
    NULL,
    v_payment_id
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'code', 'REFUND_REQUIRED',
    'payment_id', v_payment_id,
    'reason', v_reason
  );
END;
$function$;


COMMENT ON FUNCTION yogaflow_private.complete_online_payment(text, integer, text, timestamptz, boolean) IS
  'Abschluss COMPLETED/RESTORED/REFUND_REQUIRED/ALREADY_COMPLETED. W6 Holds; W3 refund job; SUPERSEDED → Cancel-Job.';

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
  ) OR EXISTS (
    -- W5: Versuch mit Stripe-Referenz → anonymisieren, nie löschen
    SELECT 1
    FROM public.payment_attempts a
    JOIN public.registrations r ON r.id = a.registration_id
    WHERE r.user_id = v_target.id
      AND a.provider_ref IS NOT NULL
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
      AND a.provider_ref IS NULL
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
      AND a.provider_ref IS NULL
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
  'Entfernt Profil. W5: pi_… → anonymized; Attempts mit provider_ref nie löschen.';

REVOKE ALL ON FUNCTION public.remove_member(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_member(uuid) TO authenticated;

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
    DELETE FROM public.provider_jobs WHERE tenant_id = p_tenant_id;
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
  'Löscht Mandanten inkl. provider_jobs (2.2a-4a). Nur postgres/service_role.';

REVOKE ALL ON FUNCTION public.delete_tenant_complete(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tenant_complete(uuid)
  TO postgres, service_role;


-- mark_online_payment_failed: Stripe-canceled → Status canceled (W2)
DROP FUNCTION IF EXISTS public.mark_online_payment_failed(text, text);
DROP FUNCTION IF EXISTS yogaflow_private.mark_online_payment_failed(text, text);

CREATE OR REPLACE FUNCTION yogaflow_private.mark_online_payment_failed(
  p_provider_ref text,
  p_failure_code text,
  p_status text DEFAULT 'failed'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_attempt public.payment_attempts%ROWTYPE;
  v_code text;
  v_status text;
BEGIN
  IF p_provider_ref IS NULL OR pg_catalog.btrim(p_provider_ref) = '' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ATTEMPT_NOT_FOUND');
  END IF;

  SELECT * INTO v_attempt
  FROM public.payment_attempts
  WHERE provider = 'stripe'::public.payment_provider
    AND provider_ref = p_provider_ref
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ATTEMPT_NOT_FOUND');
  END IF;

  IF v_attempt.status IN ('failed', 'canceled', 'succeeded') THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'status', v_attempt.status,
      'attempt_id', v_attempt.id
    );
  END IF;

  v_code := CASE
    WHEN p_failure_code ~ '^[A-Z_]{3,64}$' THEN p_failure_code
    ELSE 'PAYMENT_FAILED'
  END;

  v_status := CASE
    WHEN COALESCE(p_status, 'failed') = 'canceled' THEN 'canceled'
    WHEN v_code = 'CANCELED' THEN 'canceled'
    ELSE 'failed'
  END;

  PERFORM yogaflow_private.set_payment_attempt_status(
    v_attempt.id, v_status, v_code, NULL
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'status', v_status,
    'attempt_id', v_attempt.id,
    'failure_code', v_code
  );
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.mark_online_payment_failed(text, text, text) IS
  'Versuch failed oder canceled (p_status / Code CANCELED). W2 erzeugt Cancel-Job.';

REVOKE ALL ON FUNCTION yogaflow_private.mark_online_payment_failed(text, text, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_online_payment_failed(
  p_provider_ref text,
  p_failure_code text,
  p_status text DEFAULT 'failed'
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT yogaflow_private.mark_online_payment_failed(p_provider_ref, p_failure_code, p_status);
$function$;

REVOKE ALL ON FUNCTION public.mark_online_payment_failed(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_online_payment_failed(text, text, text)
  TO service_role;



-- ===========================================================================
-- C. Abholen / Abschließen / Cron (service_role)
-- ===========================================================================

CREATE OR REPLACE FUNCTION yogaflow_private.claim_provider_jobs(p_limit integer)
RETURNS TABLE (
  job_id uuid,
  kind text,
  tenant_id uuid,
  account_ref text,
  provider_ref text,
  payment_id uuid,
  amount_cents integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_limit integer := GREATEST(COALESCE(p_limit, 0), 0);
  v_job public.provider_jobs%ROWTYPE;
  v_account text;
  v_pref text;
  v_amount integer;
BEGIN
  IF v_limit = 0 THEN
    RETURN;
  END IF;

  FOR v_job IN
    SELECT j.*
    FROM public.provider_jobs j
    WHERE (
        j.status = 'pending'
        AND j.next_run_at <= pg_catalog.now()
      )
      OR (
        j.status = 'running'
        AND j.updated_at < pg_catalog.now() - interval '10 minutes'
      )
    ORDER BY j.next_run_at ASC, j.id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  LOOP
    UPDATE public.provider_jobs
    SET
      status = 'running',
      tries = tries + 1,
      updated_at = pg_catalog.now()
    WHERE id = v_job.id
    RETURNING * INTO v_job;

    SELECT pa.provider_ref
      INTO v_account
    FROM public.provider_accounts pa
    WHERE pa.tenant_id = v_job.tenant_id
      AND pa.provider = 'stripe'::public.payment_provider
      AND pa.disconnected_at IS NULL
      AND pa.onboarding_status = 'active'
    ORDER BY pa.created_at DESC NULLS LAST
    LIMIT 1;

    v_pref := NULL;
    v_amount := NULL;

    IF v_job.kind = 'cancel_payment_intent' THEN
      SELECT a.provider_ref INTO v_pref
      FROM public.payment_attempts a
      WHERE a.id = v_job.attempt_id;
    ELSIF v_job.kind = 'refund_payment' THEN
      SELECT p.provider_ref, p.amount_cents
        INTO v_pref, v_amount
      FROM public.payments p
      WHERE p.id = v_job.payment_id;
    END IF;

    job_id := v_job.id;
    kind := v_job.kind;
    tenant_id := v_job.tenant_id;
    account_ref := v_account;
    provider_ref := v_pref;
    payment_id := v_job.payment_id;
    amount_cents := v_amount;
    RETURN NEXT;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.claim_provider_jobs(integer) IS
  'Holt fällige provider_jobs (SKIP LOCKED, W4). Nur service_role.';

REVOKE ALL ON FUNCTION yogaflow_private.claim_provider_jobs(integer)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_provider_jobs(p_limit integer)
RETURNS TABLE (
  job_id uuid,
  kind text,
  tenant_id uuid,
  account_ref text,
  provider_ref text,
  payment_id uuid,
  amount_cents integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT * FROM yogaflow_private.claim_provider_jobs(p_limit);
$function$;

REVOKE ALL ON FUNCTION public.claim_provider_jobs(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_provider_jobs(integer) TO service_role;

CREATE OR REPLACE FUNCTION yogaflow_private.finish_provider_job(
  p_job_id uuid,
  p_outcome text,
  p_error_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_job public.provider_jobs%ROWTYPE;
  v_delay interval;
BEGIN
  IF p_job_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  SELECT * INTO v_job
  FROM public.provider_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF p_outcome = 'done' THEN
    UPDATE public.provider_jobs
    SET
      status = 'done',
      done_at = pg_catalog.now(),
      last_error_code = NULL,
      updated_at = pg_catalog.now()
    WHERE id = p_job_id;
    RETURN pg_catalog.jsonb_build_object('success', true, 'status', 'done');
  END IF;

  IF p_outcome = 'failed'
     OR (p_outcome = 'retry' AND v_job.tries >= 10)
  THEN
    UPDATE public.provider_jobs
    SET
      status = 'failed',
      done_at = pg_catalog.now(),
      last_error_code = COALESCE(NULLIF(btrim(p_error_code), ''), 'FAILED'),
      updated_at = pg_catalog.now()
    WHERE id = p_job_id;
    RAISE LOG 'provider_job.failed job_id=% kind=% code=%',
      p_job_id, v_job.kind, COALESCE(NULLIF(btrim(p_error_code), ''), 'FAILED');
    RETURN pg_catalog.jsonb_build_object('success', true, 'status', 'failed');
  END IF;

  IF p_outcome = 'retry' THEN
    v_delay := CASE v_job.tries
      WHEN 1 THEN interval '1 minute'
      WHEN 2 THEN interval '5 minutes'
      WHEN 3 THEN interval '15 minutes'
      WHEN 4 THEN interval '60 minutes'
      ELSE interval '60 minutes'
    END;
    UPDATE public.provider_jobs
    SET
      status = 'pending',
      next_run_at = pg_catalog.now() + v_delay,
      last_error_code = NULLIF(btrim(p_error_code), ''),
      updated_at = pg_catalog.now()
    WHERE id = p_job_id;
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'status', 'pending',
      'next_run_at', pg_catalog.now() + v_delay
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_OUTCOME');
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.finish_provider_job(uuid, text, text) IS
  'done | retry (W4 Backoff) | failed. Bei failed: RAISE LOG.';

REVOKE ALL ON FUNCTION yogaflow_private.finish_provider_job(uuid, text, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.finish_provider_job(
  p_job_id uuid,
  p_outcome text,
  p_error_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT yogaflow_private.finish_provider_job(p_job_id, p_outcome, p_error_code);
$function$;

REVOKE ALL ON FUNCTION public.finish_provider_job(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_provider_job(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION yogaflow_private.invoke_provider_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_url text;
  v_secret text;
  v_due boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.provider_jobs j
    WHERE (
        j.status = 'pending'
        AND j.next_run_at <= pg_catalog.now()
      )
      OR (
        j.status = 'running'
        AND j.updated_at < pg_catalog.now() - interval '10 minutes'
      )
  ) INTO v_due;

  IF NOT v_due THEN
    RETURN;
  END IF;

  SELECT ds.decrypted_secret INTO v_url
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'provider_jobs_url';

  SELECT ds.decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'provider_jobs_secret';

  IF v_url IS NULL OR btrim(v_url) = ''
     OR v_secret IS NULL OR btrim(v_secret) = ''
  THEN
    RAISE LOG 'provider_jobs: Vault-Eintrag fehlt (provider_jobs_url/secret)';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := btrim(v_url),
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || btrim(v_secret)
    ),
    body := '{}'::jsonb
  );
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.invoke_provider_jobs() IS
  'Ruft payments-jobs per pg_net, wenn fällige Aufträge da sind. Vault optional.';

REVOKE ALL ON FUNCTION yogaflow_private.invoke_provider_jobs()
  FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT jobid FROM cron.job WHERE jobname = 'yogaflow_process_provider_jobs'
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
  PERFORM cron.schedule(
    'yogaflow_process_provider_jobs',
    '* * * * *',
    $cron$SELECT yogaflow_private.invoke_provider_jobs();$cron$
  );
END;
$$;



-- ===========================================================================
-- Selbstprüfung
-- ===========================================================================

DO $$
DECLARE
  v_n integer;
  v_def text;
BEGIN
  IF to_regclass('public.provider_jobs') IS NULL THEN
    RAISE EXCEPTION '2.2a-4a: provider_jobs fehlt';
  END IF;

  SELECT count(*) INTO v_n FROM cron.job WHERE jobname = 'yogaflow_process_provider_jobs';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '2.2a-4a: Cron yogaflow_process_provider_jobs count=%', v_n;
  END IF;

  SELECT pg_get_functiondef('yogaflow_private.complete_online_payment(text,integer,text,timestamptz,boolean)'::regprocedure)
    INTO v_def;
  IF position('hold_expires_at = NULL' in v_def) > 0 THEN
    RAISE EXCEPTION '2.2a-4a: COMPLETED leert noch Haltefelder';
  END IF;
  IF position('enqueue_provider_job' in v_def) = 0 THEN
    RAISE EXCEPTION '2.2a-4a: complete ohne refund enqueue';
  END IF;

  SELECT pg_get_functiondef('public.remove_member(uuid)'::regprocedure) INTO v_def;
  IF position('provider_ref IS NOT NULL' in v_def) = 0 THEN
    RAISE EXCEPTION '2.2a-4a: remove_member ohne W5';
  END IF;

  IF has_table_privilege('authenticated', 'public.provider_jobs', 'SELECT')
     OR has_table_privilege('anon', 'public.provider_jobs', 'SELECT')
  THEN
    RAISE EXCEPTION '2.2a-4a: Client darf provider_jobs lesen';
  END IF;

  IF has_function_privilege('authenticated', 'public.claim_provider_jobs(integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.claim_provider_jobs(integer)', 'EXECUTE')
  THEN
    RAISE EXCEPTION '2.2a-4a: claim_provider_jobs für Client';
  END IF;

  IF has_function_privilege('authenticated', 'public.finish_provider_job(uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.finish_provider_job(uuid,text,text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION '2.2a-4a: finish_provider_job für Client';
  END IF;
END;
$$;
