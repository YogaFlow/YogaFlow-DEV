-- 3.2a — Kern: request_refund, record_online_refund (neue Signatur), mark_refund_failed,
-- Disputes, manuelle RPC, Lesen, enqueue/claim mit refund_id.
-- allow: enqueue_provider_job,claim_provider_jobs,request_refund,request_online_refunds_for_registration,refund_cents_this_xact,record_online_refund,mark_refund_failed,record_payment_dispute,request_payment_refund,get_payment_refunds,get_registration_refund_summary
--
-- Rückweg: DROP neuer Funktionen; enqueue/claim aus 20261001100000 wiederherstellen;
-- record_online_refund 4-Arg-Signatur aus 20260930100000.

-- ---------------------------------------------------------------------------
-- 1. enqueue_provider_job — refund_payment braucht refund_id
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS yogaflow_private.enqueue_provider_job(uuid, text, uuid, uuid);

CREATE OR REPLACE FUNCTION yogaflow_private.enqueue_provider_job(
  p_tenant uuid,
  p_kind text,
  p_attempt_id uuid,
  p_payment_id uuid,
  p_refund_id uuid DEFAULT NULL
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
      tenant_id, kind, attempt_id, payment_id, refund_id, status, tries, next_run_at
    ) VALUES (
      p_tenant, 'cancel_payment_intent', p_attempt_id, NULL, NULL, 'pending', 0, pg_catalog.now()
    )
    ON CONFLICT (kind, attempt_id) WHERE attempt_id IS NOT NULL
    DO NOTHING
    RETURNING id INTO v_id;
  ELSIF p_kind = 'refund_payment' THEN
    IF p_payment_id IS NULL OR p_refund_id IS NULL THEN
      RAISE EXCEPTION 'enqueue_provider_job: payment_id/refund_id fehlt';
    END IF;
    INSERT INTO public.provider_jobs (
      tenant_id, kind, attempt_id, payment_id, refund_id, status, tries, next_run_at
    ) VALUES (
      p_tenant, 'refund_payment', NULL, p_payment_id, p_refund_id, 'pending', 0, pg_catalog.now()
    )
    ON CONFLICT (kind, refund_id) WHERE refund_id IS NOT NULL
    DO NOTHING
    RETURNING id INTO v_id;
  ELSE
    RAISE EXCEPTION 'enqueue_provider_job: kind %', p_kind;
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.enqueue_provider_job(uuid, text, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. claim_provider_jobs — refund_id + Betrag aus payment_refunds
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.claim_provider_jobs(integer);
DROP FUNCTION IF EXISTS yogaflow_private.claim_provider_jobs(integer);

CREATE OR REPLACE FUNCTION yogaflow_private.claim_provider_jobs(p_limit integer)
RETURNS TABLE(
  job_id uuid,
  kind text,
  tenant_id uuid,
  account_ref text,
  provider_ref text,
  payment_id uuid,
  refund_id uuid,
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
      SELECT p.provider_ref INTO v_pref
      FROM public.payments p
      WHERE p.id = v_job.payment_id;
      SELECT r.amount_cents INTO v_amount
      FROM public.payment_refunds r
      WHERE r.id = v_job.refund_id;
    END IF;

    job_id := v_job.id;
    kind := v_job.kind;
    tenant_id := v_job.tenant_id;
    account_ref := v_account;
    provider_ref := v_pref;
    payment_id := v_job.payment_id;
    refund_id := v_job.refund_id;
    amount_cents := v_amount;
    RETURN NEXT;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_provider_jobs(p_limit integer DEFAULT 20)
RETURNS TABLE(
  job_id uuid,
  kind text,
  tenant_id uuid,
  account_ref text,
  provider_ref text,
  payment_id uuid,
  refund_id uuid,
  amount_cents integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
  SELECT * FROM yogaflow_private.claim_provider_jobs(p_limit);
$fn$;

REVOKE ALL ON FUNCTION yogaflow_private.claim_provider_jobs(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_provider_jobs(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_provider_jobs(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. request_refund
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.request_refund(
  p_payment_id uuid,
  p_amount_cents integer,
  p_reason text,
  p_requested_by uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_pay public.payments%ROWTYPE;
  v_spent integer;
  v_remaining integer;
  v_amount integer;
  v_refund_id uuid;
  v_note text;
BEGIN
  IF p_reason IS NULL OR p_reason NOT IN (
    'course_cancelled', 'self_cancel_in_window', 'staff_unregister',
    'member_removed', 'late_payment', 'manual', 'provider_dashboard'
  ) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_REASON');
  END IF;

  SELECT * INTO v_pay
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_pay.provider IS DISTINCT FROM 'stripe'::public.payment_provider
     OR v_pay.method IS DISTINCT FROM 'card'::public.payment_method
     OR v_pay.reverses_payment_id IS NOT NULL
     OR v_pay.amount_cents <= 0
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  SELECT COALESCE(pg_catalog.sum(r.amount_cents), 0)::integer
    INTO v_spent
  FROM public.payment_refunds r
  WHERE r.payment_id = v_pay.id
    AND r.status IS DISTINCT FROM 'failed';

  v_remaining := v_pay.amount_cents - v_spent;
  IF v_remaining <= 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'code', 'NOTHING_TO_REFUND',
      'remaining_cents', 0
    );
  END IF;

  v_amount := COALESCE(p_amount_cents, v_remaining);
  IF v_amount <= 0 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
  END IF;
  IF v_amount > v_remaining THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error', 'AMOUNT_EXCEEDS_REMAINING',
      'remaining_cents', v_remaining
    );
  END IF;

  v_note := NULLIF(pg_catalog.btrim(COALESCE(p_note, '')), '');
  IF p_reason = 'manual' AND v_note IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOTE_REQUIRED');
  END IF;
  IF p_reason IS DISTINCT FROM 'manual' THEN
    v_note := NULL;
  END IF;

  INSERT INTO public.payment_refunds (
    tenant_id, payment_id, amount_cents, reason, note, requested_by, status
  ) VALUES (
    v_pay.tenant_id, v_pay.id, v_amount, p_reason, v_note, p_requested_by, 'pending'
  )
  RETURNING id INTO v_refund_id;

  PERFORM yogaflow_private.enqueue_provider_job(
    v_pay.tenant_id, 'refund_payment', NULL, v_pay.id, v_refund_id
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'code', 'REQUESTED',
    'refund_id', v_refund_id,
    'amount_cents', v_amount,
    'remaining_cents', v_remaining - v_amount
  );
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.request_refund(uuid, integer, text, uuid, text) IS
  'Legt payment_refunds pending + provider_jobs refund_payment an. Rest = Betrag − Summe status≠failed.';

REVOKE ALL ON FUNCTION yogaflow_private.request_refund(uuid, integer, text, uuid, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION yogaflow_private.request_online_refunds_for_registration(
  p_registration_id uuid,
  p_reason text,
  p_requested_by uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_pay record;
  v_res jsonb;
  v_sum integer := 0;
BEGIN
  FOR v_pay IN
    SELECT p.id
    FROM public.payments p
    WHERE p.registration_id = p_registration_id
      AND p.provider = 'stripe'::public.payment_provider
      AND p.method = 'card'::public.payment_method
      AND p.amount_cents > 0
      AND p.reverses_payment_id IS NULL
      AND p.status = 'succeeded'::public.payment_status
    ORDER BY p.created_at ASC, p.id ASC
    FOR UPDATE
  LOOP
    v_res := yogaflow_private.request_refund(
      v_pay.id, NULL, p_reason, p_requested_by, NULL
    );
    IF COALESCE(v_res ->> 'success', 'false') = 'true'
       AND v_res ->> 'code' = 'REQUESTED'
    THEN
      v_sum := v_sum + COALESCE((v_res ->> 'amount_cents')::integer, 0);
    END IF;
  END LOOP;
  RETURN v_sum;
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.request_online_refunds_for_registration(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION yogaflow_private.refund_cents_this_xact(
  p_tenant_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO ''
AS $fn$
  SELECT COALESCE(pg_catalog.sum(r.amount_cents), 0)::integer
  FROM public.payment_refunds r
  WHERE r.tenant_id = p_tenant_id
    AND r.created_at >= pg_catalog.transaction_timestamp()
    AND r.status IS DISTINCT FROM 'failed'
    AND (p_reason IS NULL OR r.reason = p_reason);
$fn$;

REVOKE ALL ON FUNCTION yogaflow_private.refund_cents_this_xact(uuid, text)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. record_online_refund — neue Signatur (DROP alt)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.record_online_refund(uuid, text, integer, timestamptz);
DROP FUNCTION IF EXISTS yogaflow_private.record_online_refund(uuid, text, integer, timestamptz);

CREATE OR REPLACE FUNCTION yogaflow_private.record_online_refund(
  p_payment_id uuid,
  p_refund_ref text,
  p_amount_cents integer,
  p_received_at timestamptz,
  p_refund_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_orig public.payments%ROWTYPE;
  v_existing public.payments%ROWTYPE;
  v_refund public.payment_refunds%ROWTYPE;
  v_reg public.registrations%ROWTYPE;
  v_course public.courses%ROWTYPE;
  v_new_id uuid;
  v_amount integer;
  v_event_id uuid;
  v_notification_body text;
  v_sum_rev integer;
BEGIN
  IF p_refund_ref IS NULL OR pg_catalog.btrim(p_refund_ref) = '' OR p_refund_ref !~ '^re_' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_REF');
  END IF;

  -- Idempotenz über re_…
  SELECT * INTO v_existing
  FROM public.payments
  WHERE provider = 'stripe'::public.payment_provider
    AND provider_ref = p_refund_ref
  LIMIT 1;

  IF FOUND THEN
    SELECT * INTO v_refund
    FROM public.payment_refunds
    WHERE provider_ref = p_refund_ref
    LIMIT 1;
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'code', 'ALREADY_REFUNDED',
      'payment_id', v_existing.id,
      'refund_id', v_refund.id
    );
  END IF;

  SELECT * INTO v_orig
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_orig.provider IS DISTINCT FROM 'stripe'::public.payment_provider
     OR v_orig.reverses_payment_id IS NOT NULL
     OR v_orig.amount_cents <= 0
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  -- Refund-Datensatz auflösen
  IF p_refund_id IS NOT NULL THEN
    SELECT * INTO v_refund
    FROM public.payment_refunds
    WHERE id = p_refund_id
    FOR UPDATE;
    IF NOT FOUND OR v_refund.payment_id IS DISTINCT FROM v_orig.id THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
    END IF;
  ELSE
    SELECT * INTO v_refund
    FROM public.payment_refunds
    WHERE provider_ref = p_refund_ref
    FOR UPDATE;
    IF NOT FOUND THEN
      -- Offener Auto-Auftrag (Edge 3.2a noch ohne refund_id): eine pending-Zeile
      SELECT * INTO v_refund
      FROM public.payment_refunds
      WHERE payment_id = v_orig.id
        AND status = 'pending'
      ORDER BY created_at ASC, id ASC
      LIMIT 1
      FOR UPDATE;
    END IF;
    IF NOT FOUND THEN
      -- R5 Dashboard: neuen Datensatz anlegen
      v_amount := GREATEST(COALESCE(p_amount_cents, 0), 0);
      IF v_amount <= 0 THEN
        RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
      END IF;
      INSERT INTO public.payment_refunds (
        tenant_id, payment_id, amount_cents, reason, status
      ) VALUES (
        v_orig.tenant_id, v_orig.id, v_amount, 'provider_dashboard', 'pending'
      )
      RETURNING * INTO v_refund;
    END IF;
  END IF;

  IF v_refund.status = 'succeeded' AND v_refund.reversal_payment_id IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'code', 'ALREADY_REFUNDED',
      'payment_id', v_refund.reversal_payment_id,
      'refund_id', v_refund.id
    );
  END IF;

  v_amount := COALESCE(NULLIF(p_amount_cents, 0), v_refund.amount_cents);
  IF v_amount <= 0 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
  END IF;

  -- Harte Summenprüfung Stripe-Gegenzeilen
  SELECT COALESCE(pg_catalog.sum(-p.amount_cents), 0)::integer
    INTO v_sum_rev
  FROM public.payments p
  WHERE p.reverses_payment_id = v_orig.id;

  IF v_sum_rev + v_amount > v_orig.amount_cents THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'AMOUNT_EXCEEDS_REMAINING');
  END IF;

  INSERT INTO public.payments (
    tenant_id, subject_type, subject_id, registration_id,
    provider, provider_ref, method, status,
    amount_cents, currency, reverses_payment_id, received_at, recorded_by
  ) VALUES (
    v_orig.tenant_id, v_orig.subject_type, v_orig.subject_id, v_orig.registration_id,
    'stripe'::public.payment_provider, p_refund_ref, v_orig.method,
    'succeeded'::public.payment_status,
    -v_amount, v_orig.currency, v_orig.id,
    COALESCE(p_received_at, pg_catalog.now()), NULL
  )
  RETURNING id INTO v_new_id;

  UPDATE public.payment_refunds
  SET
    status = 'succeeded',
    provider_ref = p_refund_ref,
    amount_cents = v_amount,
    reversal_payment_id = v_new_id,
    failure_code = NULL,
    updated_at = pg_catalog.now()
  WHERE id = v_refund.id;

  v_event_id := yogaflow_private.insert_event(
    v_orig.tenant_id,
    'payment.reversed',
    'payment',
    v_new_id,
    pg_catalog.jsonb_build_object(
      'payment_id', v_new_id,
      'registration_id', v_orig.registration_id,
      'amount_cents', -v_amount,
      'currency', v_orig.currency,
      'method', v_orig.method::text,
      'provider', 'stripe',
      'received_at', COALESCE(p_received_at, pg_catalog.now()),
      'reverses_payment_id', v_orig.id,
      'refund_id', v_refund.id,
      'reason', v_refund.reason
    ),
    pg_catalog.gen_random_uuid()
  );

  PERFORM yogaflow_private.insert_audit(
    v_orig.tenant_id,
    NULL,
    'payment.reversed',
    'payments',
    v_new_id,
    ARRAY[
      'amount_cents', 'method', 'status', 'reverses_payment_id',
      'received_at', 'provider_ref'
    ]::text[],
    v_event_id
  );

  IF v_orig.registration_id IS NOT NULL THEN
    SELECT * INTO v_reg FROM public.registrations WHERE id = v_orig.registration_id;
    IF v_reg.id IS NOT NULL THEN
      SELECT * INTO v_course FROM public.courses WHERE id = v_reg.course_id;
      IF v_course.id IS NOT NULL THEN
        v_notification_body := pg_catalog.format(
          'Erstattung über %s,%s € für „%s“ am %s um %s ist unterwegs.',
          (v_amount / 100)::text,
          lpad((v_amount % 100)::text, 2, '0'),
          v_course.title,
          pg_catalog.to_char(v_course.date, 'DD.MM.YYYY'),
          pg_catalog.to_char(v_course.time, 'HH24:MI')
        );

        INSERT INTO public.user_notifications (
          tenant_id, user_id, type, body, course_id, action_path, metadata
        ) VALUES (
          v_orig.tenant_id,
          v_reg.user_id,
          'payment_refunded',
          v_notification_body,
          v_reg.course_id,
          '/my-registrations',
          pg_catalog.jsonb_build_object(
            'payment_id', v_new_id,
            'reverses_payment_id', v_orig.id,
            'refund_id', v_refund.id,
            'amount_cents', v_amount,
            'reason', v_refund.reason
          )
        );
      END IF;
    END IF;

    INSERT INTO public.email_deliveries (
      tenant_id, event_id, kind, registration_id, status, next_attempt_at
    ) VALUES (
      v_orig.tenant_id,
      v_event_id,
      'payment_refunded',
      v_orig.registration_id,
      'pending',
      pg_catalog.now()
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'code', 'REFUNDED',
    'payment_id', v_new_id,
    'refund_id', v_refund.id,
    'amount_cents', -v_amount
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_online_refund(
  p_payment_id uuid,
  p_refund_ref text,
  p_amount_cents integer,
  p_received_at timestamptz,
  p_refund_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
  SELECT yogaflow_private.record_online_refund(
    p_payment_id, p_refund_ref, p_amount_cents, p_received_at, p_refund_id
  );
$fn$;

REVOKE ALL ON FUNCTION yogaflow_private.record_online_refund(uuid, text, integer, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_online_refund(uuid, text, integer, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_online_refund(uuid, text, integer, timestamptz, uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 5. mark_refund_failed (R7)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.mark_refund_failed(
  p_refund_id uuid,
  p_refund_ref text,
  p_failure_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_refund public.payment_refunds%ROWTYPE;
  v_pay public.payments%ROWTYPE;
  v_body text;
BEGIN
  IF p_refund_id IS NOT NULL THEN
    SELECT * INTO v_refund FROM public.payment_refunds WHERE id = p_refund_id FOR UPDATE;
  ELSIF p_refund_ref IS NOT NULL THEN
    SELECT * INTO v_refund FROM public.payment_refunds WHERE provider_ref = p_refund_ref FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_refund.status = 'succeeded' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ALREADY_SUCCEEDED');
  END IF;

  UPDATE public.payment_refunds
  SET
    status = 'failed',
    failure_code = COALESCE(NULLIF(pg_catalog.btrim(p_failure_code), ''), 'REFUND_FAILED'),
    provider_ref = COALESCE(v_refund.provider_ref, NULLIF(pg_catalog.btrim(p_refund_ref), '')),
    updated_at = pg_catalog.now()
  WHERE id = v_refund.id
  RETURNING * INTO v_refund;

  SELECT * INTO v_pay FROM public.payments WHERE id = v_refund.payment_id;

  v_body := pg_catalog.format(
    'Eine Erstattung über %s,%s € ist fehlgeschlagen. Du kannst sie erneut anstoßen.',
    (v_refund.amount_cents / 100)::text,
    lpad((v_refund.amount_cents % 100)::text, 2, '0')
  );

  INSERT INTO public.user_notifications (
    tenant_id, user_id, type, body, course_id, action_path, metadata
  )
  SELECT
    v_refund.tenant_id,
    u.id,
    'payment_refund_failed',
    v_body,
    NULL,
    '/open-payments',
    pg_catalog.jsonb_build_object(
      'refund_id', v_refund.id,
      'payment_id', v_refund.payment_id,
      'failure_code', v_refund.failure_code,
      'for_managers', true
    )
  FROM public.users u
  WHERE u.tenant_id = v_refund.tenant_id
    AND u.role IN ('owner', 'admin')
    AND u.anonymized_at IS NULL;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'code', 'FAILED',
    'refund_id', v_refund.id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_refund_failed(
  p_refund_id uuid DEFAULT NULL,
  p_refund_ref text DEFAULT NULL,
  p_failure_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
  SELECT yogaflow_private.mark_refund_failed(p_refund_id, p_refund_ref, p_failure_code);
$fn$;

REVOKE ALL ON FUNCTION yogaflow_private.mark_refund_failed(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_refund_failed(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_refund_failed(uuid, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Disputes (R6)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.record_payment_dispute(
  p_payment_id uuid,
  p_provider_ref text,
  p_amount_cents integer,
  p_status text DEFAULT 'needs_response'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_pay public.payments%ROWTYPE;
  v_row public.payment_disputes%ROWTYPE;
  v_new boolean := false;
  v_event_id uuid;
  v_body text;
BEGIN
  IF p_provider_ref IS NULL OR p_provider_ref !~ '^dp_' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_REF');
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
  END IF;

  SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND OR v_pay.provider IS DISTINCT FROM 'stripe'::public.payment_provider THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  SELECT * INTO v_row
  FROM public.payment_disputes
  WHERE provider_ref = p_provider_ref
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.payment_disputes
    SET
      status = COALESCE(NULLIF(pg_catalog.btrim(p_status), ''), status),
      amount_cents = p_amount_cents,
      updated_at = pg_catalog.now()
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  ELSE
    v_new := true;
    INSERT INTO public.payment_disputes (
      tenant_id, payment_id, provider_ref, status, amount_cents
    ) VALUES (
      v_pay.tenant_id, v_pay.id, p_provider_ref,
      COALESCE(NULLIF(pg_catalog.btrim(p_status), ''), 'needs_response'),
      p_amount_cents
    )
    RETURNING * INTO v_row;
  END IF;

  v_event_id := yogaflow_private.insert_event(
    v_pay.tenant_id,
    'payment.disputed',
    'payment',
    v_pay.id,
    pg_catalog.jsonb_build_object(
      'dispute_id', v_row.id,
      'payment_id', v_pay.id,
      'provider_ref', p_provider_ref,
      'amount_cents', p_amount_cents,
      'status', v_row.status,
      'is_new', v_new
    ),
    pg_catalog.gen_random_uuid()
  );

  IF v_new THEN
    v_body := 'Rückbuchung offen: Eine Kartenzahlung wurde bei Stripe bestritten.';
    INSERT INTO public.user_notifications (
      tenant_id, user_id, type, body, course_id, action_path, metadata
    )
    SELECT
      v_pay.tenant_id,
      u.id,
      'payment_dispute_opened',
      v_body,
      NULL,
      '/open-payments',
      pg_catalog.jsonb_build_object(
        'dispute_id', v_row.id,
        'payment_id', v_pay.id,
        'for_managers', true
      )
    FROM public.users u
    WHERE u.tenant_id = v_pay.tenant_id
      AND u.role IN ('owner', 'admin')
      AND u.anonymized_at IS NULL;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'dispute_id', v_row.id,
    'is_new', v_new,
    'event_id', v_event_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_payment_dispute(
  p_payment_id uuid,
  p_provider_ref text,
  p_amount_cents integer,
  p_status text DEFAULT 'needs_response'
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
  SELECT yogaflow_private.record_payment_dispute(
    p_payment_id, p_provider_ref, p_amount_cents, p_status
  );
$fn$;

REVOKE ALL ON FUNCTION yogaflow_private.record_payment_dispute(uuid, text, integer, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_payment_dispute(uuid, text, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_dispute(uuid, text, integer, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Manuell (R4) + Lesen (H)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.request_payment_refund(
  p_payment_id uuid,
  p_amount_cents integer DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_member uuid;
  v_tenant uuid;
  v_pay public.payments%ROWTYPE;
  v_res jsonb;
  v_event_id uuid;
BEGIN
  v_member := yogaflow_private.get_my_member_id();
  v_tenant := yogaflow_private.get_my_tenant_id();
  IF v_member IS NULL OR v_tenant IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;
  IF NOT yogaflow_private.is_tenant_manager() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND OR v_pay.tenant_id IS DISTINCT FROM v_tenant THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  v_res := yogaflow_private.request_refund(
    p_payment_id, p_amount_cents, 'manual', v_member, p_note
  );

  IF COALESCE(v_res ->> 'success', 'false') = 'true'
     AND v_res ->> 'code' = 'REQUESTED'
  THEN
    v_event_id := yogaflow_private.insert_event(
      v_tenant,
      'payment.refund_requested',
      'payment',
      p_payment_id,
      pg_catalog.jsonb_build_object(
        'refund_id', v_res ->> 'refund_id',
        'payment_id', p_payment_id,
        'amount_cents', (v_res ->> 'amount_cents')::integer,
        'reason', 'manual'
      ),
      pg_catalog.gen_random_uuid()
    );
    PERFORM yogaflow_private.insert_audit(
      v_tenant,
      v_member,
      'payment.refund_requested',
      'payment_refunds',
      (v_res ->> 'refund_id')::uuid,
      ARRAY['amount_cents', 'reason', 'note', 'status']::text[],
      v_event_id
    );
  END IF;

  RETURN v_res;
END;
$function$;

REVOKE ALL ON FUNCTION public.request_payment_refund(uuid, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_payment_refund(uuid, integer, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_payment_refunds(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tenant uuid;
  v_pay public.payments%ROWTYPE;
BEGIN
  v_tenant := yogaflow_private.get_my_tenant_id();
  IF v_tenant IS NULL OR NOT yogaflow_private.is_tenant_manager() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND OR v_pay.tenant_id IS DISTINCT FROM v_tenant THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'state', yogaflow_private.payment_refund_state(p_payment_id),
    'refunds', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', r.id,
          'amount_cents', r.amount_cents,
          'reason', r.reason,
          'note', r.note,
          'status', r.status,
          'provider_ref', r.provider_ref,
          'failure_code', r.failure_code,
          'requested_by', r.requested_by,
          'created_at', r.created_at
        )
        ORDER BY r.created_at ASC, r.id ASC
      )
      FROM public.payment_refunds r
      WHERE r.payment_id = p_payment_id
    ), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_payment_refunds(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_refunds(uuid) TO authenticated;

-- Kleinste Leselösung Teilnehmende: RPC je Buchung
CREATE OR REPLACE FUNCTION public.get_registration_refund_summary(p_registration_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_member uuid;
  v_reg public.registrations%ROWTYPE;
  v_pay public.payments%ROWTYPE;
  v_refunded integer;
  v_pending integer;
BEGIN
  v_member := yogaflow_private.get_my_member_id();
  IF v_member IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_reg FROM public.registrations WHERE id = p_registration_id;
  IF NOT FOUND OR v_reg.user_id IS DISTINCT FROM v_member THEN
    IF NOT yogaflow_private.is_tenant_manager()
       OR v_reg.tenant_id IS DISTINCT FROM yogaflow_private.get_my_tenant_id()
    THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
    END IF;
  END IF;

  SELECT * INTO v_pay
  FROM public.payments p
  WHERE p.registration_id = p_registration_id
    AND p.provider = 'stripe'::public.payment_provider
    AND p.reverses_payment_id IS NULL
    AND p.amount_cents > 0
  ORDER BY p.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'payment_cents', 0,
      'refunded_cents', 0,
      'pending_cents', 0,
      'state', NULL
    );
  END IF;

  SELECT COALESCE(pg_catalog.sum(amount_cents), 0)::integer INTO v_refunded
  FROM public.payment_refunds
  WHERE payment_id = v_pay.id AND status = 'succeeded';

  SELECT COALESCE(pg_catalog.sum(amount_cents), 0)::integer INTO v_pending
  FROM public.payment_refunds
  WHERE payment_id = v_pay.id AND status = 'pending';

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'payment_id', v_pay.id,
    'payment_cents', v_pay.amount_cents,
    'refunded_cents', v_refunded,
    'pending_cents', v_pending,
    'state', yogaflow_private.payment_refund_state(v_pay.id)
  );
END;
$function$;

COMMENT ON FUNCTION public.get_registration_refund_summary(uuid) IS
  'Teilnehmende: Erstattungsstand der eigenen Buchung (R9). Begründung: eigene RPC statt Listen-Join.';

REVOKE ALL ON FUNCTION public.get_registration_refund_summary(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_registration_refund_summary(uuid)
  TO authenticated;

DO $check$
BEGIN
  IF NOT has_function_privilege(
    'service_role',
    'public.record_online_refund(uuid, text, integer, timestamptz, uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION '3.2a: record_online_refund Grants fehlen';
  END IF;
  IF has_function_privilege(
    'authenticated',
    'public.record_online_refund(uuid, text, integer, timestamptz, uuid)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.record_online_refund(uuid, text, integer, timestamptz, uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION '3.2a: record_online_refund zu weit freigegeben';
  END IF;
END;
$check$;
