-- K1 — Schema: Online-Kartenkauf (Attempt/Produkt, Consents, Verlängerung, Void, Marker).
-- allow: payment_attempts_guard,pass_purchase_consents_no_mutate,pass_validity_changes_no_mutate,passes_guard,pass_withdrawal_lookups_no_mutate,normalize_legal_text,hash_legal_text,pass_wertersatz_cents,delete_tenant_complete
-- Freigabe: docs/stories/k1_freigabe_teil0.md

-- ---------------------------------------------------------------------------
-- 1. pass_products: online_purchasable + description
-- ---------------------------------------------------------------------------

ALTER TABLE public.pass_products
  ADD COLUMN IF NOT EXISTS online_purchasable boolean NOT NULL DEFAULT false;

ALTER TABLE public.pass_products
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.pass_products
  DROP CONSTRAINT IF EXISTS pass_products_description_length_check;

ALTER TABLE public.pass_products
  ADD CONSTRAINT pass_products_description_length_check
  CHECK (description IS NULL OR length(description) <= 140);

COMMENT ON COLUMN public.pass_products.online_purchasable IS
  'K1: Online kaufbar (nur wenn Studio online bereit und Preis ≤ 250 €).';
COMMENT ON COLUMN public.pass_products.description IS
  'K1: Kurze Produktbeschreibung, höchstens 140 Zeichen.';

-- ---------------------------------------------------------------------------
-- 2. payment_attempts: pass_product Subject + Snapshot + Expiry
-- ---------------------------------------------------------------------------

ALTER TABLE public.payment_attempts
  ADD COLUMN IF NOT EXISTS subject_id uuid;

ALTER TABLE public.payment_attempts
  ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES public.users (id) ON DELETE RESTRICT;

ALTER TABLE public.payment_attempts
  ADD COLUMN IF NOT EXISTS snapshot jsonb;

ALTER TABLE public.payment_attempts
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

ALTER TABLE public.payment_attempts
  DROP CONSTRAINT IF EXISTS payment_attempts_subject_type_check;

ALTER TABLE public.payment_attempts
  ADD CONSTRAINT payment_attempts_subject_type_check
  CHECK (subject_type IN ('registration', 'pass_product'));

ALTER TABLE public.payment_attempts
  DROP CONSTRAINT IF EXISTS payment_attempts_registration_subject_check;

