-- A5 — Karte vor Ort verkaufen.
--
-- Zweck: Tabellen passes und pass_movements; Verkauf (sell_pass), Storno
-- (revoke_pass), Lesen ohne Preis (get_member_passes), verkaufbare Produkte
-- für Kassierer (get_sellable_pass_products). Zahlung subject_type
-- pass_purchase; Gegenzeile über gemeinsame yogaflow_private-Hilfe.
--
-- Bezug: A5, N2, N3, I1, E13, V1–V6.
-- V1: Verkauf Owner/Admin/Lehrende. Lehrende stornieren eigenen Verkauf
--     15 Minuten (wie A3/P4), danach nur Owner/Admin.
-- V2: Kassier-Ansicht und Personenverwaltung (Oberfläche Schritt 2).
-- V3: Storno unbenutzter Karten; Gegenzeile automatisch. Benutzte → A6.
-- V4: Zahlarten cash/paypal_manual/bank_transfer; Betrag = Produktpreis.
-- V5: years_to_year_end n → 31.12.(Kaufjahr+n); months n → Kaufdatum+n Monate
--     (Europe/Berlin).
-- V6: SELECT Owner/Admin alle, Teilnehmende eigene. Lehrende kein Tabellen-
--     SELECT auf passes, nur get_member_passes (ohne Preis). Produkte zum
--     Verkauf: get_sellable_pass_products (mit Preis; A4 K3 blockiert SELECT).
--
-- Event-Namen: pass.purchased, pass.revoked; payment.recorded / .reversed
-- wie A3. Payload ohne Name. p_note nur in pass_movements.reason.
--
-- Löschschalter: pass_movements nutzt yogaflow.allow_append_only_delete
-- (wie events/audit_log). passes: yogaflow.allow_pass_delete.
-- Statuswechsel: yogaflow.allow_pass_change (Muster courses_status_guard).
--
-- Rückweg (ausführbar; diese Zeilen sind Kommentar und laufen hier nicht).
-- Zuerst delete_tenant_complete und reverse_manual_payment / remove_member
-- auf die A4-/A3-/4.3-Fassungen zurücksetzen, dann Objekte entfernen.
--
-- CREATE OR REPLACE FUNCTION public.delete_tenant_complete(p_tenant_id uuid)
--   … A4-Fassung (ohne pass_movements/passes) …
-- CREATE OR REPLACE FUNCTION public.reverse_manual_payment(uuid, text)
--   … A3-Fassung …
-- CREATE OR REPLACE FUNCTION public.remove_member(uuid)
--   … 4.3-Fassung ohne passes …
-- DROP FUNCTION IF EXISTS public.get_sellable_pass_products();
-- DROP FUNCTION IF EXISTS public.get_member_passes(uuid);
-- DROP FUNCTION IF EXISTS public.revoke_pass(uuid, text);
-- DROP FUNCTION IF EXISTS public.sell_pass(uuid, uuid, text);
-- DROP FUNCTION IF EXISTS yogaflow_private.insert_manual_payment_reversal(public.payments, uuid, text);
-- DROP FUNCTION IF EXISTS yogaflow_private.pass_remaining(uuid);
-- DROP FUNCTION IF EXISTS yogaflow_private.pass_valid_until(text, integer, date);
-- DROP TRIGGER IF EXISTS passes_no_delete ON public.passes;
-- DROP TRIGGER IF EXISTS passes_guard ON public.passes;
-- DROP TRIGGER IF EXISTS pass_movements_append_only ON public.pass_movements;
-- DROP FUNCTION IF EXISTS yogaflow_private.passes_no_delete();
-- DROP FUNCTION IF EXISTS yogaflow_private.passes_guard();
-- DROP TABLE IF EXISTS public.pass_movements;
-- DROP TABLE IF EXISTS public.passes;

-- ---------------------------------------------------------------------------
-- 1. Tabelle public.passes
-- ---------------------------------------------------------------------------

CREATE TABLE public.passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  member_id uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.pass_products (id) ON DELETE RESTRICT,
  name text NOT NULL,
  units_total integer NOT NULL,
  price_cents integer NOT NULL,
  validity_rule text NOT NULL,
  validity_value integer NOT NULL,
  valid_from date NOT NULL,
  valid_until date NOT NULL,
  payment_id uuid NOT NULL REFERENCES public.payments (id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active',
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT passes_name_length_check
    CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  CONSTRAINT passes_units_total_check
    CHECK (units_total BETWEEN 1 AND 100),
  CONSTRAINT passes_price_check
    CHECK (price_cents > 0 AND price_cents <= 1000000),
  CONSTRAINT passes_validity_rule_check
    CHECK (validity_rule IN ('years_to_year_end', 'months')),
  CONSTRAINT passes_validity_value_check
    CHECK (
      (validity_rule = 'years_to_year_end' AND validity_value BETWEEN 1 AND 3)
      OR (validity_rule = 'months' AND validity_value BETWEEN 1 AND 60)
    ),
  CONSTRAINT passes_valid_range_check
    CHECK (valid_until >= valid_from),
  CONSTRAINT passes_status_check
    CHECK (status IN ('active', 'expired', 'revoked')),
  CONSTRAINT passes_revoked_at_check
    CHECK ((status = 'revoked') = (revoked_at IS NOT NULL)),
  CONSTRAINT passes_payment_id_unique UNIQUE (payment_id)
);

