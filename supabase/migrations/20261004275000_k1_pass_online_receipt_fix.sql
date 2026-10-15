-- K1 — Beleg erst nach Pass-Anlage; issue_receipt wartet wenn Pass fehlt.
-- allow: issue_receipt_for_payment,fulfill_pass_online_purchase

CREATE OR REPLACE FUNCTION yogaflow_private.issue_receipt_for_payment(p_payment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_pay public.payments%ROWTYPE;
  v_course public.courses%ROWTYPE;
  v_pass public.passes%ROWTYPE;
  v_prof public.tenant_legal_profiles%ROWTYPE;
  v_regime text;
  v_vat integer;
  v_tax_text text;
  v_service text;
  v_issued timestamptz;
  v_number text;
  v_id uuid;
  v_tenant_name text;
  v_issued_date date;
  v_snapshot jsonb;
BEGIN
  IF pg_catalog.current_setting('yogaflow.force_receipt_fail', true) = 'on' THEN
    RAISE EXCEPTION 'FORCED_RECEIPT_FAIL';
  END IF;

  SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_pay.provider IS DISTINCT FROM 'stripe'::public.payment_provider
     OR v_pay.status IS DISTINCT FROM 'succeeded'::public.payment_status
     OR v_pay.subject_type NOT IN ('registration', 'pass_purchase')
     OR v_pay.reverses_payment_id IS NOT NULL
     OR v_pay.amount_cents <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_id
  FROM public.receipts
  WHERE payment_id = p_payment_id AND kind = 'receipt';
  IF FOUND THEN
    -- Kaputter Früh-Beleg (Pass fehlte beim Trigger): ersetzen
    IF v_pay.subject_type = 'pass_purchase'
       AND EXISTS (
         SELECT 1 FROM public.receipts r
         WHERE r.id = v_id
           AND (
             r.snapshot ->> 'pass_id' IS NULL
             OR COALESCE(r.snapshot ->> 'pass_units', '') IN ('', '0')
             OR COALESCE(r.snapshot ->> 'service_text', '') LIKE 'Karte ‚Karte‘%'
           )
       )
    THEN
      PERFORM pg_catalog.set_config('yogaflow.allow_append_only_delete', 'on', true);
      DELETE FROM public.receipts WHERE id = v_id;
      v_id := NULL;
    ELSE
      RETURN v_id;
    END IF;
  END IF;

  v_issued := COALESCE(v_pay.received_at, pg_catalog.now());
  v_issued_date := (v_issued AT TIME ZONE 'Europe/Berlin')::date;

  SELECT * INTO v_prof
  FROM public.tenant_legal_profiles
  WHERE tenant_id = v_pay.tenant_id;

  SELECT t.name INTO v_tenant_name
  FROM public.tenants t
  WHERE t.id = v_pay.tenant_id;

  SELECT s.regime::text, s.vat_rate_bp
    INTO v_regime, v_vat
  FROM public.tenant_tax_settings s
  WHERE s.tenant_id = v_pay.tenant_id
    AND s.valid_from <= v_issued_date
  ORDER BY s.valid_from DESC
  LIMIT 1;

  IF v_regime IS NULL THEN
    RAISE EXCEPTION 'TAX_STATUS_MISSING';
  END IF;

  IF v_regime = 'regular' AND COALESCE(v_vat, 0) = 700 THEN
    v_tax_text := 'enthält 7 % USt';
  ELSIF v_regime = 'regular' THEN
    v_tax_text := 'enthält 19 % USt';
  ELSIF v_regime = 'small_business' THEN
    v_tax_text := 'gemäß § 19 UStG ohne USt';
  ELSE
    RAISE EXCEPTION 'TAX_STATUS_MISSING';
  END IF;

  IF v_pay.subject_type = 'registration' THEN
    SELECT c.* INTO v_course
    FROM public.courses c
    JOIN public.registrations r ON r.course_id = c.id
    WHERE r.id = v_pay.registration_id;

    v_service := pg_catalog.format(
      'Yogakurs ‚%s‘ am %s %s',
      COALESCE(v_course.title, 'Kurs'),
      pg_catalog.to_char(v_course.date, 'DD.MM.YYYY'),
      pg_catalog.to_char(COALESCE(v_course.time, TIME '00:00'), 'HH24:MI')
    );

    v_snapshot := pg_catalog.jsonb_build_object(
      'legal_name', COALESCE(v_prof.legal_name, v_tenant_name, ''),
      'street', COALESCE(v_prof.street, ''),
      'house_number', COALESCE(v_prof.house_number, ''),
      'postal_code', COALESCE(v_prof.postal_code, ''),
      'city', COALESCE(v_prof.city, ''),
      'country', COALESCE(v_prof.country, 'DE'),
      'contact_email', COALESCE(v_prof.contact_email, ''),
      'phone', v_prof.phone,
      'tax_id', v_prof.tax_id,
      'regime', v_regime,
      'vat_rate_bp', COALESCE(v_vat, 0),
      'tax_text', v_tax_text,
      'service_text', v_service,
      'course_title', v_course.title,
      'course_date', v_course.date,
      'course_time', v_course.time,
      'amount_cents', v_pay.amount_cents
    );
  ELSE
    SELECT * INTO v_pass FROM public.passes WHERE id = v_pay.subject_id;
    IF NOT FOUND THEN
      -- Trigger läuft vor Pass-INSERT → später erneut (fulfill / retry)
      RETURN NULL;
    END IF;

    v_service := pg_catalog.format(
      '%ser-Karte ‚%s‘ (%s Termine, gültig bis %s)',
      v_pass.units_total,
      v_pass.name,
      v_pass.units_total,
      pg_catalog.to_char(v_pass.valid_until, 'DD.MM.YYYY')
    );

    v_snapshot := pg_catalog.jsonb_build_object(
      'legal_name', COALESCE(v_prof.legal_name, v_tenant_name, ''),
      'street', COALESCE(v_prof.street, ''),
      'house_number', COALESCE(v_prof.house_number, ''),
      'postal_code', COALESCE(v_prof.postal_code, ''),
      'city', COALESCE(v_prof.city, ''),
      'country', COALESCE(v_prof.country, 'DE'),
      'contact_email', COALESCE(v_prof.contact_email, ''),
      'phone', v_prof.phone,
      'tax_id', v_prof.tax_id,
      'regime', v_regime,
      'vat_rate_bp', COALESCE(v_vat, 0),
      'tax_text', v_tax_text,
      'service_text', v_service,
      'pass_id', v_pass.id,
      'pass_name', v_pass.name,
      'pass_units', v_pass.units_total,
      'pass_valid_until', v_pass.valid_until,
      'amount_cents', v_pay.amount_cents
    );
  END IF;

  v_number := yogaflow_private.next_receipt_number(v_pay.tenant_id, v_issued);

  INSERT INTO public.receipts (
    tenant_id, number, kind, payment_id, refund_id, original_receipt_id,
    issued_at, amount_cents, snapshot
  ) VALUES (
    v_pay.tenant_id,
    v_number,
    'receipt',
    v_pay.id,
    NULL,
    NULL,
    v_issued,
    v_pay.amount_cents,
    v_snapshot
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id
    FROM public.receipts
    WHERE payment_id = p_payment_id AND kind = 'receipt';
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.issue_receipt_for_payment(uuid)
  FROM PUBLIC, anon, authenticated;

-- fulfill: nach Pass-INSERT Beleg nachziehen
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
  v_receipt uuid;
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

  -- Beleg jetzt (Trigger lief zu früh ohne Pass)
  v_receipt := yogaflow_private.issue_receipt_for_payment(v_payment_id);

  IF p_attempt.status IN ('initiated', 'processing') THEN
    UPDATE public.payment_attempts
    SET status = 'succeeded', payment_id = v_payment_id
    WHERE id = p_attempt.id;
  ELSE
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
      'pass_id', v_pass_id,
      'receipt_id', v_receipt
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

DO $$
DECLARE
  v_def text;
BEGIN
  v_def := pg_catalog.pg_get_functiondef(
    'yogaflow_private.issue_receipt_for_payment(uuid)'::regprocedure
  );
  IF position('RETURN NULL' IN v_def) = 0 THEN
    RAISE EXCEPTION 'K1 receipt fix: early return fehlt';
  END IF;
END;
$$;
