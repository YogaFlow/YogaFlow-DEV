-- K1 — Online-Kartenkauf: Attempt, prepare, confirm-Zweig, complete, Expire.
-- allow: create_pass_payment_attempt,prepare_pass_online_payment,check_before_confirm,complete_online_payment,expire_pass_payment_attempts,fulfill_pass_online_purchase

-- ---------------------------------------------------------------------------
-- 1. Attempt für pass_product
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.create_pass_payment_attempt(
  p_product_id uuid,
  p_member_id uuid,
  p_provider public.payment_provider,
  p_livemode boolean,
  p_immediate_use_hash text,
  p_withdrawal_info_hash text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_product public.pass_products%ROWTYPE;
  v_member public.users%ROWTYPE;
  v_block text;
  v_id uuid;
  v_event_id uuid;
  v_snap jsonb;
  v_expires timestamptz;
BEGIN
  SELECT * INTO v_member
  FROM public.users
  WHERE id = p_member_id
  FOR UPDATE;

  IF NOT FOUND OR v_member.anonymized_at IS NOT NULL THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_product
  FROM public.pass_products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND OR v_product.tenant_id IS DISTINCT FROM v_member.tenant_id THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_product.archived_at IS NOT NULL OR NOT v_product.online_purchasable THEN
    RAISE EXCEPTION 'NOT_PURCHASABLE' USING ERRCODE = '22023';
  END IF;

  v_block := yogaflow_private.online_method_block_reason(
    v_member.tenant_id, v_product.price_cents
  );
  IF v_block IS NOT NULL THEN
    RAISE EXCEPTION '%', v_block USING ERRCODE = '22023';
  END IF;

  IF p_provider = 'manual'::public.payment_provider THEN
    RAISE EXCEPTION 'INVALID_PROVIDER' USING ERRCODE = '22023';
  END IF;

  IF p_immediate_use_hash IS NULL OR p_immediate_use_hash !~ '^[a-f0-9]{64}$'
     OR p_withdrawal_info_hash IS NULL OR p_withdrawal_info_hash !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION 'CONSENT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.payment_attempts a
    WHERE a.tenant_id = v_member.tenant_id
      AND a.member_id = p_member_id
      AND a.subject_id = p_product_id
      AND a.subject_type = 'pass_product'
      AND a.status IN ('initiated', 'processing')
  ) THEN
    RAISE EXCEPTION 'ACTIVE_ATTEMPT_EXISTS' USING ERRCODE = '22023';
  END IF;

  v_id := pg_catalog.gen_random_uuid();
  v_expires := pg_catalog.now() + interval '30 minutes';
  v_snap := pg_catalog.jsonb_build_object(
    'product_id', v_product.id,
    'name', v_product.name,
    'units', v_product.units,
    'price_cents', v_product.price_cents,
    'validity_rule', v_product.validity_rule,
    'validity_value', v_product.validity_value,
    'description', v_product.description
  );

  INSERT INTO public.payment_attempts (
    id, tenant_id, subject_type, registration_id, subject_id, member_id,
    snapshot, expires_at, provider, method, amount_cents, currency,
    status, idempotency_key, livemode, created_by
  ) VALUES (
    v_id, v_member.tenant_id, 'pass_product', NULL, p_product_id, p_member_id,
    v_snap, v_expires, p_provider, 'card'::public.payment_method,
    v_product.price_cents, 'EUR', 'initiated', v_id::text, p_livemode, p_member_id
  );

  INSERT INTO public.pass_purchase_consents (
    tenant_id, attempt_id, member_id,
    immediate_use_text_hash, withdrawal_info_text_hash
  ) VALUES (
    v_member.tenant_id, v_id, p_member_id,
    p_immediate_use_hash, p_withdrawal_info_hash
  );

  v_event_id := yogaflow_private.insert_event(
    v_member.tenant_id,
    'payment_attempt.created',
    'payment_attempt',
    v_id,
    pg_catalog.jsonb_build_object(
      'attempt_id', v_id,
      'subject_type', 'pass_product',
      'subject_id', p_product_id,
      'member_id', p_member_id,
      'amount_cents', v_product.price_cents,
      'provider', p_provider::text,
      'livemode', p_livemode,
      'expires_at', v_expires
    ),
    pg_catalog.gen_random_uuid()
  );
  PERFORM v_event_id;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.create_pass_payment_attempt(uuid, uuid, public.payment_provider, boolean, text, text)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. prepare_pass_online_payment
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.prepare_pass_online_payment(
  p_product_id uuid,
  p_user_id uuid,
  p_immediate_use_hash text,
  p_withdrawal_info_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member public.users%ROWTYPE;
  v_attempt public.payment_attempts%ROWTYPE;
  v_account_ref text;
  v_livemode boolean;
  v_attempt_id uuid;
  v_block text;
BEGIN
  SELECT * INTO v_member FROM public.users WHERE id = p_user_id;
  IF NOT FOUND OR v_member.anonymized_at IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_attempt
  FROM public.payment_attempts a
  WHERE a.member_id = p_user_id
    AND a.subject_id = p_product_id
    AND a.subject_type = 'pass_product'
    AND a.status IN ('initiated', 'processing')
  ORDER BY a.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    SELECT pa.provider_ref, pa.livemode
      INTO v_account_ref, v_livemode
    FROM public.provider_accounts pa
    WHERE pa.tenant_id = v_attempt.tenant_id
      AND pa.provider = 'stripe'::public.payment_provider
      AND pa.disconnected_at IS NULL
    ORDER BY pa.created_at DESC
    LIMIT 1;

    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'attempt_id', v_attempt.id,
      'amount_cents', v_attempt.amount_cents,
      'currency', v_attempt.currency,
      'account_ref', v_account_ref,
      'provider_ref', v_attempt.provider_ref,
      'expires_at', v_attempt.expires_at,
      'livemode', v_attempt.livemode,
      'subject_type', 'pass_product',
      'subject_id', v_attempt.subject_id,
      'snapshot', v_attempt.snapshot
    );
  END IF;

  v_block := yogaflow_private.online_method_block_reason(
    v_member.tenant_id,
    (SELECT price_cents FROM public.pass_products WHERE id = p_product_id)
  );
  IF v_block IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', v_block);
  END IF;

  SELECT pa.provider_ref, pa.livemode
    INTO v_account_ref, v_livemode
  FROM public.provider_accounts pa
  WHERE pa.tenant_id = v_member.tenant_id
    AND pa.provider = 'stripe'::public.payment_provider
    AND pa.disconnected_at IS NULL
  ORDER BY pa.created_at DESC
  LIMIT 1;

  IF v_account_ref IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ONLINE_DISABLED');
  END IF;

  BEGIN
    v_attempt_id := yogaflow_private.create_pass_payment_attempt(
      p_product_id,
      p_user_id,
      'stripe'::public.payment_provider,
      v_livemode,
      p_immediate_use_hash,
      p_withdrawal_info_hash
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error', CASE
        WHEN SQLERRM LIKE 'CONSENT_REQUIRED%' THEN 'CONSENT_REQUIRED'
        WHEN SQLERRM LIKE 'NOT_PURCHASABLE%' THEN 'NOT_PURCHASABLE'
        WHEN SQLERRM LIKE 'ACTIVE_ATTEMPT_EXISTS%' THEN 'ACTIVE_ATTEMPT_EXISTS'
        WHEN SQLERRM LIKE 'AMOUNT_ABOVE_RECEIPT_LIMIT%' THEN 'AMOUNT_ABOVE_RECEIPT_LIMIT'
        WHEN SQLERRM LIKE 'ONLINE_DISABLED%' THEN 'ONLINE_DISABLED'
        WHEN SQLERRM LIKE 'PROVIDER_NOT_READY%' THEN 'PROVIDER_NOT_READY'
        WHEN SQLERRM LIKE 'TAX_SETTING_MISSING%' THEN 'TAX_SETTING_MISSING'
        WHEN SQLERRM LIKE 'LEGAL_PROFILE_MISSING%' THEN 'LEGAL_PROFILE_MISSING'
        WHEN SQLERRM LIKE 'AVV_MISSING%' THEN 'AVV_MISSING'
        WHEN SQLERRM LIKE 'PLATFORM_DISABLED%' THEN 'PLATFORM_DISABLED'
        ELSE 'NOT_FOUND'
      END
    );
  END;

  SELECT * INTO v_attempt FROM public.payment_attempts WHERE id = v_attempt_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'attempt_id', v_attempt.id,
    'amount_cents', v_attempt.amount_cents,
    'currency', v_attempt.currency,
    'account_ref', v_account_ref,
    'provider_ref', v_attempt.provider_ref,
    'expires_at', v_attempt.expires_at,
    'livemode', v_attempt.livemode,
    'subject_type', 'pass_product',
    'subject_id', v_attempt.subject_id,
    'snapshot', v_attempt.snapshot
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.prepare_pass_online_payment(
  p_product_id uuid,
  p_user_id uuid,
  p_immediate_use_hash text,
  p_withdrawal_info_hash text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT yogaflow_private.prepare_pass_online_payment(
    p_product_id, p_user_id, p_immediate_use_hash, p_withdrawal_info_hash
  );
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.prepare_pass_online_payment(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_pass_online_payment(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_pass_online_payment(uuid, uuid, text, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 3. check_before_confirm — Pass-Zweig
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.check_before_confirm(
  p_attempt_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_attempt public.payment_attempts%ROWTYPE;
  v_reg public.registrations%ROWTYPE;
BEGIN
  SELECT * INTO v_attempt
  FROM public.payment_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ATTEMPT_NOT_ACTIVE');
  END IF;

  IF v_attempt.status NOT IN ('initiated', 'processing') THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ATTEMPT_NOT_ACTIVE');
  END IF;

  IF v_attempt.subject_type = 'pass_product' THEN
    IF v_attempt.member_id IS DISTINCT FROM p_user_id THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
    END IF;

    IF v_attempt.expires_at IS NULL
       OR v_attempt.expires_at <= pg_catalog.now() + interval '1 minute'
    THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ATTEMPT_EXPIRED');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.pass_purchase_consents c WHERE c.attempt_id = v_attempt.id
    ) THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'CONSENT_REQUIRED');
    END IF;

    IF v_attempt.status = 'initiated' THEN
      PERFORM yogaflow_private.set_payment_attempt_status(
        p_attempt_id, 'processing', NULL, NULL
      );
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'attempt_id', p_attempt_id,
      'status', 'processing',
      'expires_at', v_attempt.expires_at,
      'subject_type', 'pass_product'
    );
  END IF;

  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = v_attempt.registration_id
  FOR UPDATE;

  IF NOT FOUND OR v_reg.user_id IS DISTINCT FROM p_user_id THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF v_reg.status IS DISTINCT FROM 'pending_payment'::public.registration_status THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_PENDING');
  END IF;

  IF v_reg.hold_expires_at IS NULL
     OR v_reg.hold_expires_at <= pg_catalog.now() + interval '1 minute'
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'HOLD_EXPIRED');
  END IF;

  IF v_attempt.status = 'initiated' THEN
    PERFORM yogaflow_private.set_payment_attempt_status(
      p_attempt_id, 'processing', NULL, NULL
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'attempt_id', p_attempt_id,
    'status', 'processing',
    'hold_expires_at', v_reg.hold_expires_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.check_before_confirm(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. fulfill_pass_online_purchase (aus Snapshot, wie sell_pass mit stripe/card)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.fulfill_pass_online_purchase(
  p_attempt public.payment_attempts,
  p_provider_ref text,
  p_amount_cents integer,
  p_currency text,
  p_received_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_pass_id uuid;
  v_payment_id uuid;
  v_from date;
  v_until date;
  v_name text;
  v_units integer;
  v_price integer;
  v_rule text;
  v_value integer;
  v_product_id uuid;
  v_causation uuid := pg_catalog.gen_random_uuid();
  v_pay_event uuid;
  v_pass_event uuid;
  v_other_id uuid;
BEGIN
  IF p_attempt.payment_id IS NOT NULL THEN
    SELECT subject_id INTO v_pass_id
    FROM public.payments WHERE id = p_attempt.payment_id;
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'code', 'ALREADY_COMPLETED',
      'payment_id', p_attempt.payment_id,
      'pass_id', v_pass_id
    );
  END IF;

  v_product_id := (p_attempt.snapshot ->> 'product_id')::uuid;
  v_name := p_attempt.snapshot ->> 'name';
  v_units := (p_attempt.snapshot ->> 'units')::integer;
  v_price := (p_attempt.snapshot ->> 'price_cents')::integer;
  v_rule := p_attempt.snapshot ->> 'validity_rule';
  v_value := (p_attempt.snapshot ->> 'validity_value')::integer;

  IF v_name IS NULL OR v_units IS NULL OR v_price IS NULL
     OR v_rule IS NULL OR v_value IS NULL OR v_product_id IS NULL
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_SNAPSHOT');
  END IF;

  v_from := (pg_catalog.now() AT TIME ZONE 'Europe/Berlin')::date;
  v_until := yogaflow_private.pass_valid_until(v_rule, v_value, v_from);
  v_pass_id := pg_catalog.gen_random_uuid();
  v_payment_id := pg_catalog.gen_random_uuid();

  PERFORM pg_catalog.set_config('yogaflow.allow_payment_attempt_change', 'on', true);

  INSERT INTO public.payments (
    id, tenant_id, subject_type, subject_id, registration_id,
    provider, provider_ref, method, status,
    amount_cents, currency, received_at, recorded_by
  ) VALUES (
    v_payment_id,
    p_attempt.tenant_id,
    'pass_purchase',
    v_pass_id,
    NULL,
    'stripe'::public.payment_provider,
    p_provider_ref,
    'card'::public.payment_method,
    'succeeded'::public.payment_status,
    p_amount_cents,
    upper(COALESCE(p_currency, 'EUR')),
    COALESCE(p_received_at, pg_catalog.now()),
    NULL
  );

  INSERT INTO public.passes (
    id, tenant_id, member_id, product_id, name, units_total, price_cents,
    validity_rule, validity_value, valid_from, valid_until, payment_id, status
  ) VALUES (
    v_pass_id, p_attempt.tenant_id, p_attempt.member_id, v_product_id,
    v_name, v_units, v_price, v_rule, v_value, v_from, v_until, v_payment_id, 'active'
  );

  IF p_attempt.status IN ('initiated', 'processing') THEN
    UPDATE public.payment_attempts
    SET status = 'succeeded', payment_id = v_payment_id
    WHERE id = p_attempt.id;
  ELSE
    -- Späte Zahlung nach Cancel: Karte trotzdem anlegen, Status bleibt Endzustand
    UPDATE public.payment_attempts
    SET payment_id = v_payment_id
    WHERE id = p_attempt.id;
  END IF;

  UPDATE public.pass_purchase_consents
  SET payment_id = v_payment_id
  WHERE attempt_id = p_attempt.id
    AND payment_id IS NULL;

  FOR v_other_id IN
    SELECT a.id
    FROM public.payment_attempts a
    WHERE a.tenant_id = p_attempt.tenant_id
      AND a.member_id = p_attempt.member_id
      AND a.subject_id = p_attempt.subject_id
      AND a.subject_type = 'pass_product'
      AND a.id IS DISTINCT FROM p_attempt.id
      AND a.status IN ('initiated', 'processing')
    ORDER BY a.id
  LOOP
    PERFORM yogaflow_private.set_payment_attempt_status(
      v_other_id, 'canceled', 'SUPERSEDED', NULL
    );
  END LOOP;

  v_pay_event := yogaflow_private.insert_event(
    p_attempt.tenant_id,
    'payment.recorded',
    'payment',
    v_payment_id,
    pg_catalog.jsonb_build_object(
      'payment_id', v_payment_id,
      'pass_id', v_pass_id,
      'amount_cents', p_amount_cents,
      'currency', upper(COALESCE(p_currency, 'EUR')),
      'method', 'card',
      'provider', 'stripe',
      'received_at', COALESCE(p_received_at, pg_catalog.now())
    ),
    v_causation
  );

  v_pass_event := yogaflow_private.insert_event(
    p_attempt.tenant_id,
    'pass.purchased',
    'pass',
    v_pass_id,
    pg_catalog.jsonb_build_object(
      'pass_id', v_pass_id,
      'payment_id', v_payment_id,
      'member_id', p_attempt.member_id,
      'units', v_units,
      'price_cents', v_price,
      'valid_until', v_until,
      'method', 'card',
      'online', true
    ),
    v_causation
  );

  INSERT INTO public.pass_movements (
    tenant_id, pass_id, delta, kind, actor_member_id, event_id
  ) VALUES (
    p_attempt.tenant_id, v_pass_id, v_units, 'purchase', p_attempt.member_id, v_pass_event
  );

  PERFORM yogaflow_private.insert_audit(
    p_attempt.tenant_id, NULL, 'payment.recorded', 'payments', v_payment_id,
    ARRAY[
      'amount_cents', 'currency', 'method', 'provider',
      'status', 'received_at', 'subject_type', 'provider_ref'
    ]::text[],
    v_pay_event
  );

  PERFORM yogaflow_private.insert_audit(
    p_attempt.tenant_id, NULL, 'pass.purchased', 'passes', v_pass_id,
    ARRAY[
      'member_id', 'product_id', 'units_total', 'price_cents',
      'valid_from', 'valid_until', 'payment_id', 'status'
    ]::text[],
    v_pass_event
  );

  INSERT INTO public.user_notifications (
    tenant_id, user_id, type, body, course_id, action_path, metadata
  ) VALUES (
    p_attempt.tenant_id,
    p_attempt.member_id,
    'pass_purchased',
    pg_catalog.format('Deine %s ist bereit.', v_name),
    NULL,
    '/my-passes',
    pg_catalog.jsonb_build_object(
      'payment_id', v_payment_id,
      'pass_id', v_pass_id
    )
  );

  INSERT INTO public.email_deliveries (
    tenant_id, event_id, kind, registration_id, pass_id, status, next_attempt_at
  ) VALUES (
    p_attempt.tenant_id, v_pass_event, 'pass_purchased', NULL, v_pass_id,
    'pending', pg_catalog.now()
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'code', CASE
      WHEN p_attempt.status IN ('canceled', 'failed') THEN 'COMPLETED_AFTER_CANCEL'
      ELSE 'COMPLETED'
    END,
    'payment_id', v_payment_id,
    'pass_id', v_pass_id,
    'valid_until', v_until
  );
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.fulfill_pass_online_purchase(public.payment_attempts, text, integer, text, timestamptz)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. complete_online_payment — Dispatch pass_product
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
  v_pass_res jsonb;
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

  -- K1: Kartenkauf — auch nach Cancel/Failed noch erfüllen (kein Auto-Refund)
  IF v_attempt.subject_type = 'pass_product' THEN
    v_pass_res := yogaflow_private.fulfill_pass_online_purchase(
      v_attempt, p_provider_ref, p_amount_cents, p_currency, p_received_at
    );
    RETURN v_pass_res;
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
  'Abschluss Kurs (COMPLETED/RESTORED/REFUND_REQUIRED) oder K1 Karte (COMPLETED / COMPLETED_AFTER_CANCEL).';

REVOKE ALL ON FUNCTION yogaflow_private.complete_online_payment(text, integer, text, timestamptz, boolean)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. expire_pass_payment_attempts (30 Min → cancel → Cancel-PI-Job)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.expire_pass_payment_attempts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row public.payment_attempts%ROWTYPE;
  v_n integer := 0;
BEGIN
  FOR v_row IN
    SELECT *
    FROM public.payment_attempts
    WHERE subject_type = 'pass_product'
      AND status IN ('initiated', 'processing')
      AND expires_at IS NOT NULL
      AND expires_at <= pg_catalog.now()
    ORDER BY expires_at ASC, id ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM yogaflow_private.set_payment_attempt_status(
      v_row.id, 'canceled', 'ATTEMPT_EXPIRED', NULL
    );
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.expire_pass_payment_attempts()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT yogaflow_private.expire_pass_payment_attempts();
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.expire_pass_payment_attempts()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_pass_payment_attempts()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_pass_payment_attempts()
  TO service_role;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT jobid FROM cron.job WHERE jobname = 'yogaflow_expire_pass_payment_attempts'
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'yogaflow_expire_pass_payment_attempts',
    '* * * * *',
    $cron$SELECT yogaflow_private.expire_pass_payment_attempts();$cron$
  );
END;
$$;

DO $$
DECLARE
  v_def text;
BEGIN
  v_def := pg_catalog.pg_get_functiondef(
    'yogaflow_private.complete_online_payment(text,integer,text,timestamptz,boolean)'::regprocedure
  );
  IF position('pass_product' IN v_def) = 0
     OR position('fulfill_pass_online_purchase' IN v_def) = 0
  THEN
    RAISE EXCEPTION 'K1 checkout: complete ohne pass_product';
  END IF;
  IF has_function_privilege('authenticated', 'public.prepare_pass_online_payment(uuid,uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.prepare_pass_online_payment(uuid,uuid,text,text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'K1 checkout: prepare_pass zu weit freigegeben';
  END IF;
END;
$$;