ALTER TABLE public.payment_attempts
  ADD CONSTRAINT payment_attempts_subject_shape_check
  CHECK (
    (
      subject_type = 'registration'
      AND registration_id IS NOT NULL
      AND subject_id IS NULL
      AND member_id IS NULL
      AND snapshot IS NULL
      AND expires_at IS NULL
    )
    OR (
      subject_type = 'pass_product'
      AND registration_id IS NULL
      AND subject_id IS NOT NULL
      AND member_id IS NOT NULL
      AND snapshot IS NOT NULL
      AND expires_at IS NOT NULL
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_one_active_per_pass_product
  ON public.payment_attempts (tenant_id, member_id, subject_id)
  WHERE subject_type = 'pass_product'
    AND status IN ('initiated', 'processing');

CREATE INDEX IF NOT EXISTS payment_attempts_pass_expiry_idx
  ON public.payment_attempts (expires_at)
  WHERE subject_type = 'pass_product'
    AND status IN ('initiated', 'processing');

CREATE INDEX IF NOT EXISTS payment_attempts_subject_id_idx
  ON public.payment_attempts (subject_id)
  WHERE subject_id IS NOT NULL;

COMMENT ON COLUMN public.payment_attempts.subject_id IS
  'K1: Bei pass_product = pass_products.id; bei registration NULL.';
COMMENT ON COLUMN public.payment_attempts.snapshot IS
  'K1: Produkt-Schnappschuss (name/units/price/validity) für die Erfüllung.';
COMMENT ON COLUMN public.payment_attempts.expires_at IS
  'K1: Attempt-Ablauf (30 Min). Danach Cancel-PI; späte Zahlung legt Karte trotzdem an.';

-- Guard: neue Spalten unveränderlich
CREATE OR REPLACE FUNCTION yogaflow_private.payment_attempts_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_allowed boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.subject_type IS DISTINCT FROM OLD.subject_type
       OR NEW.registration_id IS DISTINCT FROM OLD.registration_id
       OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
       OR NEW.member_id IS DISTINCT FROM OLD.member_id
       OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.method IS DISTINCT FROM OLD.method
       OR NEW.provider IS DISTINCT FROM OLD.provider
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.livemode IS DISTINCT FROM OLD.livemode
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'payment_attempts: diese Spalten sind unveränderlich'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.provider_ref IS NOT NULL
       AND NEW.provider_ref IS DISTINCT FROM OLD.provider_ref
    THEN
      RAISE EXCEPTION 'payment_attempts: provider_ref ist unveränderlich'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.provider_ref IS NOT DISTINCT FROM OLD.provider_ref
       AND NEW.failure_code IS NOT DISTINCT FROM OLD.failure_code
       AND NEW.payment_id IS NOT DISTINCT FROM OLD.payment_id
       AND NEW.status_changed_at IS NOT DISTINCT FROM OLD.status_changed_at
    THEN
      RETURN NEW;
    END IF;

    IF OLD.status IN ('failed', 'canceled')
       AND NEW.status IS DISTINCT FROM OLD.status
    THEN
      RAISE EXCEPTION 'payment_attempts: Endzustand'
        USING ERRCODE = '22023';
    END IF;

    IF OLD.status = 'initiated' AND NEW.status IN ('processing', 'failed', 'canceled') THEN
      v_allowed := true;
    ELSIF OLD.status = 'processing' AND NEW.status IN ('failed', 'canceled') THEN
      v_allowed := true;
    ELSIF OLD.status IN ('initiated', 'processing')
          AND NEW.status = 'succeeded'
          AND NEW.payment_id IS NOT NULL
    THEN
      v_allowed := true;
    ELSIF OLD.status IS NOT DISTINCT FROM NEW.status THEN
      v_allowed := true;
    END IF;

    IF NOT v_allowed THEN
      RAISE EXCEPTION 'payment_attempts: Übergang % → % nicht erlaubt', OLD.status, NEW.status
        USING ERRCODE = '22023';
    END IF;

    IF NEW.status = 'succeeded'
       AND (
         NEW.payment_id IS NULL
         OR pg_catalog.current_setting('yogaflow.allow_payment_attempt_change', true) IS DISTINCT FROM 'on'
         OR current_user::text IN ('anon', 'authenticated')
       )
    THEN
      RAISE EXCEPTION 'payment_attempts: succeeded nur über Abschluss mit payment_id'
        USING ERRCODE = '22023';
    END IF;

    IF pg_catalog.current_setting('yogaflow.allow_payment_attempt_change', true) = 'on'
       AND current_user::text NOT IN ('anon', 'authenticated')
    THEN
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        NEW.status_changed_at := pg_catalog.now();
      END IF;
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'payment_attempts: Status nur über RPC'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.payment_attempts_guard()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. pass_movements: kind void
-- ---------------------------------------------------------------------------

ALTER TABLE public.pass_movements
  DROP CONSTRAINT IF EXISTS pass_movements_kind_check;

ALTER TABLE public.pass_movements
  ADD CONSTRAINT pass_movements_kind_check
  CHECK (kind IN (
    'purchase',
    'redeem',
    'redeem_reversal',
    'expire',
    'revoke',
    'manual_adjustment',
    'void'
  ));

ALTER TABLE public.pass_movements
  DROP CONSTRAINT IF EXISTS pass_movements_void_reason_check;

ALTER TABLE public.pass_movements
  ADD CONSTRAINT pass_movements_void_reason_check
  CHECK (
    kind <> 'void'
    OR (reason IS NOT NULL AND length(btrim(reason)) > 0)
  );

-- ---------------------------------------------------------------------------
-- 4. payment_refunds: reason withdrawal
-- ---------------------------------------------------------------------------

ALTER TABLE public.payment_refunds
  DROP CONSTRAINT IF EXISTS payment_refunds_reason_check;

ALTER TABLE public.payment_refunds
  ADD CONSTRAINT payment_refunds_reason_check
  CHECK (reason = ANY (ARRAY[
    'course_cancelled',
    'self_cancel_in_window',
    'staff_unregister',
    'member_removed',
    'late_payment',
    'manual',
    'provider_dashboard',
    'withdrawal'
  ]::text[]));

-- ---------------------------------------------------------------------------
-- 5. pass_purchase_consents (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pass_purchase_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  attempt_id uuid NOT NULL REFERENCES public.payment_attempts (id) ON DELETE RESTRICT,
  payment_id uuid REFERENCES public.payments (id) ON DELETE RESTRICT,
  member_id uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  consented_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  immediate_use_text_hash text NOT NULL,
  withdrawal_info_text_hash text NOT NULL,
  CONSTRAINT pass_purchase_consents_immediate_hash_check
    CHECK (immediate_use_text_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT pass_purchase_consents_withdrawal_hash_check
    CHECK (withdrawal_info_text_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT pass_purchase_consents_attempt_unique UNIQUE (attempt_id)
);

CREATE INDEX IF NOT EXISTS pass_purchase_consents_tenant_idx
  ON public.pass_purchase_consents (tenant_id);

CREATE INDEX IF NOT EXISTS pass_purchase_consents_member_idx
  ON public.pass_purchase_consents (member_id);

COMMENT ON TABLE public.pass_purchase_consents IS
  'K1: Nachweis Sofortnutzung + Widerrufsbelehrung (SHA-256 normalisierter Texte). Append-only.';

ALTER TABLE public.pass_purchase_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pass_purchase_consents_select ON public.pass_purchase_consents;
CREATE POLICY pass_purchase_consents_select
  ON public.pass_purchase_consents
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT yogaflow_private.get_my_tenant_id())
    AND (
      (SELECT yogaflow_private.is_tenant_manager())
      OR member_id = (SELECT yogaflow_private.get_my_member_id())
    )
  );

REVOKE ALL ON TABLE public.pass_purchase_consents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.pass_purchase_consents TO authenticated;

CREATE OR REPLACE FUNCTION yogaflow_private.pass_purchase_consents_no_mutate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_catalog.current_setting('yogaflow.allow_append_only_delete', true) = 'on'
       AND current_user::text NOT IN ('anon', 'authenticated')
    THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'pass_purchase_consents: DELETE nicht erlaubt'
      USING ERRCODE = '42501';
  END IF;

  -- Einmaliges Setzen von payment_id bei Erfüllung erlauben; sonst unveränderlich.
  IF TG_OP = 'UPDATE'
     AND OLD.payment_id IS NULL
     AND NEW.payment_id IS NOT NULL
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
     AND NEW.attempt_id IS NOT DISTINCT FROM OLD.attempt_id
     AND NEW.member_id IS NOT DISTINCT FROM OLD.member_id
     AND NEW.consented_at IS NOT DISTINCT FROM OLD.consented_at
     AND NEW.immediate_use_text_hash IS NOT DISTINCT FROM OLD.immediate_use_text_hash
     AND NEW.withdrawal_info_text_hash IS NOT DISTINCT FROM OLD.withdrawal_info_text_hash
     AND current_user::text NOT IN ('anon', 'authenticated')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'pass_purchase_consents: UPDATE nicht erlaubt'
    USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS pass_purchase_consents_no_mutate ON public.pass_purchase_consents;
CREATE TRIGGER pass_purchase_consents_no_mutate
  BEFORE UPDATE OR DELETE ON public.pass_purchase_consents
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.pass_purchase_consents_no_mutate();

REVOKE ALL ON FUNCTION yogaflow_private.pass_purchase_consents_no_mutate()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. pass_validity_changes (append-only, Verlängerung)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pass_validity_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  pass_id uuid NOT NULL REFERENCES public.passes (id) ON DELETE RESTRICT,
  old_valid_until date NOT NULL,
  new_valid_until date NOT NULL,
  note text NOT NULL,
  actor_member_id uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT pass_validity_changes_note_check
    CHECK (length(btrim(note)) BETWEEN 1 AND 200),
  CONSTRAINT pass_validity_changes_dates_check
    CHECK (new_valid_until IS DISTINCT FROM old_valid_until)
);

CREATE INDEX IF NOT EXISTS pass_validity_changes_pass_idx
  ON public.pass_validity_changes (pass_id, created_at);

CREATE INDEX IF NOT EXISTS pass_validity_changes_tenant_idx
  ON public.pass_validity_changes (tenant_id);

COMMENT ON TABLE public.pass_validity_changes IS
  'K1: Verlängerungen (alt/neu/Notiz/wer/wann). Nicht über pass_movements.';

ALTER TABLE public.pass_validity_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pass_validity_changes_select ON public.pass_validity_changes;
CREATE POLICY pass_validity_changes_select
  ON public.pass_validity_changes
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT yogaflow_private.get_my_tenant_id())
    AND (
      (SELECT yogaflow_private.is_tenant_manager())
      OR EXISTS (
        SELECT 1 FROM public.passes p
        WHERE p.id = pass_id
          AND p.member_id = (SELECT yogaflow_private.get_my_member_id())
      )
    )
  );

