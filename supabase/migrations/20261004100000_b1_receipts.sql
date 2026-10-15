-- B1 Teil C — Belege (K8–K14). Ausstellen in derselben TX wie Zahlung/Erstattung (Trigger).
-- allow: next_receipt_number,issue_receipt_for_payment,issue_refund_receipt,trg_issue_receipt_on_payment,trg_issue_receipt_on_refund,get_receipt,get_receipt_by_payment,delete_tenant_complete
--
-- Kein Backfill bestehender Zahlungen.
--
-- Rückweg:
--   DROP TRIGGER IF EXISTS receipts_on_payment ON public.payments;
--   DROP TRIGGER IF EXISTS receipts_on_refund ON public.payment_refunds;
--   DROP FUNCTION IF EXISTS yogaflow_private.trg_issue_receipt_on_payment();
--   DROP FUNCTION IF EXISTS yogaflow_private.trg_issue_receipt_on_refund();
--   DROP FUNCTION IF EXISTS public.get_receipt_by_payment(uuid);
--   DROP FUNCTION IF EXISTS public.get_receipt(uuid);
--   DROP FUNCTION IF EXISTS yogaflow_private.issue_refund_receipt(uuid);
--   DROP FUNCTION IF EXISTS yogaflow_private.issue_receipt_for_payment(uuid);
--   DROP FUNCTION IF EXISTS yogaflow_private.next_receipt_number(uuid, timestamptz);
--   -- delete_tenant_complete aus 20261004090000 wiederherstellen
--   DROP TABLE IF EXISTS public.receipts;
--   DROP TABLE IF EXISTS public.receipt_counters;

CREATE TABLE public.receipt_counters (
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  year integer NOT NULL,
  last_no integer NOT NULL,
  PRIMARY KEY (tenant_id, year),
  CONSTRAINT receipt_counters_year_check CHECK (year BETWEEN 2000 AND 2100),
  CONSTRAINT receipt_counters_last_no_check CHECK (last_no >= 0)
);

COMMENT ON TABLE public.receipt_counters IS
  'B1 K10: Fortlaufende Belegnummer je Studio und Jahr.';

ALTER TABLE public.receipt_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.receipt_counters FROM PUBLIC, anon, authenticated;

CREATE TABLE public.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  number text NOT NULL,
  kind text NOT NULL,
  payment_id uuid NOT NULL REFERENCES public.payments (id) ON DELETE RESTRICT,
  refund_id uuid REFERENCES public.payment_refunds (id) ON DELETE RESTRICT,
  original_receipt_id uuid REFERENCES public.receipts (id) ON DELETE RESTRICT,
  issued_at timestamptz NOT NULL,
  amount_cents integer NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT receipts_kind_check CHECK (kind IN ('receipt', 'refund_receipt')),
  CONSTRAINT receipts_refund_kind_check CHECK (
    (kind = 'receipt' AND refund_id IS NULL AND original_receipt_id IS NULL)
    OR (kind = 'refund_receipt' AND refund_id IS NOT NULL AND original_receipt_id IS NOT NULL)
  ),
  CONSTRAINT receipts_number_format CHECK (number ~ '^[0-9]{4}-[0-9]{5}$'),
  CONSTRAINT receipts_tenant_number_key UNIQUE (tenant_id, number)
);

CREATE UNIQUE INDEX receipts_payment_unique
  ON public.receipts (payment_id)
  WHERE kind = 'receipt';

CREATE UNIQUE INDEX receipts_refund_unique
  ON public.receipts (refund_id)
  WHERE kind = 'refund_receipt';

CREATE INDEX receipts_tenant_issued_idx
  ON public.receipts (tenant_id, issued_at DESC);

COMMENT ON TABLE public.receipts IS
  'B1 K8–K11: Unveränderlicher Beleg-Schnappschuss. Nur Online-Zahlungen.';

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.receipts TO authenticated;

CREATE POLICY receipts_select_own ON public.receipts
  FOR SELECT TO authenticated
  USING (
    tenant_id = yogaflow_private.get_my_tenant_id()
    AND (
      yogaflow_private.is_tenant_manager()
      OR EXISTS (
        SELECT 1
        FROM public.payments p
        JOIN public.registrations r ON r.id = p.registration_id
        WHERE p.id = receipts.payment_id
          AND r.user_id = yogaflow_private.get_my_member_id()
      )
    )
  );