COMMENT ON TABLE public.passes IS
  'Verkaufte Karten je Profil. Werte vom Produkt zum Verkaufszeitpunkt kopiert. Schreiben nur über sell_pass/revoke_pass.';

CREATE INDEX passes_tenant_id_idx ON public.passes (tenant_id);
CREATE INDEX passes_member_id_idx ON public.passes (member_id);

ALTER TABLE public.passes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS passes_select ON public.passes;
CREATE POLICY passes_select
  ON public.passes FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT yogaflow_private.get_my_tenant_id())
    AND (
      (SELECT yogaflow_private.is_tenant_manager())
      OR member_id = (SELECT yogaflow_private.get_my_member_id())
    )
  );

REVOKE ALL ON TABLE public.passes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.passes TO authenticated;

CREATE OR REPLACE FUNCTION yogaflow_private.passes_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF pg_catalog.current_setting('yogaflow.allow_pass_delete', true) = 'on'
     AND current_user::text NOT IN ('anon', 'authenticated')
  THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'passes: DELETE ist nicht erlaubt'
    USING ERRCODE = '42501';
END;
$function$;

CREATE TRIGGER passes_no_delete
  BEFORE DELETE ON public.passes
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.passes_no_delete();

CREATE OR REPLACE FUNCTION yogaflow_private.passes_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.member_id IS DISTINCT FROM OLD.member_id
       OR NEW.product_id IS DISTINCT FROM OLD.product_id
       OR NEW.name IS DISTINCT FROM OLD.name
       OR NEW.units_total IS DISTINCT FROM OLD.units_total
       OR NEW.price_cents IS DISTINCT FROM OLD.price_cents
       OR NEW.validity_rule IS DISTINCT FROM OLD.validity_rule
       OR NEW.validity_value IS DISTINCT FROM OLD.validity_value
       OR NEW.valid_from IS DISTINCT FROM OLD.valid_from
       OR NEW.valid_until IS DISTINCT FROM OLD.valid_until
       OR NEW.payment_id IS DISTINCT FROM OLD.payment_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'passes: diese Spalten sind unveränderlich'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.revoked_at IS NOT DISTINCT FROM OLD.revoked_at
    THEN
      RETURN NEW;
    END IF;

    IF pg_catalog.current_setting('yogaflow.allow_pass_change', true) = 'on'
       AND current_user::text NOT IN ('anon', 'authenticated')
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'passes: Status nur über revoke_pass'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER passes_guard
  BEFORE UPDATE ON public.passes
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.passes_guard();

REVOKE ALL ON FUNCTION yogaflow_private.passes_no_delete()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION yogaflow_private.passes_guard()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Tabelle public.pass_movements (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE public.pass_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  pass_id uuid NOT NULL REFERENCES public.passes (id) ON DELETE RESTRICT,
  delta integer NOT NULL,
  kind text NOT NULL,
  registration_id uuid REFERENCES public.registrations (id) ON DELETE RESTRICT,
  reason text NULL,
  actor_member_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  event_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pass_movements_delta_nonzero
    CHECK (delta <> 0),
  CONSTRAINT pass_movements_kind_check
    CHECK (kind IN (
      'purchase',
      'redeem',
      'redeem_reversal',
      'expire',
      'revoke',
      'manual_adjustment'
    )),
  CONSTRAINT pass_movements_reason_length_check
    CHECK (reason IS NULL OR length(reason) <= 200),
  CONSTRAINT pass_movements_manual_reason_check
    CHECK (kind <> 'manual_adjustment' OR (reason IS NOT NULL AND length(btrim(reason)) > 0))
);

COMMENT ON TABLE public.pass_movements IS
  'Append-only Bewegungen einer Karte. Stand = Summe delta. Schreiben nur über RPCs.';

CREATE INDEX pass_movements_pass_id_idx ON public.pass_movements (pass_id);
CREATE INDEX pass_movements_tenant_id_idx ON public.pass_movements (tenant_id);