REVOKE ALL ON TABLE public.pass_validity_changes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.pass_validity_changes TO authenticated;

CREATE OR REPLACE FUNCTION yogaflow_private.pass_validity_changes_no_mutate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_catalog.current_setting('yogaflow.allow_append_only_delete', true) = 'on'
       AND current_user::text NOT IN ('anon', 'authenticated')
    THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'pass_validity_changes: DELETE nicht erlaubt'
      USING ERRCODE = '42501';
  END IF;
  RAISE EXCEPTION 'pass_validity_changes: UPDATE nicht erlaubt'
    USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS pass_validity_changes_no_mutate ON public.pass_validity_changes;
CREATE TRIGGER pass_validity_changes_no_mutate
  BEFORE UPDATE OR DELETE ON public.pass_validity_changes
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.pass_validity_changes_no_mutate();

REVOKE ALL ON FUNCTION yogaflow_private.pass_validity_changes_no_mutate()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. passes: Mail-Marker + Guard für Verlängerung
-- ---------------------------------------------------------------------------

ALTER TABLE public.passes
  ADD COLUMN IF NOT EXISTS reminder_30_sent_at timestamptz;

ALTER TABLE public.passes
  ADD COLUMN IF NOT EXISTS reminder_7_sent_at timestamptz;