CREATE TRIGGER receipts_append_only
  BEFORE UPDATE OR DELETE ON public.receipts
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.enforce_append_only();

CREATE OR REPLACE FUNCTION yogaflow_private.next_receipt_number(
  p_tenant uuid,
  p_issued_at timestamptz
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_year integer;
  v_no integer;
BEGIN
  v_year := EXTRACT(YEAR FROM (p_issued_at AT TIME ZONE 'Europe/Berlin'))::integer;

  INSERT INTO public.receipt_counters (tenant_id, year, last_no)
  VALUES (p_tenant, v_year, 1)
  ON CONFLICT (tenant_id, year) DO UPDATE
    SET last_no = public.receipt_counters.last_no + 1
  RETURNING last_no INTO v_no;

  RETURN v_year::text || '-' || pg_catalog.lpad(v_no::text, 5, '0');
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.next_receipt_number(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;

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
BEGIN
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
    AND s.valid_from <= (pg_catalog.timezone('Europe/Berlin', pg_catalog.now()))::date
  ORDER BY s.valid_from DESC
  LIMIT 1;

  IF v_regime = 'regular' AND COALESCE(v_vat, 0) = 700 THEN
    v_tax_text := 'enthält 7 % USt';
  ELSIF v_regime = 'regular' THEN
    v_tax_text := 'enthält 19 % USt';
  ELSE
    v_tax_text := 'gemäß § 19 UStG ohne USt';
  END IF;

  v_service := pg_catalog.format(
    'Yogakurs ‚%s‘ am %s %s',
    COALESCE(v_course.title, 'Kurs'),
    pg_catalog.to_char(v_course.date, 'DD.MM.YYYY'),
    pg_catalog.to_char(COALESCE(v_course.time, TIME '00:00'), 'HH24:MI')
  );

  v_issued := COALESCE(v_pay.received_at, pg_catalog.now());
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
      'regime', COALESCE(v_regime, 'small_business'),
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

CREATE OR REPLACE FUNCTION yogaflow_private.issue_refund_receipt(p_refund_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_ref public.payment_refunds%ROWTYPE;
  v_orig public.receipts%ROWTYPE;
  v_issued timestamptz;
  v_number text;
  v_id uuid;
  v_snap jsonb;
BEGIN
  SELECT * INTO v_ref FROM public.payment_refunds WHERE id = p_refund_id;
  IF NOT FOUND OR v_ref.status IS DISTINCT FROM 'succeeded' THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_id
  FROM public.receipts
  WHERE refund_id = p_refund_id AND kind = 'refund_receipt';
  IF FOUND THEN
    RETURN v_id;
  END IF;

  SELECT * INTO v_orig
  FROM public.receipts
  WHERE payment_id = v_ref.payment_id AND kind = 'receipt';
  IF NOT FOUND THEN
    PERFORM yogaflow_private.issue_receipt_for_payment(v_ref.payment_id);
    SELECT * INTO v_orig
    FROM public.receipts
    WHERE payment_id = v_ref.payment_id AND kind = 'receipt';
  END IF;
  IF v_orig.id IS NULL THEN
    RETURN NULL;
  END IF;

  v_issued := COALESCE(v_ref.updated_at, pg_catalog.now());
  v_number := yogaflow_private.next_receipt_number(v_ref.tenant_id, v_issued);
  v_snap := v_orig.snapshot
    || pg_catalog.jsonb_build_object(
      'amount_cents', -ABS(v_ref.amount_cents),
      'original_number', v_orig.number,
      'refund_reason', v_ref.reason,
      'refund_note', v_ref.note
    );

  INSERT INTO public.receipts (
    tenant_id, number, kind, payment_id, refund_id, original_receipt_id,
    issued_at, amount_cents, snapshot
  ) VALUES (
    v_ref.tenant_id,
    v_number,
    'refund_receipt',
    v_ref.payment_id,
    v_ref.id,
    v_orig.id,
    v_issued,
    -ABS(v_ref.amount_cents),
    v_snap
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id
    FROM public.receipts
    WHERE refund_id = p_refund_id AND kind = 'refund_receipt';
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.issue_refund_receipt(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION yogaflow_private.trg_issue_receipt_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.provider = 'stripe'::public.payment_provider
     AND NEW.status = 'succeeded'::public.payment_status
     AND NEW.subject_type = 'registration' THEN
    PERFORM yogaflow_private.issue_receipt_for_payment(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER receipts_on_payment
  AFTER INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.trg_issue_receipt_on_payment();

CREATE OR REPLACE FUNCTION yogaflow_private.trg_issue_receipt_on_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.status = 'succeeded' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM yogaflow_private.issue_refund_receipt(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER receipts_on_refund
  AFTER INSERT OR UPDATE OF status ON public.payment_refunds
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.trg_issue_receipt_on_refund();

REVOKE ALL ON FUNCTION yogaflow_private.trg_issue_receipt_on_payment()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION yogaflow_private.trg_issue_receipt_on_refund()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_receipt(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member uuid := yogaflow_private.get_my_member_id();
  v_tenant uuid := yogaflow_private.get_my_tenant_id();
  v_row public.receipts%ROWTYPE;
  v_ok boolean := false;
BEGIN
  IF v_member IS NULL OR v_tenant IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_row FROM public.receipts WHERE id = p_id;
  IF NOT FOUND OR v_row.tenant_id IS DISTINCT FROM v_tenant THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF yogaflow_private.is_tenant_manager() THEN
    v_ok := true;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.payments p
      JOIN public.registrations r ON r.id = p.registration_id
      WHERE p.id = v_row.payment_id
        AND r.user_id = v_member
    ) INTO v_ok;
  END IF;

  IF NOT v_ok THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'id', v_row.id,
    'number', v_row.number,
    'kind', v_row.kind,
    'payment_id', v_row.payment_id,
    'refund_id', v_row.refund_id,
    'original_receipt_id', v_row.original_receipt_id,
    'issued_at', v_row.issued_at,
    'amount_cents', v_row.amount_cents,
    'snapshot', v_row.snapshot
  );
END;
$function$;

COMMENT ON FUNCTION public.get_receipt(uuid) IS
  'B1 K12: Beleg lesen. Teilnehmende eigene, Owner/Admin Studio, Lehrende nicht.';

REVOKE ALL ON FUNCTION public.get_receipt(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_receipt(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_receipt_by_payment(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_id uuid;
BEGIN
  SELECT r.id INTO v_id
  FROM public.receipts r
  WHERE r.payment_id = p_payment_id AND r.kind = 'receipt';
  IF v_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;
  RETURN public.get_receipt(v_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_receipt_by_payment(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_receipt_by_payment(uuid) TO authenticated;

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
    DELETE FROM public.receipts WHERE tenant_id = p_tenant_id;
    DELETE FROM public.receipt_counters WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenant_legal_profiles WHERE tenant_id = p_tenant_id;

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
    DELETE FROM public.payment_disputes WHERE tenant_id = p_tenant_id;
    DELETE FROM public.payment_refunds WHERE tenant_id = p_tenant_id;
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
  'Löscht Mandanten inkl. receipts / legal_profiles (B1). Nur postgres/service_role.';

REVOKE ALL ON FUNCTION public.delete_tenant_complete(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tenant_complete(uuid)
  TO postgres, service_role;

DO $$
BEGIN
  IF to_regclass('public.receipts') IS NULL OR to_regclass('public.receipt_counters') IS NULL THEN
    RAISE EXCEPTION 'B1: receipts-Tabellen fehlen';
  END IF;
  IF has_table_privilege('authenticated', 'public.receipts', 'INSERT')
     OR has_table_privilege('authenticated', 'public.receipts', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.receipts', 'DELETE')
     OR has_table_privilege('anon', 'public.receipts', 'SELECT') THEN
    RAISE EXCEPTION 'B1: receipts zu weit freigegeben';
  END IF;
  IF has_function_privilege('anon', 'public.get_receipt(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'B1: anon hat get_receipt';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_receipt(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'B1: authenticated ohne get_receipt';
  END IF;
  IF pg_catalog.pg_get_functiondef('public.delete_tenant_complete(uuid)'::regprocedure)
       NOT LIKE '%receipts%' THEN
    RAISE EXCEPTION 'B1: delete_tenant_complete ohne receipts';
  END IF;
END;
$$;
