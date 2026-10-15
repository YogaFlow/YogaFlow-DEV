-- S1 1.2a — Provider-Tabellen, Plattform-Schalter, Zahlungseinstellungen je Studio.
--
-- Zweck: Schema für Online-Zahlung (Stripe Connect) ohne Stripe-API. Nichts in
-- diesem Schritt ruft Stripe auf, nichts liest die neuen Einstellungen beim
-- Buchen, Kassieren oder Kartenverkauf. Bei ausgeschaltetem Schalter verhält
-- sich die App wie vorher (Entscheidung 08, P1).
--
-- Bezug: Epic 1.2, Entscheidung 08 (28.09.2026):
-- P1 Ein gemeinsames PROD-Update; alles bleibt bei Schalter aus wie heute.
-- P2 Variante D: payment_attempts kommt in 2.1b-a. payments bleibt unverändert.
-- P3 Nur Karte, nur Einzeltermin. Kein sepa_debit im Enum.
-- P4 Owner schaltet je Studio ein, nur wenn die Plattform freigegeben hat
--    (service_role) und das Stripe-Konto bereit ist.
-- P5 provider_customers erst in 2.2a.
--
-- Entscheidungen in diesem Schritt (Rückfrage 28.09.2026):
-- - audit_log/events brauchen tenant_id NOT NULL. Der Plattform-Schalter hat kein
--   Studio. Protokoll deshalb in public.platform_flag_changes (append-only), nicht
--   über insert_audit.
-- - provider_capabilities bekommt tenant_id NOT NULL (Hausregel „jede
--   tenant-eigene Tabelle hat tenant_id“) mit zusammengesetztem FK auf
--   provider_accounts (id, tenant_id).
--
-- Weitere Festlegungen (im Bericht begründet):
-- - Löschschalter: yogaflow.allow_payment_delete (bestehend) gilt auch für
--   provider_accounts und provider_events_raw.
-- - service_role: auf allen neuen Tabellen nur SELECT, auf provider_events_raw
--   zusätzlich INSERT/UPDATE (Webhook 1.4). Kein DELETE/TRUNCATE (TRUNCATE
--   umginge die Lösch-Trigger). Konten, Capabilities und Einstellungen schreiben
--   nur die RPCs.
-- - provider_accounts: tenant_id, provider, provider_ref, livemode unveränderlich.
-- - Automatisch aus, sobald das Konto nicht mehr bereit ist (Status nicht active,
--   charges_enabled false oder card nicht active), Grund PROVIDER_NOT_READY.
-- - Steuerstatus „vorhanden“ = Zeile mit valid_from <= heute (Europe/Berlin).
--
-- Die Startzeile ('online_payments', false) ist Konfiguration, keine Nutzerdaten.
--
-- Rückweg (Kommentar, läuft hier nicht). Zuerst delete_tenant_complete auf die
-- Fassung aus 20260928160000_a8_1_bulk_waive_open_list.sql (Abschnitt 11)
-- zurücksetzen, dann:
--
-- DROP FUNCTION IF EXISTS public.get_payment_setup_status();
-- DROP FUNCTION IF EXISTS public.set_allow_onsite_payment(boolean);
-- DROP FUNCTION IF EXISTS public.set_online_payments_enabled(boolean);
-- DROP FUNCTION IF EXISTS public.upsert_provider_account(uuid, public.payment_provider, text, text, boolean, boolean, boolean, boolean, jsonb);
-- DROP FUNCTION IF EXISTS yogaflow_private.upsert_provider_account(uuid, public.payment_provider, text, text, boolean, boolean, boolean, boolean, jsonb);
-- DROP FUNCTION IF EXISTS public.set_platform_flag(text, boolean);
-- DROP FUNCTION IF EXISTS yogaflow_private.tax_setting_present(uuid);
-- DROP FUNCTION IF EXISTS yogaflow_private.provider_ready(uuid);
-- DROP FUNCTION IF EXISTS yogaflow_private.tenant_payment_settings_for(uuid);
-- DROP FUNCTION IF EXISTS yogaflow_private.platform_flag(text);
-- DROP TABLE IF EXISTS public.tenant_payment_settings;
-- DROP TABLE IF EXISTS public.provider_events_raw;
-- DROP TABLE IF EXISTS public.provider_capabilities;
-- DROP TABLE IF EXISTS public.provider_accounts;
-- DROP TABLE IF EXISTS public.platform_flag_changes;
-- DROP TABLE IF EXISTS public.platform_flags;
-- DROP FUNCTION IF EXISTS yogaflow_private.provider_events_raw_immutable();
-- DROP FUNCTION IF EXISTS yogaflow_private.provider_accounts_immutable();
-- DROP FUNCTION IF EXISTS yogaflow_private.provider_rows_no_delete();
--
-- Sobald provider_accounts oder provider_events_raw Zeilen haben, blockiert der
-- Lösch-Trigger DROP TABLE nicht, wohl aber DELETE. DROP TABLE ist der Rückweg.

-- ---------------------------------------------------------------------------
-- 1. Plattform-Schalter
-- ---------------------------------------------------------------------------

CREATE TABLE public.platform_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_flags_key_check
    CHECK (key ~ '^[a-z_]{3,64}$')
);

COMMENT ON TABLE public.platform_flags IS
  'Plattformweite Schalter. Kein Studio-Bezug. Lesen/Schreiben nur service_role, Schreiben über set_platform_flag. 1.2a.';

INSERT INTO public.platform_flags (key, enabled)
VALUES ('online_payments', false)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE public.platform_flag_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  enabled boolean NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_flag_changes_key_fkey
    FOREIGN KEY (key) REFERENCES public.platform_flags (key) ON DELETE RESTRICT
);

CREATE INDEX platform_flag_changes_key_changed_at_idx
  ON public.platform_flag_changes (key, changed_at DESC);

COMMENT ON TABLE public.platform_flag_changes IS
  'Verlauf der Plattform-Schalter (append-only). Ersetzt audit_log, das tenant_id NOT NULL verlangt. Schreiben nur set_platform_flag.';

