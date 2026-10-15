-- K1 — Widerruf, Verlängerung, Void bei Erstattung, request_refund+withdrawal.
-- allow: void_pass_remaining,request_refund,record_online_refund,extend_pass,pass_withdrawal_preview,get_pass_withdrawal_preview,confirm_pass_withdrawal_core,confirm_pass_withdrawal,tenant_id_from_request,pass_withdrawal_rate_limited,lookup_pass_withdrawal_public,confirm_pass_withdrawal_public

-- ---------------------------------------------------------------------------
-- 1. Resttermine entwerten (void)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.void_pass_remaining(
  p_pass_id uuid,
  p_reason text,
  p_actor uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_pass public.passes%ROWTYPE;
  v_remaining integer;
  v_event_id uuid;
  v_reason text := NULLIF(pg_catalog.btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF v_reason IS NULL OR length(v_reason) > 200 THEN
    RAISE EXCEPTION 'INVALID_REASON' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_pass FROM public.passes WHERE id = p_pass_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  v_remaining := yogaflow_private.pass_remaining(v_pass.id);
  IF v_remaining <= 0 THEN
    IF v_pass.status = 'active' THEN
      PERFORM pg_catalog.set_config('yogaflow.allow_pass_change', 'on', true);
      UPDATE public.passes
      SET status = 'revoked', revoked_at = COALESCE(revoked_at, pg_catalog.now())
      WHERE id = v_pass.id AND status = 'active';
    END IF;
    RETURN 0;
  END IF;

  -- Idempotent: schon void/revoke mit Rest 0
  IF EXISTS (
    SELECT 1 FROM public.pass_movements m
    WHERE m.pass_id = v_pass.id AND m.kind = 'void' AND m.reason = v_reason
  ) AND v_remaining <= 0 THEN
    RETURN 0;
  END IF;

  v_event_id := yogaflow_private.insert_event(
    v_pass.tenant_id,
    'pass.voided',
    'pass',
    v_pass.id,
    pg_catalog.jsonb_build_object(
      'pass_id', v_pass.id,
      'units_voided', v_remaining,
      'reason', v_reason
    ),
    pg_catalog.gen_random_uuid()
  );

  INSERT INTO public.pass_movements (
    tenant_id, pass_id, delta, kind, reason, actor_member_id, event_id
  ) VALUES (
    v_pass.tenant_id, v_pass.id, -v_remaining, 'void', v_reason, p_actor, v_event_id
  );

  PERFORM pg_catalog.set_config('yogaflow.allow_pass_change', 'on', true);
  UPDATE public.passes
  SET status = 'revoked', revoked_at = pg_catalog.now()
  WHERE id = v_pass.id AND status = 'active';

  RETURN v_remaining;
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.void_pass_remaining(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. request_refund: withdrawal + Void bei pass_purchase
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
  v_remaining integer;
  v_amount integer;
  v_refund_id uuid;
  v_note text;
  v_pass_id uuid;
BEGIN
  IF p_reason IS NULL OR p_reason NOT IN (
    'course_cancelled', 'self_cancel_in_window', 'staff_unregister',
    'member_removed', 'late_payment', 'manual', 'provider_dashboard',
    'withdrawal'
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

  v_remaining := yogaflow_private.payment_refundable_cents(v_pay.id);
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

  -- K1: jede Erstattung auf Kartenkauf entwertet Resttermine in derselben Tx
  IF v_pay.subject_type = 'pass_purchase' THEN
    v_pass_id := v_pay.subject_id;
    PERFORM yogaflow_private.void_pass_remaining(
      v_pass_id,
      CASE p_reason
        WHEN 'withdrawal' THEN 'withdrawal'
        WHEN 'manual' THEN 'courtesy_refund'
        ELSE p_reason
      END,
      p_requested_by
    );
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

REVOKE ALL ON FUNCTION yogaflow_private.request_refund(uuid, integer, text, uuid, text)
  FROM PUBLIC, anon, authenticated;

-- record_online_refund: Dashboard-Pfad voiden, wenn pass_purchase noch aktiv
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
  v_pass public.passes%ROWTYPE;
BEGIN
  IF p_refund_ref IS NULL OR pg_catalog.btrim(p_refund_ref) = '' OR p_refund_ref !~ '^re_' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_REF');
  END IF;

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
      SELECT * INTO v_refund
      FROM public.payment_refunds
      WHERE payment_id = v_orig.id
        AND status = 'pending'
      ORDER BY created_at ASC, id ASC
      LIMIT 1
      FOR UPDATE;
    END IF;
    IF NOT FOUND THEN
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

      IF v_orig.subject_type = 'pass_purchase' THEN
        PERFORM yogaflow_private.void_pass_remaining(
          v_orig.subject_id, 'provider_dashboard', NULL
        );
      END IF;
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
  ELSIF v_orig.subject_type = 'pass_purchase' THEN
    SELECT * INTO v_pass FROM public.passes WHERE id = v_orig.subject_id;
    IF v_pass.id IS NOT NULL THEN
      INSERT INTO public.email_deliveries (
        tenant_id, event_id, kind, registration_id, pass_id, status, next_attempt_at
      ) VALUES (
        v_orig.tenant_id,
        v_event_id,
        CASE WHEN v_refund.reason = 'withdrawal'
          THEN 'pass_withdrawal_refunded'
          ELSE 'pass_withdrawal_refunded'
        END,
        NULL,
        v_pass.id,
        'pending',
        pg_catalog.now()
      );
    END IF;
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

REVOKE ALL ON FUNCTION yogaflow_private.record_online_refund(uuid, text, integer, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Verlängerung
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.extend_pass(
  p_pass_id uuid,
  p_new_valid_until date,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := yogaflow_private.get_my_member_id();
  v_tenant uuid := yogaflow_private.get_my_tenant_id();
  v_pass public.passes%ROWTYPE;
  v_note text := NULLIF(pg_catalog.btrim(COALESCE(p_note, '')), '');
  v_event_id uuid;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL OR NOT yogaflow_private.is_tenant_manager() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF v_note IS NULL OR length(v_note) > 200 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOTE_REQUIRED');
  END IF;

  IF p_new_valid_until IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_DATE');
  END IF;

  SELECT * INTO v_pass FROM public.passes WHERE id = p_pass_id FOR UPDATE;
  IF NOT FOUND OR v_pass.tenant_id IS DISTINCT FROM v_tenant THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_pass.status IS DISTINCT FROM 'active' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_ACTIVE');
  END IF;

  IF p_new_valid_until <= v_pass.valid_until THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'DATE_NOT_LATER');
  END IF;

  PERFORM pg_catalog.set_config('yogaflow.allow_pass_extend', 'on', true);
  UPDATE public.passes SET valid_until = p_new_valid_until WHERE id = v_pass.id;

  INSERT INTO public.pass_validity_changes (
    tenant_id, pass_id, old_valid_until, new_valid_until, note, actor_member_id
  ) VALUES (
    v_tenant, v_pass.id, v_pass.valid_until, p_new_valid_until, v_note, v_actor
  );

  v_event_id := yogaflow_private.insert_event(
    v_tenant,
    'pass.extended',
    'pass',
    v_pass.id,
    pg_catalog.jsonb_build_object(
      'pass_id', v_pass.id,
      'old_valid_until', v_pass.valid_until,
      'new_valid_until', p_new_valid_until
    ),
    pg_catalog.gen_random_uuid()
  );

  PERFORM yogaflow_private.insert_audit(
    v_tenant, v_actor, 'pass.extended', 'passes', v_pass.id,
    ARRAY['valid_until']::text[], v_event_id
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'pass_id', v_pass.id,
    'old_valid_until', v_pass.valid_until,
    'new_valid_until', p_new_valid_until
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.extend_pass(uuid, date, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.extend_pass(uuid, date, text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Widerruf-Vorschau (intern)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.pass_withdrawal_preview(p_pass_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_pass public.passes%ROWTYPE;
  v_pay public.payments%ROWTYPE;
  v_used integer;
  v_remaining integer;
  v_wertersatz integer;
  v_refund integer;
  v_deadline timestamptz;
  v_purchased_at timestamptz;
BEGIN
  SELECT * INTO v_pass FROM public.passes WHERE id = p_pass_id;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  SELECT * INTO v_pay FROM public.payments WHERE id = v_pass.payment_id;
  IF NOT FOUND
     OR v_pay.subject_type IS DISTINCT FROM 'pass_purchase'
     OR v_pay.provider IS DISTINCT FROM 'stripe'::public.payment_provider
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_ONLINE_PURCHASE');
  END IF;

  v_purchased_at := COALESCE(v_pay.received_at, v_pass.created_at);
  v_deadline := v_purchased_at + interval '14 days';

  SELECT COALESCE(-SUM(m.delta), 0)::integer
    INTO v_used
  FROM public.pass_movements m
  WHERE m.pass_id = v_pass.id
    AND m.kind IN ('redeem', 'redeem_reversal');

  v_remaining := yogaflow_private.pass_remaining(v_pass.id);
  v_wertersatz := yogaflow_private.pass_wertersatz_cents(
    v_pass.price_cents, v_pass.units_total, v_used
  );
  v_refund := GREATEST(v_pass.price_cents - v_wertersatz, 0);

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'pass_id', v_pass.id,
    'payment_id', v_pay.id,
    'name', v_pass.name,
    'units_total', v_pass.units_total,
    'units_used', v_used,
    'units_remaining', v_remaining,
    'price_cents', v_pass.price_cents,
    'wertersatz_cents', v_wertersatz,
    'refund_cents', v_refund,
    'purchased_at', v_purchased_at,
    'withdrawal_deadline_at', v_deadline,
    'within_window', pg_catalog.now() <= v_deadline,
    'pass_status', v_pass.status,
    'already_voided', v_pass.status IS DISTINCT FROM 'active' OR v_remaining = 0
      AND EXISTS (
        SELECT 1 FROM public.pass_movements m
        WHERE m.pass_id = v_pass.id AND m.kind = 'void'
      )
  );
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.pass_withdrawal_preview(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_pass_withdrawal_preview(p_pass_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member uuid := yogaflow_private.get_my_member_id();
  v_tenant uuid := yogaflow_private.get_my_tenant_id();
  v_pass public.passes%ROWTYPE;
  v_prev jsonb;
BEGIN
  IF v_member IS NULL OR v_tenant IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_pass FROM public.passes WHERE id = p_pass_id;
  IF NOT FOUND OR v_pass.tenant_id IS DISTINCT FROM v_tenant THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_pass.member_id IS DISTINCT FROM v_member
     AND NOT yogaflow_private.is_tenant_manager()
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  v_prev := yogaflow_private.pass_withdrawal_preview(p_pass_id);
  RETURN v_prev;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_pass_withdrawal_preview(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pass_withdrawal_preview(uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Widerruf bestätigen (eingeloggt)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.confirm_pass_withdrawal_core(
  p_pass_id uuid,
  p_actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_prev jsonb;
  v_refund integer;
  v_payment_id uuid;
  v_res jsonb;
  v_event_id uuid;
  v_pass public.passes%ROWTYPE;
BEGIN
  v_prev := yogaflow_private.pass_withdrawal_preview(p_pass_id);
  IF COALESCE((v_prev ->> 'success')::boolean, false) IS NOT TRUE THEN
    RETURN v_prev;
  END IF;

  IF COALESCE((v_prev ->> 'within_window')::boolean, false) IS NOT TRUE THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error', 'WINDOW_EXPIRED',
      'withdrawal_deadline_at', v_prev -> 'withdrawal_deadline_at'
    );
  END IF;

  SELECT * INTO v_pass FROM public.passes WHERE id = p_pass_id FOR UPDATE;
  IF v_pass.status IS DISTINCT FROM 'active'
     AND EXISTS (
       SELECT 1 FROM public.pass_movements m
       WHERE m.pass_id = p_pass_id AND m.kind = 'void' AND m.reason = 'withdrawal'
     )
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ALREADY_WITHDRAWN');
  END IF;

  v_refund := COALESCE((v_prev ->> 'refund_cents')::integer, 0);
  v_payment_id := (v_prev ->> 'payment_id')::uuid;

  v_event_id := yogaflow_private.insert_event(
    v_pass.tenant_id,
    'pass.withdrawal_received',
    'pass',
    v_pass.id,
    pg_catalog.jsonb_build_object(
      'pass_id', v_pass.id,
      'payment_id', v_payment_id,
      'wertersatz_cents', (v_prev ->> 'wertersatz_cents')::integer,
      'refund_cents', v_refund,
      'units_used', (v_prev ->> 'units_used')::integer
    ),
    pg_catalog.gen_random_uuid()
  );

  INSERT INTO public.email_deliveries (
    tenant_id, event_id, kind, registration_id, pass_id, status, next_attempt_at
  ) VALUES (
    v_pass.tenant_id, v_event_id, 'pass_withdrawal_received', NULL, v_pass.id,
    'pending', pg_catalog.now()
  );

  IF v_refund > 0 THEN
    v_res := yogaflow_private.request_refund(
      v_payment_id, v_refund, 'withdrawal', p_actor, NULL
    );
    IF COALESCE((v_res ->> 'success')::boolean, false) IS NOT TRUE THEN
      RETURN v_res;
    END IF;
  ELSE
    PERFORM yogaflow_private.void_pass_remaining(v_pass.id, 'withdrawal', p_actor);
    v_res := pg_catalog.jsonb_build_object(
      'success', true,
      'code', 'VOIDED_NO_REFUND',
      'amount_cents', 0
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'code', 'WITHDRAWN',
    'pass_id', v_pass.id,
    'refund_cents', v_refund,
    'wertersatz_cents', (v_prev ->> 'wertersatz_cents')::integer,
    'units_used', (v_prev ->> 'units_used')::integer,
    'refund_id', v_res -> 'refund_id',
    'received_at', pg_catalog.now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.confirm_pass_withdrawal_core(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.confirm_pass_withdrawal(p_pass_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member uuid := yogaflow_private.get_my_member_id();
  v_tenant uuid := yogaflow_private.get_my_tenant_id();
  v_pass public.passes%ROWTYPE;
BEGIN
  IF v_member IS NULL OR v_tenant IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_pass FROM public.passes WHERE id = p_pass_id;
  IF NOT FOUND OR v_pass.tenant_id IS DISTINCT FROM v_tenant THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_pass.member_id IS DISTINCT FROM v_member THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  RETURN yogaflow_private.confirm_pass_withdrawal_core(p_pass_id, v_member);
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_pass_withdrawal(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_pass_withdrawal(uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Öffentlicher Widerruf (Belegnummer + E-Mail)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.tenant_id_from_request()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT t.id
  FROM public.tenants t
  WHERE t.slug = yogaflow_private.request_tenant_slug()
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.tenant_id_from_request()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION yogaflow_private.pass_withdrawal_rate_limited(
  p_tenant uuid,
  p_receipt text,
  p_ip_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_ip integer := 0;
  v_rc integer := 0;
BEGIN
  IF p_ip_hash IS NOT NULL THEN
    SELECT COUNT(*)::integer INTO v_ip
    FROM public.pass_withdrawal_lookups
    WHERE tenant_id = p_tenant
      AND ip_hash = p_ip_hash
      AND created_at > pg_catalog.now() - interval '1 hour';
  END IF;

  SELECT COUNT(*)::integer INTO v_rc
  FROM public.pass_withdrawal_lookups
  WHERE tenant_id = p_tenant
    AND receipt_number = p_receipt
    AND created_at > pg_catalog.now() - interval '1 hour';

  RETURN v_ip >= 20 OR v_rc >= 10;
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.pass_withdrawal_rate_limited(uuid, text, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.lookup_pass_withdrawal_public(
  p_receipt_number text,
  p_email text,
  p_client_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tenant uuid := yogaflow_private.tenant_id_from_request();
  v_receipt text := upper(btrim(COALESCE(p_receipt_number, '')));
  v_email text := lower(btrim(COALESCE(p_email, '')));
  v_ip_hash text;
  v_pay public.payments%ROWTYPE;
  v_pass public.passes%ROWTYPE;
  v_member public.users%ROWTYPE;
  v_prev jsonb;
  v_matched boolean := false;
  v_neutral jsonb := pg_catalog.jsonb_build_object(
    'success', true,
    'code', 'LOOKUP_RESULT',
    'message', 'Wenn die Angaben zu einem Kauf passen, siehst du jetzt die Zusammenfassung.'
  );
BEGIN
  IF v_tenant IS NULL THEN
    RETURN v_neutral;
  END IF;

  IF v_receipt = '' OR v_email = '' OR position('@' in v_email) = 0 THEN
    RETURN v_neutral;
  END IF;

  IF p_client_ip IS NOT NULL AND btrim(p_client_ip) <> '' THEN
    v_ip_hash := encode(extensions.digest(btrim(p_client_ip), 'sha256'), 'hex');
  END IF;

  IF yogaflow_private.pass_withdrawal_rate_limited(v_tenant, v_receipt, v_ip_hash) THEN
    RETURN v_neutral || pg_catalog.jsonb_build_object('rate_limited', true);
  END IF;

  SELECT p.*
    INTO v_pay
  FROM public.receipts r
  JOIN public.payments p ON p.id = r.payment_id
  WHERE r.tenant_id = v_tenant
    AND r.number = v_receipt
    AND r.kind = 'receipt'
    AND p.subject_type = 'pass_purchase'
  LIMIT 1;

  IF FOUND THEN
    SELECT * INTO v_pass FROM public.passes WHERE id = v_pay.subject_id;
    SELECT * INTO v_member FROM public.users WHERE id = v_pass.member_id;
    IF FOUND AND lower(btrim(COALESCE(v_member.email, ''))) = v_email THEN
      v_matched := true;
      v_prev := yogaflow_private.pass_withdrawal_preview(v_pass.id);
    END IF;
  END IF;

  INSERT INTO public.pass_withdrawal_lookups (
    tenant_id, receipt_number, email_norm, ip_hash, matched
  ) VALUES (
    v_tenant, v_receipt, v_email, v_ip_hash, v_matched
  );

  IF NOT v_matched THEN
    RETURN v_neutral;
  END IF;

  IF COALESCE((v_prev ->> 'within_window')::boolean, false) IS NOT TRUE THEN
    RETURN v_neutral || pg_catalog.jsonb_build_object(
      'found', true,
      'within_window', false,
      'withdrawal_deadline_at', v_prev -> 'withdrawal_deadline_at',
      'message', 'Die Widerrufsfrist für diesen Kauf ist abgelaufen.'
    );
  END IF;

  RETURN v_neutral || pg_catalog.jsonb_build_object(
    'found', true,
    'within_window', true,
    'pass_id', v_prev -> 'pass_id',
    'name', v_prev -> 'name',
    'units_total', v_prev -> 'units_total',
    'units_used', v_prev -> 'units_used',
    'price_cents', v_prev -> 'price_cents',
    'wertersatz_cents', v_prev -> 'wertersatz_cents',
    'refund_cents', v_prev -> 'refund_cents',
    'withdrawal_deadline_at', v_prev -> 'withdrawal_deadline_at'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.lookup_pass_withdrawal_public(text, text, text)
  FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_pass_withdrawal_public(text, text, text)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.confirm_pass_withdrawal_public(
  p_receipt_number text,
  p_email text,
  p_client_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_lookup jsonb;
  v_pass_id uuid;
  v_pass public.passes%ROWTYPE;
BEGIN
  v_lookup := public.lookup_pass_withdrawal_public(
    p_receipt_number, p_email, p_client_ip
  );

  IF COALESCE((v_lookup ->> 'found')::boolean, false) IS NOT TRUE
     OR COALESCE((v_lookup ->> 'within_window')::boolean, false) IS NOT TRUE
  THEN
    -- gleiche neutrale Form; kein Leak
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'code', 'LOOKUP_RESULT',
      'message', 'Wenn die Angaben zu einem Kauf passen, siehst du jetzt die Zusammenfassung.'
    );
  END IF;

  v_pass_id := (v_lookup ->> 'pass_id')::uuid;
  SELECT * INTO v_pass FROM public.passes WHERE id = v_pass_id;

  RETURN yogaflow_private.confirm_pass_withdrawal_core(v_pass_id, v_pass.member_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_pass_withdrawal_public(text, text, text)
  FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_pass_withdrawal_public(text, text, text)
  TO anon, authenticated;

DO $$
BEGIN
  IF yogaflow_private.pass_wertersatz_cents(12000, 10, 2) IS DISTINCT FROM 2400 THEN
    RAISE EXCEPTION 'K1 withdraw: Wertersatz 12000/10/2';
  END IF;
  IF NOT has_function_privilege('anon', 'public.lookup_pass_withdrawal_public(text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'K1 withdraw: anon ohne public lookup';
  END IF;
  IF has_function_privilege('anon', 'public.confirm_pass_withdrawal(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'K1 withdraw: confirm_pass_withdrawal für anon';
  END IF;
END;
$$;
