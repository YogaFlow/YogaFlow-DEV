-- K1 — Belege pass_purchase, ops monitor, Ablauf-Mails 30/7, units_low auf redeem.
-- allow: issue_receipt_for_payment,trg_issue_receipt_on_payment,retry_missing_receipts,ops_monitor_collect,redeem_pass,enqueue_pass_expiry_reminders

-- ---------------------------------------------------------------------------
-- 1. issue_receipt_for_payment: registration + pass_purchase
-- ---------------------------------------------------------------------------

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
    RETURN v_id;
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
    v_service := pg_catalog.format(
      '%s ‚%s‘ (%s Termine, gültig bis %s)',
      CASE
        WHEN v_pass.units_total IS NOT NULL THEN v_pass.units_total::text || 'er-Karte'
        ELSE 'Karte'
      END,
      COALESCE(v_pass.name, 'Karte'),
      COALESCE(v_pass.units_total, 0),
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
     AND NEW.subject_type IN ('registration', 'pass_purchase')
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
      AND p.subject_type IN ('registration', 'pass_purchase')
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

-- ---------------------------------------------------------------------------
-- 2. ops_monitor_collect: pass_purchase in receipt_missing (Körper = O1–O4)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ops_monitor_collect()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_rows jsonb := '[]'::jsonb;
BEGIN
  INSERT INTO public.ops_cron_watch (jobname)
  SELECT j.jobname
  FROM cron.job j
  WHERE j.jobname LIKE 'yogaflow_%'
  ON CONFLICT (jobname) DO NOTHING;

  v_rows := v_rows || COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'key', t.slug || ':provider_jobs',
      'slug', t.slug,
      'kind', 'provider_jobs',
      'count', c.cnt
    ))
    FROM (
      SELECT j.tenant_id, COUNT(*)::integer AS cnt
      FROM public.provider_jobs j
      WHERE j.status = 'failed'
         OR (
           j.status IN ('pending', 'running')
           AND j.updated_at < pg_catalog.now() - interval '30 minutes'
         )
      GROUP BY j.tenant_id
    ) c
    JOIN public.tenants t ON t.id = c.tenant_id
  ), '[]'::jsonb);

  v_rows := v_rows || COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'key', t.slug || ':refunds_failed',
      'slug', t.slug,
      'kind', 'refunds_failed',
      'count', c.cnt
    ))
    FROM (
      SELECT r.tenant_id, COUNT(*)::integer AS cnt
      FROM public.payment_refunds r
      WHERE r.status = 'failed'
      GROUP BY r.tenant_id
    ) c
    JOIN public.tenants t ON t.id = c.tenant_id
  ), '[]'::jsonb);

  v_rows := v_rows || COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'key', COALESCE(t.slug, '_unresolved') || ':payment_orphan',
      'slug', COALESCE(t.slug, '_unresolved'),
      'kind', 'payment_orphan',
      'count', c.cnt
    ))
    FROM (
      SELECT e.tenant_id, COUNT(*)::integer AS cnt
      FROM public.provider_events_raw e
      WHERE e.processing_error = 'ORPHAN'
        AND e.reviewed_at IS NULL
      GROUP BY e.tenant_id
    ) c
    LEFT JOIN public.tenants t ON t.id = c.tenant_id
  ), '[]'::jsonb);

  v_rows := v_rows || COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'key', t.slug || ':disputes',
      'slug', t.slug,
      'kind', 'disputes',
      'count', c.cnt
    ))
    FROM (
      SELECT d.tenant_id, COUNT(*)::integer AS cnt
      FROM public.payment_disputes d
      WHERE d.status = 'needs_response'
      GROUP BY d.tenant_id
    ) c
    JOIN public.tenants t ON t.id = c.tenant_id
  ), '[]'::jsonb);

  v_rows := v_rows || COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'key', COALESCE(t.slug, '_unresolved') || ':provider_event_error',
      'slug', COALESCE(t.slug, '_unresolved'),
      'kind', 'provider_event_error',
      'count', c.cnt
    ))
    FROM (
      SELECT e.tenant_id, COUNT(*)::integer AS cnt
      FROM public.provider_events_raw e
      WHERE e.processing_error IS NOT NULL
        AND e.processing_error IS DISTINCT FROM 'ORPHAN'
        AND e.reviewed_at IS NULL
        AND NOT (
          e.processing_error = 'PAYMENT_NOT_READY'
          AND e.received_at > pg_catalog.now() - interval '30 minutes'
        )
      GROUP BY e.tenant_id
    ) c
    LEFT JOIN public.tenants t ON t.id = c.tenant_id
  ), '[]'::jsonb);

  v_rows := v_rows || COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'key', t.slug || ':email_failed',
      'slug', t.slug,
      'kind', 'email_failed',
      'count', c.cnt
    ))
    FROM (
      SELECT d.tenant_id, COUNT(*)::integer AS cnt
      FROM public.email_deliveries d
      WHERE d.status = 'failed'
      GROUP BY d.tenant_id
    ) c
    JOIN public.tenants t ON t.id = c.tenant_id
  ), '[]'::jsonb);

  v_rows := v_rows || COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'key', t.slug || ':ledger_stuck',
      'slug', t.slug,
      'kind', 'ledger_stuck',
      'count', c.cnt
    ))
    FROM (
      SELECT e.tenant_id, COUNT(*)::integer AS cnt
      FROM public.events e
      WHERE e.type IN ('payment.recorded', 'payment.reversed')
        AND e.occurred_at < pg_catalog.now() - interval '30 minutes'
        AND NOT EXISTS (
          SELECT 1 FROM public.ledger_event_log l WHERE l.event_id = e.id
        )
        AND EXISTS (
          SELECT 1
          FROM public.tenant_tax_settings s
          WHERE s.tenant_id = e.tenant_id
            AND s.valid_from <= (pg_catalog.timezone('Europe/Berlin', pg_catalog.now()))::date
        )
      GROUP BY e.tenant_id
    ) c
    JOIN public.tenants t ON t.id = c.tenant_id
  ), '[]'::jsonb);

  v_rows := v_rows || COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'key', '_platform:cron:' || x.jobname,
      'slug', '_platform',
      'kind', 'cron_' || x.jobname,
      'count', 1
    ))
    FROM (
      SELECT j.jobname
      FROM cron.job j
      JOIN public.ops_cron_watch w ON w.jobname = j.jobname
      WHERE j.jobname LIKE 'yogaflow_%'
        AND (
          EXISTS (
            SELECT 1
            FROM cron.job_run_details d
            WHERE d.jobid = j.jobid
              AND d.status = 'failed'
              AND d.start_time > pg_catalog.now() - interval '60 minutes'
          )
          OR public.ops_cron_is_due(
            j.schedule,
            w.first_seen,
            (
              SELECT pg_catalog.max(d.start_time)
              FROM cron.job_run_details d
              WHERE d.jobid = j.jobid
                AND d.status = 'succeeded'
            ),
            pg_catalog.now()
          )
        )
    ) x
  ), '[]'::jsonb);

  -- (i) inkl. pass_purchase (K1)
  v_rows := v_rows || COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'key', t.slug || ':receipt_missing',
      'slug', t.slug,
      'kind', 'receipt_missing',
      'count', c.cnt
    ))
    FROM (
      SELECT x.tenant_id, COUNT(*)::integer AS cnt
      FROM (
        SELECT p.tenant_id
        FROM public.payments p
        WHERE p.provider = 'stripe'::public.payment_provider
          AND p.status = 'succeeded'::public.payment_status
          AND p.subject_type IN ('registration', 'pass_purchase')
          AND p.reverses_payment_id IS NULL
          AND p.amount_cents > 0
          AND COALESCE(p.received_at, p.created_at) < pg_catalog.now() - interval '10 minutes'
          AND NOT EXISTS (
            SELECT 1 FROM public.receipts r
            WHERE r.payment_id = p.id AND r.kind = 'receipt'
          )
        UNION ALL
        SELECT rf.tenant_id
        FROM public.payment_refunds rf
        WHERE rf.status = 'succeeded'
          AND rf.updated_at < pg_catalog.now() - interval '10 minutes'
          AND NOT EXISTS (
            SELECT 1 FROM public.receipts r
            WHERE r.refund_id = rf.id AND r.kind = 'refund_receipt'
          )
      ) x
      GROUP BY x.tenant_id
    ) c
    JOIN public.tenants t ON t.id = c.tenant_id
  ), '[]'::jsonb);

  RETURN COALESCE(v_rows, '[]'::jsonb);