CREATE TRIGGER platform_flag_changes_append_only
  BEFORE UPDATE OR DELETE ON public.platform_flag_changes
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.enforce_append_only();

ALTER TABLE public.platform_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_flag_changes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_flags FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.platform_flag_changes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.platform_flags TO service_role;
GRANT SELECT ON TABLE public.platform_flag_changes TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Trigger-Funktionen (SECURITY INVOKER: current_user muss die aufrufende
--    Rolle sein, sonst greift die Rollenprüfung des Löschschalters nicht)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.provider_rows_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF pg_catalog.current_setting('yogaflow.allow_payment_delete', true) = 'on'
     AND current_user::text NOT IN ('anon', 'authenticated')
  THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION '%: DELETE ist nicht erlaubt', TG_TABLE_NAME
    USING ERRCODE = '42501';
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.provider_rows_no_delete() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. provider_accounts
-- ---------------------------------------------------------------------------

CREATE TABLE public.provider_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  provider public.payment_provider NOT NULL,
  provider_ref text NOT NULL,
  onboarding_status text NOT NULL DEFAULT 'not_started',
  charges_enabled boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  details_submitted boolean NOT NULL DEFAULT false,
  livemode boolean NOT NULL,
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_accounts_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT provider_accounts_provider_not_manual
    CHECK (provider <> 'manual'::public.payment_provider),
  CONSTRAINT provider_accounts_provider_ref_check
    CHECK (pg_catalog.length(pg_catalog.btrim(provider_ref)) BETWEEN 1 AND 255),
  CONSTRAINT provider_accounts_onboarding_status_check
    CHECK (onboarding_status IN (
      'not_started', 'in_progress', 'in_review', 'active', 'action_required'
    )),
  CONSTRAINT provider_accounts_provider_ref_key
    UNIQUE (provider, provider_ref),
  CONSTRAINT provider_accounts_tenant_provider_key
    UNIQUE (tenant_id, provider),
  CONSTRAINT provider_accounts_id_tenant_key
    UNIQUE (id, tenant_id)
);

COMMENT ON TABLE public.provider_accounts IS
  'Verbundenes Konto je Studio und Anbieter (Stripe Connect). Schreiben nur upsert_provider_account (service_role). Kein DELETE außer delete_tenant_complete. Das Konto selbst bleibt beim Anbieter. 1.2a.';

COMMENT ON COLUMN public.provider_accounts.status_changed_at IS
  'Letzte Änderung von onboarding_status oder einem der Flags.';

CREATE OR REPLACE FUNCTION yogaflow_private.provider_accounts_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.provider_ref IS DISTINCT FROM OLD.provider_ref
     OR NEW.livemode IS DISTINCT FROM OLD.livemode
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'provider_accounts: diese Spalten sind unveränderlich'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.provider_accounts_immutable() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER provider_accounts_immutable
  BEFORE UPDATE ON public.provider_accounts
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.provider_accounts_immutable();

CREATE TRIGGER provider_accounts_no_delete
  BEFORE DELETE ON public.provider_accounts
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.provider_rows_no_delete();

ALTER TABLE public.provider_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_accounts_select_managers
  ON public.provider_accounts
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT yogaflow_private.get_my_tenant_id())
    AND (SELECT yogaflow_private.is_tenant_manager())
  );

REVOKE ALL ON TABLE public.provider_accounts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.provider_accounts TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. provider_capabilities
-- ---------------------------------------------------------------------------

CREATE TABLE public.provider_capabilities (
  provider_account_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  method public.payment_method NOT NULL,
  status text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_capabilities_pkey
    PRIMARY KEY (provider_account_id, method),
  CONSTRAINT provider_capabilities_account_fkey
    FOREIGN KEY (provider_account_id, tenant_id)
    REFERENCES public.provider_accounts (id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT provider_capabilities_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT provider_capabilities_status_check
    CHECK (status IN ('active', 'inactive', 'pending')),
  CONSTRAINT provider_capabilities_method_check
    CHECK (method = 'card'::public.payment_method)
);

CREATE INDEX provider_capabilities_tenant_id_idx
  ON public.provider_capabilities (tenant_id);

COMMENT ON TABLE public.provider_capabilities IS
  'Zahlungsarten je verbundenem Konto. In 1a nur card (P3). Schreiben nur upsert_provider_account (service_role). 1.2a.';

ALTER TABLE public.provider_capabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_capabilities_select_managers
  ON public.provider_capabilities
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT yogaflow_private.get_my_tenant_id())
    AND (SELECT yogaflow_private.is_tenant_manager())
  );

REVOKE ALL ON TABLE public.provider_capabilities FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.provider_capabilities TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. provider_events_raw
-- ---------------------------------------------------------------------------

CREATE TABLE public.provider_events_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider public.payment_provider NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  account_ref text,
  tenant_id uuid,
  livemode boolean NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text,
  attempts integer NOT NULL DEFAULT 0,
  CONSTRAINT provider_events_raw_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT provider_events_raw_provider_not_manual
    CHECK (provider <> 'manual'::public.payment_provider),
  CONSTRAINT provider_events_raw_event_id_check
    CHECK (pg_catalog.length(event_id) BETWEEN 1 AND 255),
  CONSTRAINT provider_events_raw_event_type_check
    CHECK (pg_catalog.length(event_type) BETWEEN 1 AND 255),
  CONSTRAINT provider_events_raw_processing_error_check
    CHECK (processing_error IS NULL OR processing_error ~ '^[A-Z_]{3,64}$'),
  CONSTRAINT provider_events_raw_attempts_check
    CHECK (attempts >= 0),
  CONSTRAINT provider_events_raw_provider_event_key
    UNIQUE (provider, event_id)
);

CREATE INDEX provider_events_raw_unprocessed_idx
  ON public.provider_events_raw (processed_at)
  WHERE processed_at IS NULL;

CREATE INDEX provider_events_raw_tenant_id_idx
  ON public.provider_events_raw (tenant_id)
  WHERE tenant_id IS NOT NULL;

