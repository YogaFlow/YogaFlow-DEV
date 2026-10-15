-- 3.1 — Glocke „Rückbuchung offen“ und „Erstattung fehlgeschlagen“ führt zur Zahlung.
-- allow: record_payment_dispute,mark_refund_failed
--
-- Körper unverändert (record_payment_dispute aus 20261002202506, mark_refund_failed aus
-- 20261002111000) außer action_path: '/open-payments' → '/payments?payment=<payment_id>'.
-- Bestehende Benachrichtigungen bleiben, wie sie sind (keine Datenänderung).
-- Rückweg: beide Körper aus den genannten Migrationen erneut ausführen.

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
  IF p_provider_ref IS NULL OR p_provider_ref !~ '^(dp_|du_)' THEN
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
      '/payments?payment=' || v_pay.id::text,
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
    '/payments?payment=' || v_refund.payment_id::text,
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

DO $check$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'yogaflow_private.record_payment_dispute(uuid, text, integer, text)',
    'yogaflow_private.mark_refund_failed(uuid, text, text)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
    THEN
      RAISE EXCEPTION '3.1: % zu weit freigegeben', v_fn;
    END IF;
    IF position('/payments?payment=' in pg_get_functiondef(v_fn::regprocedure)) = 0 THEN
      RAISE EXCEPTION '3.1: % führt nicht zur Zahlung', v_fn;
    END IF;
  END LOOP;
END;
$check$;