END;
$function$;

COMMENT ON FUNCTION public.ops_monitor_collect() IS
  'B2/K1: Zählwerte je Studio/Art inkl. pass_purchase-Belege. Nur service_role.';

REVOKE ALL ON FUNCTION public.ops_monitor_collect()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_monitor_collect()
  TO service_role;

-- ---------------------------------------------------------------------------
-- 3. redeem_pass: units_low Mail wenn remaining_after = 1
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.redeem_pass(
  p_registration_id uuid,
  p_pass_id uuid,
  p_actor uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_reg public.registrations%ROWTYPE;
  v_course public.courses%ROWTYPE;
  v_pass public.passes%ROWTYPE;
  v_remaining integer;
  v_movement_id uuid;
  v_event_id uuid;
  v_mail_event uuid;
  v_causation uuid := pg_catalog.gen_random_uuid();
  v_after integer;
BEGIN
  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = p_registration_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_OPEN';
  END IF;

  SELECT * INTO v_course
  FROM public.courses
  WHERE id = v_reg.course_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_PASS_ELIGIBLE';
  END IF;

  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = p_registration_id
  FOR UPDATE;

  IF v_reg.status IS DISTINCT FROM 'registered'::public.registration_status
     OR v_reg.cancellation_timestamp IS NOT NULL
     OR v_reg.coverage_status IS DISTINCT FROM 'open'::public.registration_coverage_status
  THEN
    RAISE EXCEPTION 'NOT_OPEN';
  END IF;

  IF COALESCE(v_course.pass_eligible, true) IS NOT TRUE THEN
    RAISE EXCEPTION 'NOT_PASS_ELIGIBLE';
  END IF;

  SELECT * INTO v_pass
  FROM public.passes
  WHERE id = p_pass_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PASS_MISMATCH';
  END IF;

  IF v_pass.member_id IS DISTINCT FROM v_reg.user_id
     OR v_pass.tenant_id IS DISTINCT FROM v_reg.tenant_id
     OR v_reg.tenant_id IS DISTINCT FROM v_course.tenant_id
  THEN
    RAISE EXCEPTION 'PASS_MISMATCH';
  END IF;

  IF v_pass.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'PASS_EXPIRED';
  END IF;

  IF v_pass.valid_until < v_course.date THEN
    RAISE EXCEPTION 'PASS_EXPIRED';
  END IF;

  v_remaining := yogaflow_private.pass_remaining(v_pass.id);
  IF v_remaining < 1 THEN
    RAISE EXCEPTION 'PASS_EMPTY';
  END IF;

  PERFORM pg_catalog.set_config('yogaflow.allow_pass_coverage', 'on', true);

  UPDATE public.registrations
  SET
    coverage_status = 'pass'::public.registration_coverage_status,
    pass_id = v_pass.id
  WHERE id = v_reg.id;

  v_after := v_remaining - 1;

  v_event_id := yogaflow_private.insert_event(
    v_reg.tenant_id,
    'pass.redeemed',
    'pass',
    v_pass.id,
    pg_catalog.jsonb_build_object(
      'pass_id', v_pass.id,
      'registration_id', v_reg.id,
      'remaining_after', v_after
    ),
    v_causation
  );

  INSERT INTO public.pass_movements (
    tenant_id,
    pass_id,
    delta,
    kind,
    registration_id,
    actor_member_id,
    event_id
  ) VALUES (
    v_reg.tenant_id,
    v_pass.id,
    -1,
    'redeem',
    v_reg.id,
    p_actor,
    v_event_id
  )
  RETURNING id INTO v_movement_id;

  PERFORM yogaflow_private.insert_audit(
    v_reg.tenant_id,
    p_actor,
    'pass.redeemed',
    'registrations',
    v_reg.id,
    ARRAY['coverage_status', 'pass_id']::text[],
    v_event_id
  );

  -- K1: einmal „Noch 1 Termin“, außer Ablauf ≤ 7 Tage
  IF v_after = 1
     AND v_pass.units_low_sent_at IS NULL
     AND v_pass.valid_until > ((pg_catalog.now() AT TIME ZONE 'Europe/Berlin')::date + 7)
  THEN
    v_mail_event := yogaflow_private.insert_event(
      v_reg.tenant_id,
      'pass.units_low',
      'pass',
      v_pass.id,
      pg_catalog.jsonb_build_object('pass_id', v_pass.id, 'remaining', 1),
      v_causation
    );
    INSERT INTO public.email_deliveries (
      tenant_id, event_id, kind, registration_id, pass_id, status, next_attempt_at
    ) VALUES (
      v_reg.tenant_id, v_mail_event, 'pass_units_low', NULL, v_pass.id,
      'pending', pg_catalog.now()
    );
    UPDATE public.passes
    SET units_low_sent_at = pg_catalog.now()
    WHERE id = v_pass.id;
  END IF;

  RETURN v_movement_id;
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.redeem_pass(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Tägliche Ablauf-Erinnerungen 30/7
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.enqueue_pass_expiry_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_pass public.passes%ROWTYPE;
  v_n integer := 0;
  v_today date := (pg_catalog.now() AT TIME ZONE 'Europe/Berlin')::date;
  v_event uuid;
  v_remaining integer;
BEGIN
  FOR v_pass IN
    SELECT *
    FROM public.passes
    WHERE status = 'active'
      AND (
        (reminder_30_sent_at IS NULL AND valid_until = v_today + 30)
        OR (reminder_7_sent_at IS NULL AND valid_until = v_today + 7)
      )
    ORDER BY valid_until ASC, id ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    v_remaining := yogaflow_private.pass_remaining(v_pass.id);
    IF v_remaining <= 0 THEN
      CONTINUE;
    END IF;

    -- kürzer als 30 Tage: nur 7-Tage-Mail (keine 30er, wenn Kauffenster < 30)
    IF v_pass.reminder_30_sent_at IS NULL
       AND v_pass.valid_until = v_today + 30
       AND (v_pass.valid_until - v_pass.valid_from) >= 30
    THEN
      v_event := yogaflow_private.insert_event(
        v_pass.tenant_id, 'pass.expiring_30', 'pass', v_pass.id,
        pg_catalog.jsonb_build_object(
          'pass_id', v_pass.id, 'valid_until', v_pass.valid_until, 'remaining', v_remaining
        ),
        pg_catalog.gen_random_uuid()
      );
      INSERT INTO public.email_deliveries (
        tenant_id, event_id, kind, registration_id, pass_id, status, next_attempt_at
      ) VALUES (
        v_pass.tenant_id, v_event, 'pass_expiring_30', NULL, v_pass.id, 'pending', pg_catalog.now()
      );
      UPDATE public.passes SET reminder_30_sent_at = pg_catalog.now() WHERE id = v_pass.id;
      v_n := v_n + 1;
    END IF;

    IF v_pass.reminder_7_sent_at IS NULL
       AND v_pass.valid_until = v_today + 7
    THEN
      v_event := yogaflow_private.insert_event(
        v_pass.tenant_id, 'pass.expiring_7', 'pass', v_pass.id,
        pg_catalog.jsonb_build_object(
          'pass_id', v_pass.id, 'valid_until', v_pass.valid_until, 'remaining', v_remaining
        ),
        pg_catalog.gen_random_uuid()
      );
      INSERT INTO public.email_deliveries (
        tenant_id, event_id, kind, registration_id, pass_id, status, next_attempt_at
      ) VALUES (
        v_pass.tenant_id, v_event, 'pass_expiring_7', NULL, v_pass.id, 'pending', pg_catalog.now()
      );
      UPDATE public.passes SET reminder_7_sent_at = pg_catalog.now() WHERE id = v_pass.id;
      v_n := v_n + 1;
    END IF;
  END LOOP;

  RETURN v_n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_pass_expiry_reminders()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT yogaflow_private.enqueue_pass_expiry_reminders();
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.enqueue_pass_expiry_reminders()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_pass_expiry_reminders()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_pass_expiry_reminders()
  TO service_role;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT jobid FROM cron.job WHERE jobname = 'yogaflow_pass_expiry_reminders'
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'yogaflow_pass_expiry_reminders',
    '15 6 * * *',
    $cron$SELECT yogaflow_private.enqueue_pass_expiry_reminders();$cron$
  );
END;
$$;

DO $$
DECLARE
  v_def text;
BEGIN
  v_def := pg_catalog.pg_get_functiondef(
    'yogaflow_private.issue_receipt_for_payment(uuid)'::regprocedure
  );
  IF position('pass_purchase' IN v_def) = 0 THEN
    RAISE EXCEPTION 'K1 receipts: issue_receipt ohne pass_purchase';
  END IF;

  v_def := pg_catalog.pg_get_functiondef(
    'public.ops_monitor_collect()'::regprocedure
  );
  IF position('pass_purchase' IN v_def) = 0 THEN
    RAISE EXCEPTION 'K1 ops: collect ohne pass_purchase';
  END IF;

  v_def := pg_catalog.pg_get_functiondef(
    'yogaflow_private.redeem_pass(uuid,uuid,uuid)'::regprocedure
  );
  IF position('pass_units_low' IN v_def) = 0 THEN
    RAISE EXCEPTION 'K1 emails: redeem ohne units_low';
  END IF;
END;
$$;