COMMENT ON TABLE public.provider_events_raw IS
  'Rohe Anbieter-Events (Webhook 1.4). Payload enthält Personendaten: keine Policy für authenticated, nur service_role. Änderbar nur processed_at, processing_error, attempts. tenant_id NULL = nicht auflösbar (I7). Aufbewahrungsfrist offen (OFFENE_PUNKTE). 1.2a.';

COMMENT ON COLUMN public.provider_events_raw.processing_error IS
  'Nur Fehlercode (^[A-Z_]{3,64}$), kein Freitext.';

CREATE OR REPLACE FUNCTION yogaflow_private.provider_events_raw_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.event_id IS DISTINCT FROM OLD.event_id
     OR NEW.event_type IS DISTINCT FROM OLD.event_type
     OR NEW.account_ref IS DISTINCT FROM OLD.account_ref
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.livemode IS DISTINCT FROM OLD.livemode
     OR NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.received_at IS DISTINCT FROM OLD.received_at
  THEN
    RAISE EXCEPTION 'provider_events_raw: diese Spalten sind unveränderlich'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.provider_events_raw_immutable() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER provider_events_raw_immutable
  BEFORE UPDATE ON public.provider_events_raw
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.provider_events_raw_immutable();

CREATE TRIGGER provider_events_raw_no_delete
  BEFORE DELETE ON public.provider_events_raw
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.provider_rows_no_delete();

ALTER TABLE public.provider_events_raw ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.provider_events_raw FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.provider_events_raw TO service_role;

-- ---------------------------------------------------------------------------
-- 6. tenant_payment_settings
-- ---------------------------------------------------------------------------

CREATE TABLE public.tenant_payment_settings (
  tenant_id uuid PRIMARY KEY,
  online_payments_enabled boolean NOT NULL DEFAULT false,
  allow_onsite_payment boolean NOT NULL DEFAULT true,
  changed_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_payment_settings_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT tenant_payment_settings_changed_by_fkey
    FOREIGN KEY (changed_by) REFERENCES public.users (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.tenant_payment_settings IS
  'Zahlungseinstellungen je Studio. Keine Zeile = online aus, vor Ort erlaubt (tenant_payment_settings_for). Schreiben nur über RPCs. 1.2a.';

COMMENT ON COLUMN public.tenant_payment_settings.changed_by IS
  'Profil der letzten Änderung. NULL bei automatischem Ausschalten (upsert_provider_account).';

ALTER TABLE public.tenant_payment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_payment_settings_select_managers
  ON public.tenant_payment_settings
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT yogaflow_private.get_my_tenant_id())
    AND (SELECT yogaflow_private.is_tenant_manager())
  );

REVOKE ALL ON TABLE public.tenant_payment_settings FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.tenant_payment_settings TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Helfer (yogaflow_private, kein Client-EXECUTE)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.platform_flag(p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    (SELECT f.enabled FROM public.platform_flags f WHERE f.key = p_key),
    false
  );
$function$;

COMMENT ON FUNCTION yogaflow_private.platform_flag(text) IS
  'Wert eines Plattform-Schalters. Unbekannter Key → false.';

