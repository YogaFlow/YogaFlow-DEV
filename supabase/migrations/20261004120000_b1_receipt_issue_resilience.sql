-- B1 Nachtrag N1/N3/N4 — Belegfehler blockiert nie die Zahlung; Steuer zum Zahlungsdatum;
-- kein Raten bei fehlendem Steuerstatus (TAX_STATUS_MISSING → receipt.issue_failed).
-- allow: issue_receipt_for_payment,trg_issue_receipt_on_payment,trg_issue_receipt_on_refund,debug_insert_payment_force_receipt_fail
--
-- Rückweg:
--   Funktionen/Trigger aus 20261004100000 wiederherstellen.

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
  -- NEGATIV/FIXTURE: markierter Fehlerpfad für Tests (gleiche TX wie Insert).
  IF pg_catalog.current_setting('yogaflow.force_receipt_fail', true) = 'on' THEN
    RAISE EXCEPTION 'FORCED_RECEIPT_FAIL';
  END IF;

  SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_pay.provider IS DISTINCT FROM 'stripe'::public.payment_provider
     OR v_pay.status IS DISTINCT FROM 'succeeded'::public.payment_status
     OR v_pay.subject_type IS DISTINCT FROM 'registration' THEN
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

  -- N3: Steuerstatus zum Zahlungsdatum (Europe/Berlin), nicht „jetzt“.
  SELECT s.regime::text, s.vat_rate_bp
    INTO v_regime, v_vat
  FROM public.tenant_tax_settings s
  WHERE s.tenant_id = v_pay.tenant_id
    AND s.valid_from <= v_issued_date
  ORDER BY s.valid_from DESC
  LIMIT 1;

  -- N4: fehlender Steuerstatus nicht raten.
  IF v_regime IS NULL THEN
    RAISE EXCEPTION 'TAX_STATUS_MISSING';
  END IF;

  IF v_regime = 'regular' AND COALESCE(v_vat, 0) = 700 THEN
    v_tax_text := 'enthält 7 % USt';
  ELSIF v_regime = 'regular' THEN
    v_tax_text := 'enthält 19 % USt';
  ELSIF v_regime = 'small_business' THEN
    -- Kurzform im Schnappschuss (K8); Anzeige/Mail expandieren auf vollen Satz (N5).
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
     AND NEW.subject_type = 'registration' THEN
    BEGIN
      PERFORM yogaflow_private.issue_receipt_for_payment(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      -- N1: Zahlung läuft durch; nur IDs + Fehlercode, keine Personendaten.
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

CREATE OR REPLACE FUNCTION yogaflow_private.trg_issue_receipt_on_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_code text;
BEGIN
  IF NEW.status = 'succeeded' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    BEGIN
      PERFORM yogaflow_private.issue_refund_receipt(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      v_code := CASE
        WHEN SQLERRM LIKE 'TAX_STATUS_MISSING%' THEN 'TAX_STATUS_MISSING'
        WHEN SQLERRM LIKE 'FORCED_RECEIPT_FAIL%' THEN 'FORCED_RECEIPT_FAIL'
        ELSE 'UNEXPECTED:' || SQLSTATE
      END;
      PERFORM yogaflow_private.insert_event(
        NEW.tenant_id,
        'receipt.issue_failed',
        'payment_refund',
        NEW.id,
        pg_catalog.jsonb_build_object(
          'refund_id', NEW.id,
          'payment_id', NEW.payment_id,
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
REVOKE ALL ON FUNCTION yogaflow_private.trg_issue_receipt_on_refund()
  FROM PUBLIC, anon, authenticated;

-- Service-only Hilfsfunktion: Negativtest erzwingt Belegfehler in derselben TX wie die Zahlung.
CREATE OR REPLACE FUNCTION public.debug_insert_payment_force_receipt_fail(
  p_tenant_id uuid,
  p_registration_id uuid,
  p_amount_cents integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_id uuid;
  v_ref text;
BEGIN
  PERFORM pg_catalog.set_config('yogaflow.force_receipt_fail', 'on', true);
  v_ref := 'pi_force_' || pg_catalog.replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.payments (
    tenant_id, subject_type, subject_id, registration_id,
    provider, method, status, amount_cents, currency, provider_ref, received_at
  ) VALUES (
    p_tenant_id,
    'registration',
    p_registration_id,
    p_registration_id,
    'stripe',
    'card',
    'succeeded',
    p_amount_cents,
    'EUR',
    v_ref,
    pg_catalog.now()
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

COMMENT ON FUNCTION public.debug_insert_payment_force_receipt_fail(uuid, uuid, integer) IS
  'NEGATIV/FIXTURE: Zahlung mit erzwungenem Belegfehler (nur service_role, Teststudio).';

REVOKE ALL ON FUNCTION public.debug_insert_payment_force_receipt_fail(uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.debug_insert_payment_force_receipt_fail(uuid, uuid, integer)
  TO service_role;

DO $$
DECLARE
  v_def text;
BEGIN
  v_def := pg_catalog.pg_get_functiondef(
    'yogaflow_private.issue_receipt_for_payment(uuid)'::regprocedure
  );
  IF v_def NOT LIKE '%TAX_STATUS_MISSING%' THEN
    RAISE EXCEPTION 'B1 N4: issue_receipt_for_payment ohne TAX_STATUS_MISSING';
  END IF;
  IF v_def NOT LIKE '%v_issued_date%' AND v_def NOT LIKE '%AT TIME ZONE ''Europe/Berlin''%' THEN
    RAISE EXCEPTION 'B1 N3: Steuerdatum fehlt';
  END IF;
  v_def := pg_catalog.pg_get_functiondef(
    'yogaflow_private.trg_issue_receipt_on_payment()'::regprocedure
  );
  IF v_def NOT LIKE '%EXCEPTION WHEN OTHERS%'
     OR v_def NOT LIKE '%receipt.issue_failed%' THEN
    RAISE EXCEPTION 'B1 N1: Trigger ohne EXCEPTION/Event';
  END IF;
  IF has_function_privilege(
       'anon',
       'public.debug_insert_payment_force_receipt_fail(uuid,uuid,integer)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.debug_insert_payment_force_receipt_fail(uuid,uuid,integer)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'B1 N1: debug_force zu weit freigegeben';
  END IF;
END;
$$;