ALTER TABLE public.passes
  ADD COLUMN IF NOT EXISTS units_low_sent_at timestamptz;

COMMENT ON COLUMN public.passes.reminder_30_sent_at IS
  'K1: Ablauf-Mail 30 Tage einmalig.';
COMMENT ON COLUMN public.passes.reminder_7_sent_at IS
  'K1: Ablauf-Mail 7 Tage einmalig.';
COMMENT ON COLUMN public.passes.units_low_sent_at IS
  'K1: Mail „Noch 1 Termin“ einmalig.';

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
       OR NEW.payment_id IS DISTINCT FROM OLD.payment_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'passes: diese Spalten sind unveränderlich'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.valid_until IS DISTINCT FROM OLD.valid_until THEN
      IF pg_catalog.current_setting('yogaflow.allow_pass_extend', true) = 'on'
         AND current_user::text NOT IN ('anon', 'authenticated')
      THEN
        NULL;
      ELSE
        RAISE EXCEPTION 'passes: valid_until nur über extend_pass'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    -- Marker-Spalten und Status/revoked_at dürfen mit allow_pass_change bzw. frei (Marker) wechseln.
    IF NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.revoked_at IS NOT DISTINCT FROM OLD.revoked_at
       AND NEW.valid_until IS NOT DISTINCT FROM OLD.valid_until
       AND NEW.reminder_30_sent_at IS NOT DISTINCT FROM OLD.reminder_30_sent_at
       AND NEW.reminder_7_sent_at IS NOT DISTINCT FROM OLD.reminder_7_sent_at
       AND NEW.units_low_sent_at IS NOT DISTINCT FROM OLD.units_low_sent_at
    THEN
      RETURN NEW;
    END IF;

    -- Mail-Marker: service_role/postgres ohne extra GUC
    IF NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.revoked_at IS NOT DISTINCT FROM OLD.revoked_at
       AND NEW.valid_until IS NOT DISTINCT FROM OLD.valid_until
       AND current_user::text NOT IN ('anon', 'authenticated')
    THEN
      RETURN NEW;
    END IF;

    IF pg_catalog.current_setting('yogaflow.allow_pass_change', true) = 'on'
       AND current_user::text NOT IN ('anon', 'authenticated')
    THEN
      RETURN NEW;
    END IF;

    IF pg_catalog.current_setting('yogaflow.allow_pass_extend', true) = 'on'
       AND current_user::text NOT IN ('anon', 'authenticated')
       AND NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.revoked_at IS NOT DISTINCT FROM OLD.revoked_at
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'passes: Status nur über revoke_pass'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.passes_guard()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. email_deliveries: registration_id nullable + pass_id + kinds
-- ---------------------------------------------------------------------------

