-- B1 Nachtrag: Keine Belege für Umkehr-/Erstattungs-Zahlungszeilen (nur echte Einnahmen).
-- allow: issue_receipt_for_payment,trg_issue_receipt_on_payment,retry_missing_receipts
-- Befund E2E: payment mit reverses_payment_id und amount_cents < 0 erzeugte kind=receipt.

CREATE OR REPLACE FUNCTION yogaflow_private.issue_receipt_for_payment(p_payment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_pay public.payments%ROWTYPE;
  v_course public.courses%ROWTYPE;
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
     OR v_pay.subject_type IS DISTINCT FROM 'registration'
     OR v_pay.reverses_payment_id IS NOT NULL
     OR v_pay.amount_cents <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_id
  FROM public.receipts
  WHERE payment_id = p_payment_id AND kind = 'receipt';
  IF FOUND THEN
    RETURN v_id;
  END IF;

  v_issued := COALESCE(v_pay.received_at, pg_catalog.now());
  v_issued_date := (v_issued AT TIME ZONE 'Europe/Berlin')::date;

  SELECT c.* INTO v_course
  FROM public.courses c
  JOIN public.registrations r ON r.course_id = c.id
  WHERE r.id = v_pay.registration_id;

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

  v_service := pg_catalog.format(
    'Yogakurs ‚%s‘ am %s %s',
    COALESCE(v_course.title, 'Kurs'),
    pg_catalog.to_char(v_course.date, 'DD.MM.YYYY'),
    pg_catalog.to_char(COALESCE(v_course.time, TIME '00:00'), 'HH24:MI')
  );

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
    pg_catalog.jsonb_build_object(
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
    )
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

CREATE OR REPLACE FUNCTION yogaflow_private.trg_issue_receipt_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_code text;
BEGIN
  IF NEW.provider = 'stripe'::public.payment_provider
     AND NEW.status = 'succeeded'::public.payment_status
     AND NEW.subject_type = 'registration'
     AND NEW.reverses_payment_id IS NULL
     AND NEW.amount_cents > 0 THEN
    BEGIN
      PERFORM yogaflow_private.issue_receipt_for_payment(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      v_code := CASE
        WHEN SQLERRM LIKE 'TAX_STATUS_MISSING%' THEN 'TAX_STATUS_MISSING'
        WHEN SQLERRM LIKE 'FORCED_RECEIPT_FAIL%' THEN 'FORCED_RECEIPT_FAIL'
        ELSE 'UNEXPECTED:' || SQLSTATE
      END;
      PERFORM yogaflow_private.insert_event(
        NEW.tenant_id,
        'receipt.issue_failed',
        'payment',
        NEW.id,
        pg_catalog.jsonb_build_object(
          'payment_id', NEW.id,
          'error_code', v_code
        ),
        NEW.id
      );
    END;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.trg_issue_receipt_on_payment()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.retry_missing_receipts(p_tenant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_pay_id uuid;
  v_ref_id uuid;
  v_payments integer := 0;
  v_refunds integer := 0;
  v_pay_ok integer := 0;
  v_ref_ok integer := 0;
  v_rid uuid;
BEGIN
  FOR v_pay_id IN
    SELECT p.id
    FROM public.payments p
    WHERE p.provider = 'stripe'::public.payment_provider
      AND p.status = 'succeeded'::public.payment_status
      AND p.subject_type = 'registration'
      AND p.reverses_payment_id IS NULL
      AND p.amount_cents > 0
      AND (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.receipts r
        WHERE r.payment_id = p.id
          AND r.kind = 'receipt'
      )
    ORDER BY p.received_at NULLS LAST, p.created_at
    LIMIT 200
  LOOP
    v_payments := v_payments + 1;
    BEGIN
      v_rid := yogaflow_private.issue_receipt_for_payment(v_pay_id);
      IF v_rid IS NOT NULL THEN
        v_pay_ok := v_pay_ok + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  FOR v_ref_id IN
    SELECT rf.id
    FROM public.payment_refunds rf
    WHERE rf.status = 'succeeded'
      AND (p_tenant_id IS NULL OR rf.tenant_id = p_tenant_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.receipts r
        WHERE r.refund_id = rf.id
          AND r.kind = 'refund_receipt'
      )
    ORDER BY rf.updated_at NULLS LAST, rf.created_at
    LIMIT 200
  LOOP
    v_refunds := v_refunds + 1;
    BEGIN
      v_rid := yogaflow_private.issue_refund_receipt(v_ref_id);
      IF v_rid IS NOT NULL THEN
        v_ref_ok := v_ref_ok + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'payments_missing', v_payments,
    'payments_issued', v_pay_ok,
    'refunds_missing', v_refunds,
    'refunds_issued', v_ref_ok
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.retry_missing_receipts(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_missing_receipts(uuid)
  TO service_role;

DO $$
DECLARE
  v_def text;
BEGIN
  v_def := pg_catalog.pg_get_functiondef(
    'yogaflow_private.issue_receipt_for_payment(uuid)'::regprocedure
  );
  IF v_def NOT LIKE '%reverses_payment_id%' OR v_def NOT LIKE '%amount_cents <= 0%' THEN
    RAISE EXCEPTION 'B1: Umkehrzahlungen nicht ausgeschlossen';
  END IF;
END;
$$;