CREATE OR REPLACE FUNCTION yogaflow_private.tenant_payment_settings_for(p_tenant uuid)
RETURNS TABLE (online_payments_enabled boolean, allow_onsite_payment boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    COALESCE(s.online_payments_enabled, false),
    COALESCE(s.allow_onsite_payment, true)
  FROM (SELECT p_tenant AS tenant_id) d
  LEFT JOIN public.tenant_payment_settings s ON s.tenant_id = d.tenant_id;
$function$;

COMMENT ON FUNCTION yogaflow_private.tenant_payment_settings_for(uuid) IS
  'Zahlungseinstellungen eines Studios samt Standard (online aus, vor Ort erlaubt). Immer genau eine Zeile.';

CREATE OR REPLACE FUNCTION yogaflow_private.provider_ready(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.provider_accounts a
    JOIN public.provider_capabilities c
      ON c.provider_account_id = a.id
     AND c.tenant_id = a.tenant_id
    WHERE a.tenant_id = p_tenant
      AND a.provider = 'stripe'::public.payment_provider
      AND a.onboarding_status = 'active'
      AND a.charges_enabled
      AND c.method = 'card'::public.payment_method
      AND c.status = 'active'
  );
$function$;

COMMENT ON FUNCTION yogaflow_private.provider_ready(uuid) IS
  'Stripe-Konto active, charges_enabled und card active.';

CREATE OR REPLACE FUNCTION yogaflow_private.tax_setting_present(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_tax_settings t
    WHERE t.tenant_id = p_tenant
      AND t.valid_from <= (pg_catalog.now() AT TIME ZONE 'Europe/Berlin')::date
  );
$function$;

COMMENT ON FUNCTION yogaflow_private.tax_setting_present(uuid) IS
  'Steuerstatus mit valid_from <= heute (Europe/Berlin) vorhanden.';

REVOKE ALL ON FUNCTION yogaflow_private.platform_flag(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION yogaflow_private.tenant_payment_settings_for(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION yogaflow_private.provider_ready(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION yogaflow_private.tax_setting_present(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. set_platform_flag (nur service_role)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_platform_flag(p_key text, p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_old boolean;
BEGIN
  -- Zweite Sperre neben dem fehlenden GRANT: Client-JWT wird immer abgewiesen.
  IF COALESCE(
       NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) IN ('anon', 'authenticated')
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF p_key IS NULL OR p_enabled IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
  END IF;

  SELECT f.enabled
    INTO v_old
  FROM public.platform_flags f
  WHERE f.key = p_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'UNKNOWN_FLAG');
  END IF;

  IF v_old = p_enabled THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true, 'changed', false, 'key', p_key, 'enabled', v_old
    );
  END IF;

  UPDATE public.platform_flags
  SET enabled = p_enabled,
      updated_at = pg_catalog.now()
  WHERE key = p_key;

  INSERT INTO public.platform_flag_changes (key, enabled)
  VALUES (p_key, p_enabled);

  RETURN pg_catalog.jsonb_build_object(
    'success', true, 'changed', true, 'key', p_key, 'enabled', p_enabled
  );
END;
$function$;

COMMENT ON FUNCTION public.set_platform_flag(text, boolean) IS
  'Setzt einen bestehenden Plattform-Schalter. Nur service_role. Verlauf in platform_flag_changes. Fehler: FORBIDDEN, INVALID_INPUT, UNKNOWN_FLAG.';

REVOKE ALL ON FUNCTION public.set_platform_flag(text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_platform_flag(text, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 9. upsert_provider_account (nur service_role, Onboarding 1.3 / Webhook 1.4)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.upsert_provider_account(
  p_tenant uuid,
  p_provider public.payment_provider,
  p_ref text,
  p_status text,
  p_charges boolean,
  p_payouts boolean,
  p_details boolean,
  p_livemode boolean,
  p_capabilities jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_ref text;
  v_old public.provider_accounts%ROWTYPE;
  v_found boolean;
  v_other_tenant uuid;
  v_account_id uuid;
  v_created boolean := false;
  v_fields text[] := ARRAY[]::text[];
  v_key text;
  v_val text;
  v_rows integer;
  v_cap_changed boolean := false;
  v_card text;
  v_event_id uuid;
  v_online boolean;
  v_auto_off boolean := false;
  v_off_event_id uuid;
BEGIN
  IF p_tenant IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant)
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'TENANT_NOT_FOUND');
  END IF;

  IF p_provider IS NULL OR p_provider = 'manual'::public.payment_provider THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_PROVIDER');
  END IF;

  v_ref := NULLIF(pg_catalog.btrim(COALESCE(p_ref, '')), '');
  IF v_ref IS NULL OR pg_catalog.length(v_ref) > 255 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_REF');
  END IF;

  IF p_status IS NULL
     OR p_status NOT IN ('not_started', 'in_progress', 'in_review', 'active', 'action_required')
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_STATUS');
  END IF;

  IF p_charges IS NULL OR p_payouts IS NULL OR p_details IS NULL OR p_livemode IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
  END IF;

  -- Format: {"card": "active" | "inactive" | "pending"}. P3: nur card.
  IF p_capabilities IS NOT NULL THEN
    IF pg_catalog.jsonb_typeof(p_capabilities) <> 'object' THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_CAPABILITIES');
    END IF;
    FOR v_key, v_val IN
      SELECT e.key, e.value FROM pg_catalog.jsonb_each_text(p_capabilities) e
    LOOP
      IF v_key <> 'card'
         OR v_val IS NULL
         OR v_val NOT IN ('active', 'inactive', 'pending')
      THEN
        RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_CAPABILITIES');
      END IF;
    END LOOP;
  END IF;

  -- Reihenfolge immer Studio, dann Referenz: kein Deadlock zwischen zwei Aufrufen.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('tenant_payment_settings:' || p_tenant::text, 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('provider_ref:' || p_provider::text || ':' || v_ref, 0)
  );

  SELECT a.tenant_id
    INTO v_other_tenant
  FROM public.provider_accounts a
  WHERE a.provider = p_provider
    AND a.provider_ref = v_ref;

  IF FOUND AND v_other_tenant IS DISTINCT FROM p_tenant THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ACCOUNT_TENANT_MISMATCH');
  END IF;

  SELECT *
    INTO v_old
  FROM public.provider_accounts a
  WHERE a.tenant_id = p_tenant
    AND a.provider = p_provider
  FOR UPDATE;
  v_found := FOUND;

  IF v_found AND v_old.provider_ref IS DISTINCT FROM v_ref THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ACCOUNT_REF_MISMATCH');
  END IF;

  IF v_found AND v_old.livemode IS DISTINCT FROM p_livemode THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'LIVEMODE_MISMATCH');
  END IF;

  IF NOT v_found THEN
    INSERT INTO public.provider_accounts (
      tenant_id,
      provider,
      provider_ref,
      onboarding_status,
      charges_enabled,
      payouts_enabled,
      details_submitted,
      livemode
    ) VALUES (
      p_tenant,
      p_provider,
      v_ref,
      p_status,
      p_charges,
      p_payouts,
      p_details,
      p_livemode
    )
    RETURNING id INTO v_account_id;

    v_created := true;
    v_fields := ARRAY[
      'tenant_id',
      'provider',
      'provider_ref',
      'onboarding_status',
      'charges_enabled',
      'payouts_enabled',
      'details_submitted',
      'livemode'
    ]::text[];
  ELSE
    v_account_id := v_old.id;

    IF v_old.onboarding_status IS DISTINCT FROM p_status THEN
      v_fields := pg_catalog.array_append(v_fields, 'onboarding_status');
    END IF;
    IF v_old.charges_enabled IS DISTINCT FROM p_charges THEN
      v_fields := pg_catalog.array_append(v_fields, 'charges_enabled');
    END IF;
    IF v_old.payouts_enabled IS DISTINCT FROM p_payouts THEN
      v_fields := pg_catalog.array_append(v_fields, 'payouts_enabled');
    END IF;
    IF v_old.details_submitted IS DISTINCT FROM p_details THEN
      v_fields := pg_catalog.array_append(v_fields, 'details_submitted');
    END IF;

    IF pg_catalog.cardinality(v_fields) > 0 THEN
      UPDATE public.provider_accounts
      SET onboarding_status = p_status,
          charges_enabled = p_charges,
          payouts_enabled = p_payouts,
          details_submitted = p_details,
          status_changed_at = pg_catalog.now()
      WHERE id = v_account_id;
    END IF;
  END IF;

  IF p_capabilities IS NOT NULL THEN
    FOR v_key, v_val IN
      SELECT e.key, e.value FROM pg_catalog.jsonb_each_text(p_capabilities) e
    LOOP
      INSERT INTO public.provider_capabilities AS pc (
        provider_account_id,
        tenant_id,
        method,
        status,
        updated_at
      ) VALUES (
        v_account_id,
        p_tenant,
        v_key::public.payment_method,
        v_val,
        pg_catalog.now()
      )
      ON CONFLICT (provider_account_id, method) DO UPDATE
        SET status = EXCLUDED.status,
            updated_at = EXCLUDED.updated_at
        WHERE pc.status IS DISTINCT FROM EXCLUDED.status;

      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows > 0 THEN
        v_cap_changed := true;
      END IF;
    END LOOP;

    IF v_cap_changed THEN
      v_fields := pg_catalog.array_append(v_fields, 'capabilities');
    END IF;
  END IF;

  SELECT c.status
    INTO v_card
  FROM public.provider_capabilities c
  WHERE c.provider_account_id = v_account_id
    AND c.method = 'card'::public.payment_method;

  -- Unveränderte Wiederholung (z. B. doppelter Webhook) erzeugt kein Event.
  IF pg_catalog.cardinality(v_fields) > 0 THEN
    v_event_id := yogaflow_private.insert_event(
      p_tenant,
      'provider_account.updated',
      'provider_account',
      v_account_id,
      pg_catalog.jsonb_build_object(
        'provider', p_provider::text,
        'onboarding_status', p_status,
        'charges_enabled', p_charges,
        'payouts_enabled', p_payouts,
        'details_submitted', p_details,
        'livemode', p_livemode,
        'card', v_card,
        'created', v_created
      ),
      pg_catalog.gen_random_uuid()
    );

    PERFORM yogaflow_private.insert_audit(
      p_tenant,
      NULL,
      'provider_account.updated',
      'provider_accounts',
      v_account_id,
      v_fields,
      v_event_id
    );
  END IF;

  SELECT s.online_payments_enabled
    INTO v_online
  FROM yogaflow_private.tenant_payment_settings_for(p_tenant) s;

  IF v_online AND NOT yogaflow_private.provider_ready(p_tenant) THEN
    UPDATE public.tenant_payment_settings
    SET online_payments_enabled = false,
        changed_by = NULL,
        updated_at = pg_catalog.now()
    WHERE tenant_id = p_tenant;

    v_off_event_id := yogaflow_private.insert_event(
      p_tenant,
      'payments.online_disabled',
      'tenant',
      p_tenant,
      pg_catalog.jsonb_build_object('reason', 'PROVIDER_NOT_READY'),
      COALESCE(v_event_id, pg_catalog.gen_random_uuid())
    );

    PERFORM yogaflow_private.insert_audit(
      p_tenant,
      NULL,
      'payments.online_disabled',
      'tenant_payment_settings',
      p_tenant,
      ARRAY['online_payments_enabled', 'changed_by', 'updated_at']::text[],
      v_off_event_id
    );

    v_auto_off := true;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'account_id', v_account_id,
    'created', v_created,
    'changed', pg_catalog.cardinality(v_fields) > 0,
    'online_payments_disabled', v_auto_off
  );
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.upsert_provider_account(uuid, public.payment_provider, text, text, boolean, boolean, boolean, boolean, jsonb) IS
  'Legt das verbundene Konto an oder aktualisiert Status, Flags und Capabilities. Hängt nie um. Schaltet online aus, wenn das Konto nicht mehr bereit ist. Fehler: TENANT_NOT_FOUND, INVALID_PROVIDER, INVALID_REF, INVALID_STATUS, INVALID_INPUT, INVALID_CAPABILITIES, ACCOUNT_TENANT_MISMATCH, ACCOUNT_REF_MISMATCH, LIVEMODE_MISMATCH.';

REVOKE ALL ON FUNCTION yogaflow_private.upsert_provider_account(uuid, public.payment_provider, text, text, boolean, boolean, boolean, boolean, jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.upsert_provider_account(
  p_tenant uuid,
  p_provider public.payment_provider,
  p_ref text,
  p_status text,
  p_charges boolean,
  p_payouts boolean,
  p_details boolean,
  p_livemode boolean,
  p_capabilities jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Zweite Sperre neben dem fehlenden GRANT: Client-JWT wird immer abgewiesen.
  IF COALESCE(
       NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) IN ('anon', 'authenticated')
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  RETURN yogaflow_private.upsert_provider_account(
    p_tenant,
    p_provider,
    p_ref,
    p_status,
    p_charges,
    p_payouts,
    p_details,
    p_livemode,
    p_capabilities
  );
END;
$function$;

COMMENT ON FUNCTION public.upsert_provider_account(uuid, public.payment_provider, text, text, boolean, boolean, boolean, boolean, jsonb) IS
  'Alias für yogaflow_private.upsert_provider_account. Nur service_role.';

REVOKE ALL ON FUNCTION public.upsert_provider_account(uuid, public.payment_provider, text, text, boolean, boolean, boolean, boolean, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_provider_account(uuid, public.payment_provider, text, text, boolean, boolean, boolean, boolean, jsonb)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 10. RPCs für Studios
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_online_payments_enabled(p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid;
  v_tenant_id uuid;
  v_online boolean;
  v_type text;
  v_payload jsonb;
  v_event_id uuid;
BEGIN
  v_member_id := yogaflow_private.get_my_member_id();
  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_member_id IS NULL OR v_tenant_id IS NULL OR NOT yogaflow_private.is_owner() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF p_enabled IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('tenant_payment_settings:' || v_tenant_id::text, 0)
  );

  SELECT s.online_payments_enabled
    INTO v_online
  FROM yogaflow_private.tenant_payment_settings_for(v_tenant_id) s;

  -- Einschalten prüft auch, wenn schon an: der Zustand kann inzwischen ungültig sein.
  IF p_enabled THEN
    IF NOT yogaflow_private.platform_flag('online_payments') THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'PLATFORM_DISABLED');
    END IF;
    IF NOT yogaflow_private.provider_ready(v_tenant_id) THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'PROVIDER_NOT_READY');
    END IF;
    IF NOT yogaflow_private.tax_setting_present(v_tenant_id) THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'TAX_SETTING_MISSING');
    END IF;
  END IF;

  IF v_online = p_enabled THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true, 'changed', false, 'online_payments_enabled', v_online
    );
  END IF;

  INSERT INTO public.tenant_payment_settings (
    tenant_id, online_payments_enabled, changed_by, updated_at
  ) VALUES (
    v_tenant_id, p_enabled, v_member_id, pg_catalog.now()
  )
  ON CONFLICT (tenant_id) DO UPDATE
    SET online_payments_enabled = EXCLUDED.online_payments_enabled,
        changed_by = EXCLUDED.changed_by,
        updated_at = EXCLUDED.updated_at;

  IF p_enabled THEN
    v_type := 'payments.online_enabled';
    v_payload := '{}'::jsonb;
  ELSE
    v_type := 'payments.online_disabled';
    v_payload := pg_catalog.jsonb_build_object('reason', 'OWNER');
  END IF;

  v_event_id := yogaflow_private.insert_event(
    v_tenant_id,
    v_type,
    'tenant',
    v_tenant_id,
    v_payload,
    pg_catalog.gen_random_uuid()
  );

  PERFORM yogaflow_private.insert_audit(
    v_tenant_id,
    v_member_id,
    v_type,
    'tenant_payment_settings',
    v_tenant_id,
    ARRAY['online_payments_enabled', 'changed_by', 'updated_at']::text[],
    v_event_id
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true, 'changed', true, 'online_payments_enabled', p_enabled
  );
END;
$function$;

COMMENT ON FUNCTION public.set_online_payments_enabled(boolean) IS
  'Online-Zahlung je Studio an/aus. Nur Owner. Ausschalten immer erlaubt. Einschalten: PLATFORM_DISABLED → PROVIDER_NOT_READY → TAX_SETTING_MISSING. Ohne Zustandswechsel kein Event.';

REVOKE ALL ON FUNCTION public.set_online_payments_enabled(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_online_payments_enabled(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_allow_onsite_payment(p_allow boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid;
  v_tenant_id uuid;
  v_onsite boolean;
  v_event_id uuid;
BEGIN
  v_member_id := yogaflow_private.get_my_member_id();
  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_member_id IS NULL OR v_tenant_id IS NULL OR NOT yogaflow_private.is_owner() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF p_allow IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('tenant_payment_settings:' || v_tenant_id::text, 0)
  );

  SELECT s.allow_onsite_payment
    INTO v_onsite
  FROM yogaflow_private.tenant_payment_settings_for(v_tenant_id) s;

  IF v_onsite = p_allow THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true, 'changed', false, 'allow_onsite_payment', v_onsite
    );
  END IF;

  INSERT INTO public.tenant_payment_settings (
    tenant_id, allow_onsite_payment, changed_by, updated_at
  ) VALUES (
    v_tenant_id, p_allow, v_member_id, pg_catalog.now()
  )
  ON CONFLICT (tenant_id) DO UPDATE
    SET allow_onsite_payment = EXCLUDED.allow_onsite_payment,
        changed_by = EXCLUDED.changed_by,
        updated_at = EXCLUDED.updated_at;

  v_event_id := yogaflow_private.insert_event(
    v_tenant_id,
    'payments.onsite_setting_changed',
    'tenant',
    v_tenant_id,
    pg_catalog.jsonb_build_object('allow_onsite_payment', p_allow),
    pg_catalog.gen_random_uuid()
  );

  PERFORM yogaflow_private.insert_audit(
    v_tenant_id,
    v_member_id,
    'payments.onsite_setting_changed',
    'tenant_payment_settings',
    v_tenant_id,
    ARRAY['allow_onsite_payment', 'changed_by', 'updated_at']::text[],
    v_event_id
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true, 'changed', true, 'allow_onsite_payment', p_allow
  );
END;
$function$;

COMMENT ON FUNCTION public.set_allow_onsite_payment(boolean) IS
  'Zahlung vor Ort erlauben je Studio. Nur Owner. Wirkt erst mit 2.2 (Checkout). Ohne Zustandswechsel kein Event.';

REVOKE ALL ON FUNCTION public.set_allow_onsite_payment(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_allow_onsite_payment(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_payment_setup_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid;
  v_tenant_id uuid;
  v_acc public.provider_accounts%ROWTYPE;
  v_has boolean;
  v_card text;
  v_online boolean;
  v_onsite boolean;
BEGIN
  v_member_id := yogaflow_private.get_my_member_id();
  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_member_id IS NULL OR v_tenant_id IS NULL OR NOT yogaflow_private.is_tenant_manager() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT *
    INTO v_acc
  FROM public.provider_accounts a
  WHERE a.tenant_id = v_tenant_id
    AND a.provider = 'stripe'::public.payment_provider;
  v_has := FOUND;

  IF v_has THEN
    SELECT c.status
      INTO v_card
    FROM public.provider_capabilities c
    WHERE c.provider_account_id = v_acc.id
      AND c.method = 'card'::public.payment_method;
  END IF;

  SELECT s.online_payments_enabled, s.allow_onsite_payment
    INTO v_online, v_onsite
  FROM yogaflow_private.tenant_payment_settings_for(v_tenant_id) s;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'platform_enabled', yogaflow_private.platform_flag('online_payments'),
    'has_account', v_has,
    'onboarding_status', CASE WHEN v_has THEN v_acc.onboarding_status ELSE 'not_started' END,
    'charges_enabled', COALESCE(v_acc.charges_enabled, false),
    'card_active', COALESCE(v_card = 'active', false),
    'tax_setting_present', yogaflow_private.tax_setting_present(v_tenant_id),
    'online_payments_enabled', v_online,
    'allow_onsite_payment', v_onsite
  );
END;
$function$;

COMMENT ON FUNCTION public.get_payment_setup_status() IS
  'Stand der Online-Zahlung für Owner/Admin: Plattform frei, Konto, Onboarding, charges, Karte, Steuerstatus, Einstellungen. Grundlage für 1.3.';

REVOKE ALL ON FUNCTION public.get_payment_setup_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_setup_status() TO authenticated;

-- ---------------------------------------------------------------------------
-- 11. delete_tenant_complete (A8-1 + Provider-Tabellen und Zahlungseinstellungen)
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
    SET CONSTRAINTS public.registrations_pass_id_fkey DEFERRED;
    SET CONSTRAINTS public.coverage_waive_batches_tenant_id_fkey DEFERRED;
    SET CONSTRAINTS public.registrations_coverage_waived_batch_id_fkey DEFERRED;

    DELETE FROM public.ledger_event_log WHERE tenant_id = p_tenant_id;
    DELETE FROM public.ledger_entries WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenant_tax_settings WHERE tenant_id = p_tenant_id;

    DELETE FROM public.provider_events_raw WHERE tenant_id = p_tenant_id;
    DELETE FROM public.provider_capabilities WHERE tenant_id = p_tenant_id;
    DELETE FROM public.provider_accounts WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenant_payment_settings WHERE tenant_id = p_tenant_id;

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
  'Löscht einen Mandanten: Hauptbuch, Steuerstatus, provider_events_raw/provider_capabilities/provider_accounts/tenant_payment_settings (1.2a, Schalter allow_payment_delete), audit_log, events, …, payments, registrations, coverage_waive_batches, courses, pass_products, users, tenants. Das Stripe-Konto bleibt beim Anbieter. Nur postgres/service_role.';

REVOKE ALL ON FUNCTION public.delete_tenant_complete(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tenant_complete(uuid)
  TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- 12. Selbstprüfung (statisch)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_tbl text;
  v_fn text;
  v_def text;
  v_oid oid;
  v_priv text;
  v_pos_raw integer;
  v_pos_cap integer;
  v_pos_acc integer;
  v_pos_tps integer;
  v_pos_events integer;
  v_pos_tenants integer;
BEGIN
  -- Tabellen und RLS
  FOREACH v_tbl IN ARRAY ARRAY[
    'platform_flags',
    'platform_flag_changes',
    'provider_accounts',
    'provider_capabilities',
    'provider_events_raw',
    'tenant_payment_settings'
  ]
  LOOP
    IF to_regclass('public.' || v_tbl) IS NULL THEN
      RAISE EXCEPTION '1.2a: Tabelle % fehlt', v_tbl;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_tbl AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION '1.2a: RLS auf % fehlt', v_tbl;
    END IF;

    FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']
    LOOP
      IF has_table_privilege('anon', 'public.' || v_tbl, v_priv) THEN
        RAISE EXCEPTION '1.2a: anon hat % auf %', v_priv, v_tbl;
      END IF;
    END LOOP;

    FOREACH v_priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']
    LOOP
      IF has_table_privilege('authenticated', 'public.' || v_tbl, v_priv) THEN
        RAISE EXCEPTION '1.2a: authenticated hat % auf %', v_priv, v_tbl;
      END IF;
    END LOOP;

    FOREACH v_priv IN ARRAY ARRAY['DELETE', 'TRUNCATE']
    LOOP
      IF has_table_privilege('service_role', 'public.' || v_tbl, v_priv) THEN
        RAISE EXCEPTION '1.2a: service_role hat % auf %', v_priv, v_tbl;
      END IF;
    END LOOP;
  END LOOP;

  -- Kein Lesen für authenticated, keine Policy
  FOREACH v_tbl IN ARRAY ARRAY['platform_flags', 'platform_flag_changes', 'provider_events_raw']
  LOOP
    IF has_table_privilege('authenticated', 'public.' || v_tbl, 'SELECT') THEN
      RAISE EXCEPTION '1.2a: authenticated hat SELECT auf %', v_tbl;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_policy WHERE polrelid = ('public.' || v_tbl)::regclass
    ) THEN
      RAISE EXCEPTION '1.2a: % darf keine Policy haben', v_tbl;
    END IF;
  END LOOP;

  -- Lese-Policy nur Owner/Admin, nur SELECT
  FOREACH v_tbl IN ARRAY ARRAY['provider_accounts', 'provider_capabilities', 'tenant_payment_settings']
  LOOP
    IF (
      SELECT count(*) FROM pg_policy WHERE polrelid = ('public.' || v_tbl)::regclass
    ) <> 1 OR NOT EXISTS (
      SELECT 1 FROM pg_policy
      WHERE polrelid = ('public.' || v_tbl)::regclass
        AND polcmd = 'r'
        AND pg_get_expr(polqual, polrelid) ILIKE '%get_my_tenant_id%'
        AND pg_get_expr(polqual, polrelid) ILIKE '%is_tenant_manager%'
    ) THEN
      RAISE EXCEPTION '1.2a: Policy auf % fehlt oder ist nicht SELECT Owner/Admin', v_tbl;
    END IF;
  END LOOP;

  -- CHECKs, UNIQUEs, FKs
  IF (
    SELECT count(*) FROM pg_constraint
    WHERE conname IN (
      'platform_flags_key_check',
      'provider_accounts_provider_not_manual',
      'provider_accounts_provider_ref_check',
      'provider_accounts_onboarding_status_check',
      'provider_accounts_provider_ref_key',
      'provider_accounts_tenant_provider_key',
      'provider_accounts_id_tenant_key',
      'provider_capabilities_pkey',
      'provider_capabilities_status_check',
      'provider_capabilities_method_check',
      'provider_events_raw_provider_not_manual',
      'provider_events_raw_processing_error_check',
      'provider_events_raw_attempts_check',
      'provider_events_raw_provider_event_key'
    )
  ) <> 14 THEN
    RAISE EXCEPTION '1.2a: CHECK/UNIQUE unvollständig';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'provider_accounts_tenant_id_fkey'
      AND pg_get_constraintdef(oid) ILIKE '%ON DELETE RESTRICT%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'provider_capabilities_account_fkey'
      AND pg_get_constraintdef(oid) ILIKE '%ON DELETE RESTRICT%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'provider_capabilities_tenant_id_fkey'
      AND pg_get_constraintdef(oid) ILIKE '%ON DELETE RESTRICT%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'provider_events_raw_tenant_id_fkey'
      AND pg_get_constraintdef(oid) ILIKE '%ON DELETE RESTRICT%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenant_payment_settings_tenant_id_fkey'
      AND pg_get_constraintdef(oid) ILIKE '%ON DELETE RESTRICT%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenant_payment_settings_changed_by_fkey'
      AND pg_get_constraintdef(oid) ILIKE '%ON DELETE SET NULL%'
  ) THEN
    RAISE EXCEPTION '1.2a: ein FK hat das falsche ON DELETE';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'provider_events_raw_unprocessed_idx'
      AND indexdef ILIKE '%processed_at IS NULL%'
  ) THEN
    RAISE EXCEPTION '1.2a: Index unverarbeitete Rohdaten fehlt';
  END IF;

  -- Trigger
  IF (
    SELECT count(*)
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal
      AND n.nspname = 'public'
      AND (
        (c.relname = 'provider_accounts'
          AND t.tgname IN ('provider_accounts_immutable', 'provider_accounts_no_delete'))
        OR (c.relname = 'provider_events_raw'
          AND t.tgname IN ('provider_events_raw_immutable', 'provider_events_raw_no_delete'))
        OR (c.relname = 'platform_flag_changes'
          AND t.tgname = 'platform_flag_changes_append_only')
      )
  ) <> 5 THEN
    RAISE EXCEPTION '1.2a: Schutz-Trigger unvollständig';
  END IF;

  FOREACH v_fn IN ARRAY ARRAY[
    'yogaflow_private.provider_rows_no_delete()',
    'yogaflow_private.provider_accounts_immutable()',
    'yogaflow_private.provider_events_raw_immutable()'
  ]
  LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
    THEN
      RAISE EXCEPTION '1.2a: Client hat EXECUTE auf Trigger-Funktion %', v_fn;
    END IF;
  END LOOP;

  -- Funktionen: SECURITY DEFINER, search_path leer, kein anon
  FOREACH v_fn IN ARRAY ARRAY[
    'yogaflow_private.platform_flag(text)',
    'yogaflow_private.tenant_payment_settings_for(uuid)',
    'yogaflow_private.provider_ready(uuid)',
    'yogaflow_private.tax_setting_present(uuid)',
    'yogaflow_private.upsert_provider_account(uuid,public.payment_provider,text,text,boolean,boolean,boolean,boolean,jsonb)',
    'public.upsert_provider_account(uuid,public.payment_provider,text,text,boolean,boolean,boolean,boolean,jsonb)',
    'public.set_platform_flag(text,boolean)',
    'public.set_online_payments_enabled(boolean)',
    'public.set_allow_onsite_payment(boolean)',
    'public.get_payment_setup_status()'
  ]
  LOOP
    v_oid := v_fn::regprocedure;

    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) THEN
      RAISE EXCEPTION '1.2a: % ist nicht SECURITY DEFINER', v_fn;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_options_to_table((SELECT proconfig FROM pg_proc WHERE oid = v_oid))
      WHERE option_name = 'search_path' AND option_value = '""'
    ) THEN
      RAISE EXCEPTION '1.2a: search_path von % ist nicht leer', v_fn;
    END IF;

    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION '1.2a: anon hat EXECUTE auf %', v_fn;
    END IF;
  END LOOP;

  -- Nur service_role
  FOREACH v_fn IN ARRAY ARRAY[
    'yogaflow_private.platform_flag(text)',
    'yogaflow_private.tenant_payment_settings_for(uuid)',
    'yogaflow_private.provider_ready(uuid)',
    'yogaflow_private.tax_setting_present(uuid)',
    'yogaflow_private.upsert_provider_account(uuid,public.payment_provider,text,text,boolean,boolean,boolean,boolean,jsonb)',
    'public.upsert_provider_account(uuid,public.payment_provider,text,text,boolean,boolean,boolean,boolean,jsonb)',
    'public.set_platform_flag(text,boolean)'
  ]
  LOOP
    IF has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '1.2a: authenticated hat EXECUTE auf %', v_fn;
    END IF;
  END LOOP;

  IF NOT has_function_privilege('service_role', 'public.set_platform_flag(text,boolean)', 'EXECUTE')
     OR NOT has_function_privilege(
       'service_role',
       'public.upsert_provider_account(uuid,public.payment_provider,text,text,boolean,boolean,boolean,boolean,jsonb)',
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION '1.2a: service_role braucht EXECUTE auf set_platform_flag und upsert_provider_account';
  END IF;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.set_online_payments_enabled(boolean)',
    'public.set_allow_onsite_payment(boolean)',
    'public.get_payment_setup_status()'
  ]
  LOOP
    IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '1.2a: authenticated braucht EXECUTE auf %', v_fn;
    END IF;
  END LOOP;

  -- Startzeile
  IF (SELECT enabled FROM public.platform_flags WHERE key = 'online_payments') IS DISTINCT FROM false THEN
    RAISE EXCEPTION '1.2a: online_payments muss existieren und false sein';
  END IF;

  -- delete_tenant_complete
  SELECT pg_get_functiondef('public.delete_tenant_complete(uuid)'::regprocedure)
    INTO v_def;

  v_pos_raw := position('DELETE FROM public.provider_events_raw' in v_def);
  v_pos_cap := position('DELETE FROM public.provider_capabilities' in v_def);
  v_pos_acc := position('DELETE FROM public.provider_accounts' in v_def);
  v_pos_tps := position('DELETE FROM public.tenant_payment_settings' in v_def);
  v_pos_events := position('DELETE FROM public.events' in v_def);
  v_pos_tenants := position('DELETE FROM public.tenants' in v_def);

  IF v_pos_raw = 0 OR v_pos_cap = 0 OR v_pos_acc = 0 OR v_pos_tps = 0 THEN
    RAISE EXCEPTION '1.2a: delete_tenant_complete ohne Provider-Tabellen';
  END IF;

  IF v_pos_cap > v_pos_acc
     OR GREATEST(v_pos_raw, v_pos_cap, v_pos_acc, v_pos_tps) > v_pos_events
     OR v_pos_events > v_pos_tenants
  THEN
    RAISE EXCEPTION '1.2a: Reihenfolge in delete_tenant_complete falsch';
  END IF;

  IF v_def NOT ILIKE '%allow_payment_delete%' THEN
    RAISE EXCEPTION '1.2a: delete_tenant_complete ohne Löschschalter';
  END IF;
END
$$;