ALTER TABLE public.pass_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pass_movements_select ON public.pass_movements;
CREATE POLICY pass_movements_select
  ON public.pass_movements FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT yogaflow_private.get_my_tenant_id())
    AND (
      (SELECT yogaflow_private.is_tenant_manager())
      OR pass_id IN (
        SELECT p.id
        FROM public.passes p
        WHERE p.member_id = (SELECT yogaflow_private.get_my_member_id())
      )
    )
  );

REVOKE ALL ON TABLE public.pass_movements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.pass_movements TO authenticated;

CREATE TRIGGER pass_movements_append_only
  BEFORE UPDATE OR DELETE ON public.pass_movements
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.enforce_append_only();

CREATE OR REPLACE FUNCTION yogaflow_private.pass_remaining(p_pass_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(pg_catalog.sum(m.delta), 0)::integer
  FROM public.pass_movements m
  WHERE m.pass_id = p_pass_id;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.pass_remaining(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION yogaflow_private.pass_valid_until(
  p_rule text,
  p_value integer,
  p_from date
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_rule = 'years_to_year_end' THEN
    RETURN pg_catalog.make_date(
      (EXTRACT(YEAR FROM p_from))::integer + p_value,
      12,
      31
    );
  END IF;

  IF p_rule = 'months' THEN
    RETURN (p_from + (p_value::text || ' months')::interval)::date;
  END IF;

  RAISE EXCEPTION 'INVALID_VALIDITY'
    USING ERRCODE = '22023';
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.pass_valid_until(text, integer, date)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Gemeinsame Gegenzeile (A3 reverse + A5 revoke)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.insert_manual_payment_reversal(
  p_original public.payments,
  p_actor_member_id uuid,
  p_note text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_new_id uuid;
  v_amount integer;
BEGIN
  IF p_original.provider IS DISTINCT FROM 'manual'::public.payment_provider
     OR p_original.reverses_payment_id IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM public.payments rev
       WHERE rev.reverses_payment_id = p_original.id
     )
  THEN
    RETURN NULL;
  END IF;

  v_amount := -p_original.amount_cents;

  BEGIN
    INSERT INTO public.payments (
      tenant_id,
      subject_type,
      subject_id,
      registration_id,
      provider,
      method,
      status,
      amount_cents,
      currency,
      reverses_payment_id,
      received_at,
      recorded_by,
      note
    ) VALUES (
      p_original.tenant_id,
      p_original.subject_type,
      p_original.subject_id,
      p_original.registration_id,
      'manual'::public.payment_provider,
      p_original.method,
      'succeeded'::public.payment_status,
      v_amount,
      'EUR',
      p_original.id,
      pg_catalog.now(),
      p_actor_member_id,
      p_note
    )
    RETURNING id INTO v_new_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN NULL;
  END;

  RETURN v_new_id;
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.insert_manual_payment_reversal(public.payments, uuid, text)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. reverse_manual_payment: USE_REVOKE_PASS + gemeinsame Hilfe
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reverse_manual_payment(
  p_payment_id uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid;
  v_tenant_id uuid;
  v_pay public.payments%ROWTYPE;
  v_row public.registrations%ROWTYPE;
  v_note text;
  v_payment_id uuid;
  v_amount integer;
  v_event_id uuid;
  v_open boolean;
  v_received timestamptz;
BEGIN
  v_member_id := yogaflow_private.get_my_member_id();
  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_member_id IS NULL OR v_tenant_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT *
    INTO v_pay
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND OR v_pay.tenant_id IS DISTINCT FROM v_tenant_id THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_pay.subject_type = 'pass_purchase' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'USE_REVOKE_PASS');
  END IF;

  IF v_pay.registration_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  SELECT *
    INTO v_row
  FROM public.registrations
  WHERE id = v_pay.registration_id
  FOR UPDATE;

  IF NOT FOUND OR v_row.tenant_id IS DISTINCT FROM v_tenant_id THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF NOT yogaflow_private.is_tenant_manager() THEN
    IF v_pay.recorded_by IS DISTINCT FROM v_member_id
       OR v_pay.created_at <= pg_catalog.now() - interval '15 minutes'
    THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
    END IF;
  END IF;

  v_note := NULLIF(pg_catalog.btrim(p_note), '');
  v_payment_id := yogaflow_private.insert_manual_payment_reversal(
    v_pay,
    v_member_id,
    v_note
  );

  IF v_payment_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ALREADY_REVERSED');
  END IF;

  v_amount := -v_pay.amount_cents;
  SELECT received_at INTO v_received FROM public.payments WHERE id = v_payment_id;

  v_open := NOT EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.registration_id = v_row.id
      AND p.amount_cents > 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.payments rev
        WHERE rev.reverses_payment_id = p.id
      )
  );

  IF v_open AND v_row.coverage_status = 'paid'::public.registration_coverage_status THEN
    UPDATE public.registrations
    SET coverage_status = 'open'::public.registration_coverage_status
    WHERE id = v_row.id;
  END IF;

  v_event_id := yogaflow_private.insert_event(
    v_pay.tenant_id,
    'payment.reversed',
    'payment',
    v_payment_id,
    pg_catalog.jsonb_build_object(
      'payment_id', v_payment_id,
      'registration_id', v_pay.registration_id,
      'amount_cents', v_amount,
      'currency', 'EUR',
      'method', v_pay.method::text,
      'provider', 'manual',
      'received_at', v_received,
      'reverses_payment_id', v_pay.id
    ),
    pg_catalog.gen_random_uuid()
  );

  PERFORM yogaflow_private.insert_audit(
    v_pay.tenant_id,
    v_member_id,
    'payment.reversed',
    'payments',
    v_payment_id,
    ARRAY[
      'amount_cents',
      'method',
      'status',
      'reverses_payment_id',
      'received_at',
      'recorded_by',
      'note'
    ]::text[],
    v_event_id
  );

  IF v_open AND v_row.coverage_status = 'paid'::public.registration_coverage_status THEN
    PERFORM yogaflow_private.insert_audit(
      v_pay.tenant_id,
      v_member_id,
      'payment.reversed',
      'registrations',
      v_row.id,
      ARRAY['coverage_status']::text[],
      v_event_id
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'amount_cents', v_amount,
    'method', v_pay.method::text
  );
END;
$function$;

COMMENT ON FUNCTION public.reverse_manual_payment(uuid, text) IS
  'Gegenzeile zu einem manuellen Kurs-Vermerk. pass_purchase → USE_REVOKE_PASS. owner/admin immer; setzende Person 15 Minuten.';

-- ---------------------------------------------------------------------------
-- 5. sell_pass
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sell_pass(
  p_member_id uuid,
  p_product_id uuid,
  p_method text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_tenant_id uuid;
  v_member public.users%ROWTYPE;
  v_product public.pass_products%ROWTYPE;
  v_method public.payment_method;
  v_pass_id uuid;
  v_payment_id uuid;
  v_from date;
  v_until date;
  v_received timestamptz;
  v_causation uuid;
  v_pay_event uuid;
  v_pass_event uuid;
BEGIN
  v_actor := yogaflow_private.get_my_member_id();
  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_actor IS NULL
     OR v_tenant_id IS NULL
     OR (
       NOT yogaflow_private.is_tenant_manager()
       AND NOT yogaflow_private.is_teacher()
     )
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT *
    INTO v_member
  FROM public.users
  WHERE id = p_member_id
  FOR UPDATE;

  IF NOT FOUND OR v_member.tenant_id IS DISTINCT FROM v_tenant_id THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_member.anonymized_at IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'MEMBER_REMOVED');
  END IF;

  SELECT *
    INTO v_product
  FROM public.pass_products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND OR v_product.tenant_id IS DISTINCT FROM v_tenant_id THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_product.archived_at IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'PRODUCT_ARCHIVED');
  END IF;

  IF p_method IS NULL OR p_method NOT IN ('cash', 'bank_transfer', 'paypal_manual') THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_METHOD');
  END IF;

  v_method := p_method::public.payment_method;
  v_from := (pg_catalog.now() AT TIME ZONE 'Europe/Berlin')::date;
  v_until := yogaflow_private.pass_valid_until(
    v_product.validity_rule,
    v_product.validity_value,
    v_from
  );
  v_pass_id := pg_catalog.gen_random_uuid();
  v_payment_id := pg_catalog.gen_random_uuid();
  v_received := pg_catalog.now();
  v_causation := pg_catalog.gen_random_uuid();

  INSERT INTO public.payments (
    id,
    tenant_id,
    subject_type,
    subject_id,
    registration_id,
    provider,
    method,
    status,
    amount_cents,
    currency,
    received_at,
    recorded_by
  ) VALUES (
    v_payment_id,
    v_tenant_id,
    'pass_purchase',
    v_pass_id,
    NULL,
    'manual'::public.payment_provider,
    v_method,
    'succeeded'::public.payment_status,
    v_product.price_cents,
    'EUR',
    v_received,
    v_actor
  );

  INSERT INTO public.passes (
    id,
    tenant_id,
    member_id,
    product_id,
    name,
    units_total,
    price_cents,
    validity_rule,
    validity_value,
    valid_from,
    valid_until,
    payment_id,
    status
  ) VALUES (
    v_pass_id,
    v_tenant_id,
    v_member.id,
    v_product.id,
    v_product.name,
    v_product.units,
    v_product.price_cents,
    v_product.validity_rule,
    v_product.validity_value,
    v_from,
    v_until,
    v_payment_id,
    'active'
  );

  v_pay_event := yogaflow_private.insert_event(
    v_tenant_id,
    'payment.recorded',
    'payment',
    v_payment_id,
    pg_catalog.jsonb_build_object(
      'payment_id', v_payment_id,
      'pass_id', v_pass_id,
      'amount_cents', v_product.price_cents,
      'currency', 'EUR',
      'method', v_method::text,
      'provider', 'manual',
      'received_at', v_received
    ),
    v_causation
  );

  v_pass_event := yogaflow_private.insert_event(
    v_tenant_id,
    'pass.purchased',
    'pass',
    v_pass_id,
    pg_catalog.jsonb_build_object(
      'pass_id', v_pass_id,
      'payment_id', v_payment_id,
      'member_id', v_member.id,
      'units', v_product.units,
      'price_cents', v_product.price_cents,
      'valid_until', v_until,
      'method', v_method::text
    ),
    v_causation
  );

  INSERT INTO public.pass_movements (
    tenant_id,
    pass_id,
    delta,
    kind,
    actor_member_id,
    event_id
  ) VALUES (
    v_tenant_id,
    v_pass_id,
    v_product.units,
    'purchase',
    v_actor,
    v_pass_event
  );

  PERFORM yogaflow_private.insert_audit(
    v_tenant_id,
    v_actor,
    'payment.recorded',
    'payments',
    v_payment_id,
    ARRAY[
      'amount_cents',
      'method',
      'status',
      'subject_type',
      'received_at',
      'recorded_by'
    ]::text[],
    v_pay_event
  );

  PERFORM yogaflow_private.insert_audit(
    v_tenant_id,
    v_actor,
    'pass.purchased',
    'passes',
    v_pass_id,
    ARRAY[
      'member_id',
      'product_id',
      'units_total',
      'price_cents',
      'valid_from',
      'valid_until',
      'payment_id',
      'status'
    ]::text[],
    v_pass_event
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'pass_id', v_pass_id,
    'payment_id', v_payment_id,
    'valid_until', v_until
  );