ALTER TABLE public.email_deliveries
  ALTER COLUMN registration_id DROP NOT NULL;

ALTER TABLE public.email_deliveries
  ADD COLUMN IF NOT EXISTS pass_id uuid REFERENCES public.passes (id) ON DELETE RESTRICT;

ALTER TABLE public.email_deliveries
  DROP CONSTRAINT IF EXISTS email_deliveries_kind_check;

ALTER TABLE public.email_deliveries
  ADD CONSTRAINT email_deliveries_kind_check
  CHECK (kind IN (
    'waitlist_promoted_payment_required',
    'payment_succeeded',
    'payment_refunded',
    'pass_purchased',
    'pass_expiring_30',
    'pass_expiring_7',
    'pass_units_low',
    'pass_withdrawal_received',
    'pass_withdrawal_refunded'
  ));

ALTER TABLE public.email_deliveries
  DROP CONSTRAINT IF EXISTS email_deliveries_subject_shape_check;

ALTER TABLE public.email_deliveries
  ADD CONSTRAINT email_deliveries_subject_shape_check
  CHECK (
    (
      kind IN (
        'waitlist_promoted_payment_required',
        'payment_succeeded',
        'payment_refunded'
      )
      AND registration_id IS NOT NULL
      AND pass_id IS NULL
    )
    OR (
      kind IN (
        'pass_purchased',
        'pass_expiring_30',
        'pass_expiring_7',
        'pass_units_low',
        'pass_withdrawal_received',
        'pass_withdrawal_refunded'
      )
      AND pass_id IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS email_deliveries_pass_idx
  ON public.email_deliveries (pass_id)
  WHERE pass_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 9. Rate-Limit-Log für öffentliche Widerruf-Lookup
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pass_withdrawal_lookups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  receipt_number text NOT NULL,
  email_norm text NOT NULL,
  ip_hash text,
  matched boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS pass_withdrawal_lookups_ip_idx
  ON public.pass_withdrawal_lookups (tenant_id, ip_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS pass_withdrawal_lookups_receipt_idx
  ON public.pass_withdrawal_lookups (tenant_id, receipt_number, created_at DESC);

COMMENT ON TABLE public.pass_withdrawal_lookups IS
  'K1: Lookup-Log für /widerruf (Rate-Limit je IP und Belegnummer). Kein Client-SELECT.';

ALTER TABLE public.pass_withdrawal_lookups ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pass_withdrawal_lookups FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION yogaflow_private.pass_withdrawal_lookups_no_mutate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_catalog.current_setting('yogaflow.allow_append_only_delete', true) = 'on'
       AND current_user::text NOT IN ('anon', 'authenticated')
    THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'pass_withdrawal_lookups: DELETE nicht erlaubt'
      USING ERRCODE = '42501';
  END IF;
  RAISE EXCEPTION 'pass_withdrawal_lookups: UPDATE nicht erlaubt'
    USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS pass_withdrawal_lookups_no_mutate ON public.pass_withdrawal_lookups;
CREATE TRIGGER pass_withdrawal_lookups_no_mutate
  BEFORE UPDATE OR DELETE ON public.pass_withdrawal_lookups
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.pass_withdrawal_lookups_no_mutate();

REVOKE ALL ON FUNCTION yogaflow_private.pass_withdrawal_lookups_no_mutate()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. Text-Normalisierung (wie AVV: CRLF→LF, trailing spaces, trailing NL)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.normalize_legal_text(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT CASE
    WHEN p_text IS NULL THEN NULL
    ELSE regexp_replace(
           regexp_replace(
             replace(p_text, E'\r\n', E'\n'),
             '[ \t]+$',
             '',
             'gn'
           ),
           E'\\n*$',
           E'\n'
         )
  END;
$function$;

COMMENT ON FUNCTION yogaflow_private.normalize_legal_text(text) IS
  'K1/AVV: Normalisierung vor SHA-256 (CRLF→LF, Zeilen-Trailing-Spaces weg, eine End-NL).';

REVOKE ALL ON FUNCTION yogaflow_private.normalize_legal_text(text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION yogaflow_private.hash_legal_text(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT encode(
    extensions.digest(yogaflow_private.normalize_legal_text(p_text), 'sha256'),
    'hex'
  );
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.hash_legal_text(text)
  FROM PUBLIC, anon, authenticated;

-- Wertersatz: round(price * used / units) kaufmännisch auf Cent
CREATE OR REPLACE FUNCTION yogaflow_private.pass_wertersatz_cents(
  p_price_cents integer,
  p_units integer,
  p_used integer
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT CASE
    WHEN p_price_cents IS NULL OR p_units IS NULL OR p_units <= 0 OR p_used IS NULL OR p_used <= 0
      THEN 0
    WHEN p_used >= p_units THEN p_price_cents
    ELSE ROUND((p_price_cents::numeric * p_used::numeric) / p_units::numeric)::integer
  END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.pass_wertersatz_cents(integer, integer, integer)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 11. delete_tenant_complete: neue Tabellen
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
    SET LOCAL yogaflow.allow_email_delivery_delete = 'on';
    SET CONSTRAINTS public.registrations_pass_id_fkey DEFERRED;
    SET CONSTRAINTS public.coverage_waive_batches_tenant_id_fkey DEFERRED;
    SET CONSTRAINTS public.registrations_coverage_waived_batch_id_fkey DEFERRED;

    DELETE FROM public.ledger_event_log WHERE tenant_id = p_tenant_id;
    DELETE FROM public.ledger_entries WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenant_tax_settings WHERE tenant_id = p_tenant_id;
    DELETE FROM public.legal_acceptances WHERE tenant_id = p_tenant_id;
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
    DELETE FROM public.pass_withdrawal_lookups WHERE tenant_id = p_tenant_id;
    DELETE FROM public.pass_purchase_consents WHERE tenant_id = p_tenant_id;
    DELETE FROM public.pass_validity_changes WHERE tenant_id = p_tenant_id;
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

REVOKE ALL ON FUNCTION public.delete_tenant_complete(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tenant_complete(uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 12. Selbstprüfung
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_def text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pass_products'
      AND column_name = 'online_purchasable'
  ) THEN
    RAISE EXCEPTION 'K1 schema: online_purchasable fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payment_attempts'
      AND column_name = 'snapshot'
  ) THEN
    RAISE EXCEPTION 'K1 schema: payment_attempts.snapshot fehlt';
  END IF;

  IF to_regclass('public.pass_purchase_consents') IS NULL
     OR to_regclass('public.pass_validity_changes') IS NULL
  THEN
    RAISE EXCEPTION 'K1 schema: Consent/Validity-Tabellen fehlen';
  END IF;

  v_def := pg_catalog.pg_get_functiondef(
    'public.delete_tenant_complete(uuid)'::regprocedure
  );
  IF position('pass_purchase_consents' IN v_def) = 0
     OR position('pass_validity_changes' IN v_def) = 0
  THEN
    RAISE EXCEPTION 'K1 schema: delete_tenant_complete ohne neue Tabellen';
  END IF;

  IF yogaflow_private.pass_wertersatz_cents(12000, 10, 2) IS DISTINCT FROM 2400
     OR yogaflow_private.pass_wertersatz_cents(10000, 3, 1) IS DISTINCT FROM 3333
     OR yogaflow_private.pass_wertersatz_cents(6500, 5, 5) IS DISTINCT FROM 6500
  THEN
    RAISE EXCEPTION 'K1 schema: Wertersatz-Beispiele falsch';
  END IF;

  IF has_table_privilege('authenticated', 'public.pass_purchase_consents', 'INSERT')
     OR has_table_privilege('anon', 'public.pass_purchase_consents', 'SELECT')
  THEN
    RAISE EXCEPTION 'K1 schema: Consents zu weit freigegeben';
  END IF;
END;
$$;