END;
$function$;

COMMENT ON FUNCTION public.sell_pass(uuid, uuid, text) IS
  'Verkauft eine Karte vor Ort. Owner/Admin/Lehrende. Betrag = Produktpreis. Events payment.recorded und pass.purchased mit gleicher causation_id.';

REVOKE ALL ON FUNCTION public.sell_pass(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sell_pass(uuid, uuid, text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. revoke_pass
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.revoke_pass(
  p_pass_id uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_tenant_id uuid;
  v_pass public.passes%ROWTYPE;
  v_pay public.payments%ROWTYPE;
  v_note text;
  v_remaining integer;
  v_rev_payment_id uuid;
  v_amount integer;
  v_received timestamptz;
  v_causation uuid;
  v_pass_event uuid;
  v_pay_event uuid;
BEGIN
  v_actor := yogaflow_private.get_my_member_id();
  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_actor IS NULL OR v_tenant_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT *
    INTO v_pass
  FROM public.passes
  WHERE id = p_pass_id
  FOR UPDATE;

  IF NOT FOUND OR v_pass.tenant_id IS DISTINCT FROM v_tenant_id THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_pass.status IS DISTINCT FROM 'active' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_ACTIVE');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pass_movements m
    WHERE m.pass_id = v_pass.id
      AND m.kind IS DISTINCT FROM 'purchase'
  ) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ALREADY_USED');
  END IF;

  SELECT *
    INTO v_pay
  FROM public.payments
  WHERE id = v_pass.payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF NOT yogaflow_private.is_tenant_manager() THEN
    IF NOT yogaflow_private.is_teacher()
       OR v_pay.recorded_by IS DISTINCT FROM v_actor
       OR v_pay.created_at <= pg_catalog.now() - interval '15 minutes'
    THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
    END IF;
  END IF;

  v_note := NULLIF(pg_catalog.btrim(p_note), '');
  IF v_note IS NOT NULL AND pg_catalog.length(v_note) > 200 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_NOTE');
  END IF;

  v_remaining := yogaflow_private.pass_remaining(v_pass.id);
  IF v_remaining = 0 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ALREADY_USED');
  END IF;

  v_causation := pg_catalog.gen_random_uuid();

  v_rev_payment_id := yogaflow_private.insert_manual_payment_reversal(
    v_pay,
    v_actor,
    NULL
  );

  IF v_rev_payment_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ALREADY_REVERSED');
  END IF;

  v_amount := -v_pay.amount_cents;
  SELECT received_at INTO v_received FROM public.payments WHERE id = v_rev_payment_id;

  PERFORM pg_catalog.set_config('yogaflow.allow_pass_change', 'on', true);

  UPDATE public.passes
  SET
    status = 'revoked',
    revoked_at = pg_catalog.now()
  WHERE id = v_pass.id;

  v_pass_event := yogaflow_private.insert_event(
    v_tenant_id,
    'pass.revoked',
    'pass',
    v_pass.id,
    pg_catalog.jsonb_build_object(
      'pass_id', v_pass.id,
      'payment_id', v_pay.id,
      'reversal_payment_id', v_rev_payment_id,
      'member_id', v_pass.member_id,
      'units_revoked', v_remaining
    ),
    v_causation
  );

  INSERT INTO public.pass_movements (
    tenant_id,
    pass_id,
    delta,
    kind,
    reason,
    actor_member_id,
    event_id
  ) VALUES (
    v_tenant_id,
    v_pass.id,
    -v_remaining,
    'revoke',
    v_note,
    v_actor,
    v_pass_event
  );

  v_pay_event := yogaflow_private.insert_event(
    v_tenant_id,
    'payment.reversed',
    'payment',
    v_rev_payment_id,
    pg_catalog.jsonb_build_object(
      'payment_id', v_rev_payment_id,
      'pass_id', v_pass.id,
      'amount_cents', v_amount,
      'currency', 'EUR',
      'method', v_pay.method::text,
      'provider', 'manual',
      'received_at', v_received,
      'reverses_payment_id', v_pay.id
    ),
    v_causation
  );

  PERFORM yogaflow_private.insert_audit(
    v_tenant_id,
    v_actor,
    'pass.revoked',
    'passes',
    v_pass.id,
    ARRAY['status', 'revoked_at']::text[],
    v_pass_event
  );

  PERFORM yogaflow_private.insert_audit(
    v_tenant_id,
    v_actor,
    'payment.reversed',
    'payments',
    v_rev_payment_id,
    ARRAY[
      'amount_cents',
      'method',
      'status',
      'reverses_payment_id',
      'received_at',
      'recorded_by'
    ]::text[],
    v_pay_event
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'pass_id', v_pass.id,
    'payment_id', v_rev_payment_id,
    'amount_cents', v_amount
  );
END;
$function$;

COMMENT ON FUNCTION public.revoke_pass(uuid, text) IS
  'Storniert eine unbenutzte Karte. Owner/Admin immer; Lehrende nur eigenen Vermerk innerhalb 15 Minuten. p_note nur in pass_movements.reason.';

REVOKE ALL ON FUNCTION public.revoke_pass(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_pass(uuid, text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. get_member_passes
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_member_passes(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_tenant_id uuid;
  v_target public.users%ROWTYPE;
  v_today date;
  v_rows jsonb;
BEGIN
  v_actor := yogaflow_private.get_my_member_id();
  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_actor IS NULL OR v_tenant_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT *
    INTO v_target
  FROM public.users
  WHERE id = p_member_id;

  IF NOT FOUND OR v_target.tenant_id IS DISTINCT FROM v_tenant_id THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF NOT (
    yogaflow_private.is_tenant_manager()
    OR yogaflow_private.is_teacher()
    OR v_actor = p_member_id
  ) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  v_today := (pg_catalog.now() AT TIME ZONE 'Europe/Berlin')::date;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'pass_id', p.id,
      'name', p.name,
      'remaining', yogaflow_private.pass_remaining(p.id),
      'units_total', p.units_total,
      'valid_until', p.valid_until
    )
    ORDER BY p.valid_until ASC, p.created_at ASC
  ), '[]'::jsonb)
    INTO v_rows
  FROM public.passes p
  WHERE p.member_id = p_member_id
    AND p.tenant_id = v_tenant_id
    AND p.status = 'active'
    AND p.valid_until >= v_today;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'passes', v_rows
  );
END;
$function$;

COMMENT ON FUNCTION public.get_member_passes(uuid) IS
  'Aktive Karten einer Person ohne Preis. Owner/Admin/Lehrende oder die Person selbst.';

REVOKE ALL ON FUNCTION public.get_member_passes(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_passes(uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. get_sellable_pass_products (Lehrende: Preis beim Verkauf, ohne A4-SELECT)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_sellable_pass_products()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_tenant_id uuid;
  v_rows jsonb;
BEGIN
  v_actor := yogaflow_private.get_my_member_id();
  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_actor IS NULL
     OR v_tenant_id IS NULL
     OR (
       NOT yogaflow_private.is_tenant_manager()
       AND NOT yogaflow_private.is_teacher()
     )
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'units', p.units,
      'price_cents', p.price_cents,
      'validity_rule', p.validity_rule,
      'validity_value', p.validity_value
    )
    ORDER BY p.units ASC, p.name ASC
  ), '[]'::jsonb)
    INTO v_rows
  FROM public.pass_products p
  WHERE p.tenant_id = v_tenant_id
    AND p.archived_at IS NULL;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'products', v_rows
  );
END;
$function$;

COMMENT ON FUNCTION public.get_sellable_pass_products() IS
  'Nicht archivierte Kartenprodukte zum Verkauf. Owner/Admin/Lehrende. Mit Preis (Kassieren); umgeht A4-SELECT-Sperre für Lehrende.';

REVOKE ALL ON FUNCTION public.get_sellable_pass_products()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_sellable_pass_products()
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. remove_member: Karte zählt als Geldbezug (Basis 4.3, Diff: passes)
-- ---------------------------------------------------------------------------

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
        'waitlist'::public.registration_status
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
      'waitlist'::public.registration_status
    )
    AND c.status = 'active'
    AND (c.date + COALESCE(c.time, TIME '00:00:00'))
          AT TIME ZONE 'Europe/Berlin' > pg_catalog.now();

  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  -- Diff A5: EXISTS passes mit member_id = Ziel zählt als Geldbezug.
  v_money := EXISTS (
    SELECT 1
    FROM public.registrations r
    WHERE r.user_id = v_target.id
      AND (
        r.coverage_status IN (
          'paid'::public.registration_coverage_status,
          'waived'::public.registration_coverage_status
        )
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
  );

  IF NOT v_money THEN
    v_mode := 'deleted';
    SELECT count(*)::integer
      INTO v_deleted_regs
    FROM public.registrations
    WHERE user_id = v_target.id;

    DELETE FROM public.users WHERE id = v_target.id;
    v_fields := ARRAY['id']::text[];
  ELSE
    v_mode := 'anonymized';

    DELETE FROM public.messages
    WHERE sender_id = v_target.id OR recipient_id = v_target.id;

    DELETE FROM public.user_notifications
    WHERE user_id = v_target.id;

    DELETE FROM public.registrations r
    WHERE r.user_id = v_target.id
      AND r.cancel_reason IS DISTINCT FROM 'member_removed'
      AND r.coverage_status NOT IN (
        'paid'::public.registration_coverage_status,
        'waived'::public.registration_coverage_status
      )
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
  'Entfernt ein Profil im Studio der aufrufenden Person. Ohne Geldbezug löschen, mit Geldbezug (inkl. Karte) anonymisieren und vom Login lösen. Login löscht delete-user nur bei remaining_profiles = 0.';

REVOKE ALL ON FUNCTION public.remove_member(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_member(uuid) TO authenticated;
-- ---------------------------------------------------------------------------
-- 10. delete_tenant_complete (Basis A4)
-- Diff: SET LOCAL yogaflow.allow_pass_delete = 'on';
--       DELETE pass_movements, dann passes, vor payments.
-- ---------------------------------------------------------------------------

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

    DELETE FROM public.audit_log WHERE tenant_id = p_tenant_id;
    DELETE FROM public.events WHERE tenant_id = p_tenant_id;
    DELETE FROM public.user_notifications WHERE tenant_id = p_tenant_id;
    DELETE FROM public.messages WHERE tenant_id = p_tenant_id;
    DELETE FROM public.pass_movements WHERE tenant_id = p_tenant_id;
    DELETE FROM public.passes WHERE tenant_id = p_tenant_id;
    DELETE FROM public.payments
      WHERE tenant_id = p_tenant_id
        AND reverses_payment_id IS NOT NULL;
    DELETE FROM public.payments WHERE tenant_id = p_tenant_id;
    DELETE FROM public.registrations WHERE tenant_id = p_tenant_id;
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
  'Löscht einen Mandanten: audit_log, events, user_notifications, messages, pass_movements (allow_append_only_delete), passes (allow_pass_delete), payments (Gegenzeilen zuerst, allow_payment_delete), registrations, courses, pass_products (allow_pass_product_delete), users, tenants. prevent_last_owner_delete pausiert. auth.users separat. Nur postgres/service_role.';

REVOKE ALL ON FUNCTION public.delete_tenant_complete(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tenant_complete(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.delete_tenant_complete(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 11. Selbstprüfung
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_sell_oid oid;
  v_revoke_oid oid;
  v_get_oid oid;
  v_sellable_oid oid;
  v_def text;
  v_fk_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'passes' AND c.relkind = 'r'
  ) THEN
    RAISE EXCEPTION 'A5: Tabelle passes fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'pass_movements' AND c.relkind = 'r'
  ) THEN
    RAISE EXCEPTION 'A5: Tabelle pass_movements fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.passes'::regclass
      AND conname = 'passes_payment_id_unique'
  ) THEN
    RAISE EXCEPTION 'A5: UNIQUE payment_id fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.passes'::regclass
      AND conname = 'passes_revoked_at_check'
  ) THEN
    RAISE EXCEPTION 'A5: CHECK passes_revoked_at_check fehlt';
  END IF;

  SELECT count(*)::integer
    INTO v_fk_count
  FROM pg_constraint
  WHERE conrelid = 'public.passes'::regclass
    AND contype = 'f'
    AND confrelid = 'public.users'::regclass;

  IF v_fk_count <> 1 THEN
    RAISE EXCEPTION 'A5: passes hat % FKs auf users, erwartet 1', v_fk_count;
  END IF;

  IF has_table_privilege('authenticated', 'public.passes', 'INSERT')
     OR has_table_privilege('authenticated', 'public.passes', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.passes', 'DELETE')
     OR has_table_privilege('anon', 'public.passes', 'SELECT')
     OR has_table_privilege('authenticated', 'public.pass_movements', 'INSERT')
     OR has_table_privilege('authenticated', 'public.pass_movements', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.pass_movements', 'DELETE')
     OR has_table_privilege('anon', 'public.pass_movements', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.passes', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.pass_movements', 'SELECT')
  THEN
    RAISE EXCEPTION 'A5: Schreibrechte für authenticated/anon nicht entzogen oder SELECT fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'passes' AND t.tgname = 'passes_guard' AND NOT t.tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'passes' AND t.tgname = 'passes_no_delete' AND NOT t.tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'pass_movements'
      AND t.tgname = 'pass_movements_append_only'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'A5: ein Trigger fehlt';
  END IF;

  SELECT p.oid INTO v_sell_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'sell_pass'
    AND pg_get_function_identity_arguments(p.oid) = 'p_member_id uuid, p_product_id uuid, p_method text'
    AND p.prosecdef;

  SELECT p.oid INTO v_revoke_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'revoke_pass'
    AND pg_get_function_identity_arguments(p.oid) = 'p_pass_id uuid, p_note text'
    AND p.prosecdef;

  SELECT p.oid INTO v_get_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_member_passes'
    AND pg_get_function_identity_arguments(p.oid) = 'p_member_id uuid'
    AND p.prosecdef;

  SELECT p.oid INTO v_sellable_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_sellable_pass_products'
    AND pg_get_function_identity_arguments(p.oid) = ''
    AND p.prosecdef;

  IF v_sell_oid IS NULL
     OR v_revoke_oid IS NULL
     OR v_get_oid IS NULL
     OR v_sellable_oid IS NULL
  THEN
    RAISE EXCEPTION 'A5: eine RPC fehlt oder ist nicht SECURITY DEFINER';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_options_to_table((SELECT proconfig FROM pg_proc WHERE oid = v_sell_oid))
    WHERE option_name = 'search_path' AND option_value = '""'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_options_to_table((SELECT proconfig FROM pg_proc WHERE oid = v_revoke_oid))
    WHERE option_name = 'search_path' AND option_value = '""'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_options_to_table((SELECT proconfig FROM pg_proc WHERE oid = v_get_oid))
    WHERE option_name = 'search_path' AND option_value = '""'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_options_to_table((SELECT proconfig FROM pg_proc WHERE oid = v_sellable_oid))
    WHERE option_name = 'search_path' AND option_value = '""'
  ) THEN
    RAISE EXCEPTION 'A5: search_path einer RPC ist nicht leer';
  END IF;

  IF has_function_privilege('anon', v_sell_oid, 'EXECUTE')
     OR has_function_privilege('anon', v_revoke_oid, 'EXECUTE')
     OR has_function_privilege('anon', v_get_oid, 'EXECUTE')
     OR has_function_privilege('anon', v_sellable_oid, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'A5: anon hat EXECUTE auf eine Pass-RPC';
  END IF;

  IF NOT has_function_privilege('authenticated', v_sellable_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'A5: authenticated braucht EXECUTE auf get_sellable_pass_products';
  END IF;

  SELECT pg_get_functiondef('public.reverse_manual_payment(uuid,text)'::regprocedure)
    INTO v_def;
  IF v_def NOT LIKE '%USE_REVOKE_PASS%' THEN
    RAISE EXCEPTION 'A5: reverse_manual_payment enthält USE_REVOKE_PASS nicht';
  END IF;

  SELECT pg_get_functiondef('public.remove_member(uuid)'::regprocedure)
    INTO v_def;
  IF v_def NOT LIKE '%passes%' THEN
    RAISE EXCEPTION 'A5: remove_member enthält passes nicht';
  END IF;

  SELECT pg_get_functiondef('public.delete_tenant_complete(uuid)'::regprocedure)
    INTO v_def;
  IF v_def NOT LIKE '%pass_movements%'
     OR v_def NOT LIKE '%allow_pass_delete%'
     OR v_def NOT LIKE '%DELETE FROM public.passes%'
  THEN
    RAISE EXCEPTION 'A5: delete_tenant_complete enthält passes/pass_movements nicht';
  END IF;
END;
$$;
