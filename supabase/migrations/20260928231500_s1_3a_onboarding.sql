-- S1 1.3a — Onboarding-Schema: Anforderungen, disconnected, Owner-Kontext.
--
-- Zweck: Spalten für Stripe-Nachforderungen und getrennte Verbindung; RPCs für
-- Edge Function payments-onboarding und Webhook account.application.deauthorized.
-- Keine Stripe-API in dieser Migration.
--
-- Bezug: Nachtrag 5d, Entscheidungen O1–O7 (28.09.2026).
--
-- Signatur upsert_provider_account: alte (9 Parameter) entfällt. Neue Parameter
-- p_requirements_pending (DEFAULT false) und p_requirements_due_at (DEFAULT NULL).
-- PostgREST-Aufrufe ohne die neuen Felder bleiben gültig. Begründet: CREATE OR
-- REPLACE kann Parameter nicht anhängen; Defaults vermeiden zwei Überladungen.
--
-- Rückweg (Kommentar, läuft hier nicht):
--
-- DROP FUNCTION IF EXISTS public.get_owner_payment_context(uuid, uuid);
-- DROP FUNCTION IF EXISTS yogaflow_private.get_owner_payment_context(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.mark_provider_account_disconnected(public.payment_provider, text);
-- DROP FUNCTION IF EXISTS yogaflow_private.mark_provider_account_disconnected(public.payment_provider, text);
-- DROP FUNCTION IF EXISTS public.upsert_provider_account(uuid, public.payment_provider, text, text, boolean, boolean, boolean, boolean, jsonb, boolean, timestamptz);
-- DROP FUNCTION IF EXISTS yogaflow_private.upsert_provider_account(uuid, public.payment_provider, text, text, boolean, boolean, boolean, boolean, jsonb, boolean, timestamptz);
-- -- danach upsert/get_payment_setup_status aus 20260928203500 wiederherstellen;
-- ALTER TABLE public.provider_accounts DROP COLUMN IF EXISTS disconnected_at;
-- ALTER TABLE public.provider_accounts DROP COLUMN IF EXISTS requirements_due_at;
-- ALTER TABLE public.provider_accounts DROP COLUMN IF EXISTS requirements_pending;
-- -- CHECK onboarding_status ohne disconnected wiederherstellen.

-- ---------------------------------------------------------------------------
-- 1. Spalten und CHECK
-- ---------------------------------------------------------------------------

ALTER TABLE public.provider_accounts
  ADD COLUMN IF NOT EXISTS requirements_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requirements_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS disconnected_at timestamptz;

COMMENT ON COLUMN public.provider_accounts.requirements_pending IS
  'Stripe fordert Angaben nach (currently_due nicht leer). Sperrt active nicht (1.2b-2). 1.3a.';
COMMENT ON COLUMN public.provider_accounts.requirements_due_at IS
  'Frist der Nachforderung (UTC). NULL wenn keine Frist. 1.3a.';
COMMENT ON COLUMN public.provider_accounts.disconnected_at IS
  'Zeitpunkt der Trennung (account.application.deauthorized). NULL = verbunden. 1.3a.';

ALTER TABLE public.provider_accounts
  DROP CONSTRAINT IF EXISTS provider_accounts_onboarding_status_check;

ALTER TABLE public.provider_accounts
  ADD CONSTRAINT provider_accounts_onboarding_status_check
  CHECK (onboarding_status IN (
    'not_started', 'in_progress', 'in_review', 'active', 'action_required', 'disconnected'
  ));

-- ---------------------------------------------------------------------------
-- 2. upsert_provider_account (neue Signatur)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.upsert_provider_account(uuid, public.payment_provider, text, text, boolean, boolean, boolean, boolean, jsonb);
DROP FUNCTION IF EXISTS yogaflow_private.upsert_provider_account(uuid, public.payment_provider, text, text, boolean, boolean, boolean, boolean, jsonb);

CREATE OR REPLACE FUNCTION yogaflow_private.upsert_provider_account(
  p_tenant uuid,
  p_provider public.payment_provider,
  p_ref text,
  p_status text,
  p_charges boolean,
  p_payouts boolean,
  p_details boolean,
  p_livemode boolean,
  p_capabilities jsonb,
  p_requirements_pending boolean DEFAULT false,
  p_requirements_due_at timestamptz DEFAULT NULL
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
  v_req_pending boolean;
  v_status_fields_changed boolean := false;
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

  -- disconnected wird nur über mark_provider_account_disconnected gesetzt.
  IF p_status IS NULL
     OR p_status NOT IN ('not_started', 'in_progress', 'in_review', 'active', 'action_required')
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_STATUS');
  END IF;

  IF p_charges IS NULL OR p_payouts IS NULL OR p_details IS NULL OR p_livemode IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
  END IF;

  v_req_pending := COALESCE(p_requirements_pending, false);

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

  IF v_found AND v_old.onboarding_status = 'disconnected' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ACCOUNT_DISCONNECTED');
  END IF;

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
      livemode,
      requirements_pending,
      requirements_due_at
    ) VALUES (
      p_tenant,
      p_provider,
      v_ref,
      p_status,
      p_charges,
      p_payouts,
      p_details,
      p_livemode,
      v_req_pending,
      p_requirements_due_at
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
      'livemode',
      'requirements_pending',
      'requirements_due_at'
    ]::text[];
  ELSE
    v_account_id := v_old.id;

    IF v_old.onboarding_status IS DISTINCT FROM p_status THEN
      v_fields := pg_catalog.array_append(v_fields, 'onboarding_status');
      v_status_fields_changed := true;
    END IF;
    IF v_old.charges_enabled IS DISTINCT FROM p_charges THEN
      v_fields := pg_catalog.array_append(v_fields, 'charges_enabled');
      v_status_fields_changed := true;
    END IF;
    IF v_old.payouts_enabled IS DISTINCT FROM p_payouts THEN
      v_fields := pg_catalog.array_append(v_fields, 'payouts_enabled');
      v_status_fields_changed := true;
    END IF;
    IF v_old.details_submitted IS DISTINCT FROM p_details THEN
      v_fields := pg_catalog.array_append(v_fields, 'details_submitted');
      v_status_fields_changed := true;
    END IF;
    IF v_old.requirements_pending IS DISTINCT FROM v_req_pending THEN
      v_fields := pg_catalog.array_append(v_fields, 'requirements_pending');
    END IF;
    IF v_old.requirements_due_at IS DISTINCT FROM p_requirements_due_at THEN
      v_fields := pg_catalog.array_append(v_fields, 'requirements_due_at');
    END IF;

    IF pg_catalog.cardinality(v_fields) > 0 THEN
      UPDATE public.provider_accounts
      SET onboarding_status = p_status,
          charges_enabled = p_charges,
          payouts_enabled = p_payouts,
          details_submitted = p_details,
          requirements_pending = v_req_pending,
          requirements_due_at = p_requirements_due_at,
          status_changed_at = CASE
            WHEN v_status_fields_changed THEN pg_catalog.now()
            ELSE status_changed_at
          END
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
        'requirements_pending', v_req_pending,
        'requirements_due_at', p_requirements_due_at,
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

COMMENT ON FUNCTION yogaflow_private.upsert_provider_account(uuid, public.payment_provider, text, text, boolean, boolean, boolean, boolean, jsonb, boolean, timestamptz) IS
  'Legt das verbundene Konto an oder aktualisiert Status, Flags, Capabilities und Nachforderungen. Hängt nie um. disconnected → ACCOUNT_DISCONNECTED. Fehler: TENANT_NOT_FOUND, INVALID_PROVIDER, INVALID_REF, INVALID_STATUS, INVALID_INPUT, INVALID_CAPABILITIES, ACCOUNT_TENANT_MISMATCH, ACCOUNT_REF_MISMATCH, LIVEMODE_MISMATCH, ACCOUNT_DISCONNECTED. 1.3a.';

REVOKE ALL ON FUNCTION yogaflow_private.upsert_provider_account(uuid, public.payment_provider, text, text, boolean, boolean, boolean, boolean, jsonb, boolean, timestamptz)
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
  p_capabilities jsonb,
  p_requirements_pending boolean DEFAULT false,
  p_requirements_due_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
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
    p_capabilities,
    p_requirements_pending,
    p_requirements_due_at
  );
END;
$function$;

COMMENT ON FUNCTION public.upsert_provider_account(uuid, public.payment_provider, text, text, boolean, boolean, boolean, boolean, jsonb, boolean, timestamptz) IS
  'Alias für yogaflow_private.upsert_provider_account. Nur service_role. 1.3a.';

REVOKE ALL ON FUNCTION public.upsert_provider_account(uuid, public.payment_provider, text, text, boolean, boolean, boolean, boolean, jsonb, boolean, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_provider_account(uuid, public.payment_provider, text, text, boolean, boolean, boolean, boolean, jsonb, boolean, timestamptz)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 3. mark_provider_account_disconnected (nur service_role)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.mark_provider_account_disconnected(
  p_provider public.payment_provider,
  p_ref text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_ref text;
  v_acc public.provider_accounts%ROWTYPE;
  v_event_id uuid;
  v_off_event_id uuid;
  v_online boolean;
  v_disabled boolean := false;
BEGIN
  IF p_provider IS NULL OR p_provider = 'manual'::public.payment_provider THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_PROVIDER');
  END IF;

  v_ref := NULLIF(pg_catalog.btrim(COALESCE(p_ref, '')), '');
  IF v_ref IS NULL OR pg_catalog.length(v_ref) > 255 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_REF');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('provider_ref:' || p_provider::text || ':' || v_ref, 0)
  );

  SELECT *
    INTO v_acc
  FROM public.provider_accounts a
  WHERE a.provider = p_provider
    AND a.provider_ref = v_ref
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('tenant_payment_settings:' || v_acc.tenant_id::text, 0)
  );

  IF v_acc.onboarding_status = 'disconnected' THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'changed', false,
      'account_id', v_acc.id,
      'online_payments_disabled', false
    );
  END IF;

  UPDATE public.provider_accounts
  SET onboarding_status = 'disconnected',
      charges_enabled = false,
      payouts_enabled = false,
      requirements_pending = false,
      requirements_due_at = NULL,
      disconnected_at = pg_catalog.now(),
      status_changed_at = pg_catalog.now()
  WHERE id = v_acc.id;

  UPDATE public.provider_capabilities
  SET status = 'inactive',
      updated_at = pg_catalog.now()
  WHERE provider_account_id = v_acc.id
    AND status IS DISTINCT FROM 'inactive';

  v_event_id := yogaflow_private.insert_event(
    v_acc.tenant_id,
    'provider_account.disconnected',
    'provider_account',
    v_acc.id,
    pg_catalog.jsonb_build_object('provider', p_provider::text),
    pg_catalog.gen_random_uuid()
  );

  PERFORM yogaflow_private.insert_audit(
    v_acc.tenant_id,
    NULL,
    'provider_account.disconnected',
    'provider_accounts',
    v_acc.id,
    ARRAY[
      'onboarding_status',
      'charges_enabled',
      'payouts_enabled',
      'requirements_pending',
      'requirements_due_at',
      'disconnected_at',
      'capabilities'
    ]::text[],
    v_event_id
  );

  SELECT s.online_payments_enabled
    INTO v_online
  FROM yogaflow_private.tenant_payment_settings_for(v_acc.tenant_id) s;

  IF v_online THEN
    UPDATE public.tenant_payment_settings
    SET online_payments_enabled = false,
        changed_by = NULL,
        updated_at = pg_catalog.now()
    WHERE tenant_id = v_acc.tenant_id;

    v_off_event_id := yogaflow_private.insert_event(
      v_acc.tenant_id,
      'payments.online_disabled',
      'tenant',
      v_acc.tenant_id,
      pg_catalog.jsonb_build_object('reason', 'PROVIDER_DISCONNECTED'),
      v_event_id
    );

    PERFORM yogaflow_private.insert_audit(
      v_acc.tenant_id,
      NULL,
      'payments.online_disabled',
      'tenant_payment_settings',
      v_acc.tenant_id,
      ARRAY['online_payments_enabled', 'changed_by', 'updated_at']::text[],
      v_off_event_id
    );

    v_disabled := true;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'changed', true,
    'account_id', v_acc.id,
    'online_payments_disabled', v_disabled
  );
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.mark_provider_account_disconnected(public.payment_provider, text) IS
  'Setzt Konto auf disconnected, Capabilities inactive, Studio online aus (PROVIDER_DISCONNECTED). Schon getrennt → ohne Event. Fehler: INVALID_PROVIDER, INVALID_REF, NOT_FOUND. 1.3a.';

REVOKE ALL ON FUNCTION yogaflow_private.mark_provider_account_disconnected(public.payment_provider, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_provider_account_disconnected(
  p_provider public.payment_provider,
  p_ref text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF COALESCE(
       NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) IN ('anon', 'authenticated')
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  RETURN yogaflow_private.mark_provider_account_disconnected(p_provider, p_ref);
END;
$function$;

COMMENT ON FUNCTION public.mark_provider_account_disconnected(public.payment_provider, text) IS
  'Alias für yogaflow_private.mark_provider_account_disconnected. Nur service_role (payments-webhook).';

REVOKE ALL ON FUNCTION public.mark_provider_account_disconnected(public.payment_provider, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_provider_account_disconnected(public.payment_provider, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 4. get_owner_payment_context (nur service_role)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.get_owner_payment_context(
  p_tenant uuid,
  p_member uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role text;
  v_acc public.provider_accounts%ROWTYPE;
  v_has boolean;
BEGIN
  IF p_tenant IS NULL OR p_member IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
  END IF;

  SELECT u.role
    INTO v_role
  FROM public.users u
  WHERE u.id = p_member
    AND u.tenant_id = p_tenant;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'is_owner', false,
      'platform_enabled', yogaflow_private.platform_flag('online_payments'),
      'account_ref', NULL,
      'onboarding_status', 'not_started'
    );
  END IF;

  SELECT *
    INTO v_acc
  FROM public.provider_accounts a
  WHERE a.tenant_id = p_tenant
    AND a.provider = 'stripe'::public.payment_provider;
  v_has := FOUND;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'is_owner', v_role = 'owner',
    'platform_enabled', yogaflow_private.platform_flag('online_payments'),
    'account_ref', CASE WHEN v_has THEN v_acc.provider_ref ELSE NULL END,
    'onboarding_status', CASE WHEN v_has THEN v_acc.onboarding_status ELSE 'not_started' END
  );
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.get_owner_payment_context(uuid, uuid) IS
  'Owner-Prüfung und Zahlungskontext für payments-onboarding. account_ref nur serverseitig. 1.3a.';

REVOKE ALL ON FUNCTION yogaflow_private.get_owner_payment_context(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_owner_payment_context(
  p_tenant uuid,
  p_member uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF COALESCE(
       NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) IN ('anon', 'authenticated')
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  RETURN yogaflow_private.get_owner_payment_context(p_tenant, p_member);
END;
$function$;

COMMENT ON FUNCTION public.get_owner_payment_context(uuid, uuid) IS
  'Alias für yogaflow_private.get_owner_payment_context. Nur service_role (payments-onboarding).';

REVOKE ALL ON FUNCTION public.get_owner_payment_context(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_owner_payment_context(uuid, uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 5. get_payment_setup_status (Owner/Admin, neue Felder)
-- ---------------------------------------------------------------------------

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
    'allow_onsite_payment', v_onsite,
    'requirements_pending', COALESCE(v_acc.requirements_pending, false),
    'requirements_due_at', CASE WHEN v_has THEN v_acc.requirements_due_at ELSE NULL END,
    'disconnected', COALESCE(v_acc.onboarding_status = 'disconnected', false)
  );
END;
$function$;

COMMENT ON FUNCTION public.get_payment_setup_status() IS
  'Stand der Online-Zahlung für Owner/Admin inkl. Nachforderungen und disconnected. 1.3a.';

REVOKE ALL ON FUNCTION public.get_payment_setup_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_setup_status() TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Selbstprüfung
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_fn text;
  v_oid oid;
  v_res jsonb;
  v_def text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'provider_accounts'
      AND column_name = 'requirements_pending'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'provider_accounts'
      AND column_name = 'requirements_due_at'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'provider_accounts'
      AND column_name = 'disconnected_at'
  ) THEN
    RAISE EXCEPTION '1.3a: Spalten auf provider_accounts fehlen';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'provider_accounts_onboarding_status_check'
      AND pg_get_constraintdef(oid) ILIKE '%disconnected%'
  ) THEN
    RAISE EXCEPTION '1.3a: CHECK ohne disconnected';
  END IF;

  -- Alte 9-Parameter-Signatur darf nicht mehr existieren
  IF to_regprocedure(
    'public.upsert_provider_account(uuid,public.payment_provider,text,text,boolean,boolean,boolean,boolean,jsonb)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION '1.3a: alte upsert_provider_account-Signatur existiert noch';
  END IF;

  FOREACH v_fn IN ARRAY ARRAY[
    'yogaflow_private.upsert_provider_account(uuid,public.payment_provider,text,text,boolean,boolean,boolean,boolean,jsonb,boolean,timestamptz)',
    'public.upsert_provider_account(uuid,public.payment_provider,text,text,boolean,boolean,boolean,boolean,jsonb,boolean,timestamptz)',
    'yogaflow_private.mark_provider_account_disconnected(public.payment_provider,text)',
    'public.mark_provider_account_disconnected(public.payment_provider,text)',
    'yogaflow_private.get_owner_payment_context(uuid,uuid)',
    'public.get_owner_payment_context(uuid,uuid)',
    'public.get_payment_setup_status()'
  ]
  LOOP
    v_oid := to_regprocedure(v_fn);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION '1.3a: Funktion % fehlt', v_fn;
    END IF;

    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) THEN
      RAISE EXCEPTION '1.3a: % ist nicht SECURITY DEFINER', v_fn;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_options_to_table((SELECT proconfig FROM pg_proc WHERE oid = v_oid))
      WHERE option_name = 'search_path' AND option_value = '""'
    ) THEN
      RAISE EXCEPTION '1.3a: search_path von % ist nicht leer', v_fn;
    END IF;

    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION '1.3a: anon hat EXECUTE auf %', v_fn;
    END IF;
  END LOOP;

  FOREACH v_fn IN ARRAY ARRAY[
    'yogaflow_private.upsert_provider_account(uuid,public.payment_provider,text,text,boolean,boolean,boolean,boolean,jsonb,boolean,timestamptz)',
    'public.upsert_provider_account(uuid,public.payment_provider,text,text,boolean,boolean,boolean,boolean,jsonb,boolean,timestamptz)',
    'yogaflow_private.mark_provider_account_disconnected(public.payment_provider,text)',
    'public.mark_provider_account_disconnected(public.payment_provider,text)',
    'yogaflow_private.get_owner_payment_context(uuid,uuid)',
    'public.get_owner_payment_context(uuid,uuid)'
  ]
  LOOP
    IF has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '1.3a: authenticated hat EXECUTE auf %', v_fn;
    END IF;
  END LOOP;

  IF NOT has_function_privilege('authenticated', 'public.get_payment_setup_status()', 'EXECUTE') THEN
    RAISE EXCEPTION '1.3a: authenticated braucht EXECUTE auf get_payment_setup_status';
  END IF;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.upsert_provider_account(uuid,public.payment_provider,text,text,boolean,boolean,boolean,boolean,jsonb,boolean,timestamptz)',
    'public.mark_provider_account_disconnected(public.payment_provider,text)',
    'public.get_owner_payment_context(uuid,uuid)'
  ]
  LOOP
    IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '1.3a: service_role braucht EXECUTE auf %', v_fn;
    END IF;
  END LOOP;

  -- Client-JWT → FORBIDDEN auf Service-Aliase
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);

  v_res := public.upsert_provider_account(
    gen_random_uuid(), 'stripe'::public.payment_provider, 'acct_x', 'in_progress',
    false, false, false, false, NULL
  );
  IF v_res ->> 'error' IS DISTINCT FROM 'FORBIDDEN' THEN
    RAISE EXCEPTION '1.3a: upsert mit Client-JWT nicht FORBIDDEN: %', v_res;
  END IF;

  v_res := public.mark_provider_account_disconnected('stripe'::public.payment_provider, 'acct_x');
  IF v_res ->> 'error' IS DISTINCT FROM 'FORBIDDEN' THEN
    RAISE EXCEPTION '1.3a: mark_disconnected mit Client-JWT nicht FORBIDDEN: %', v_res;
  END IF;

  v_res := public.get_owner_payment_context(gen_random_uuid(), gen_random_uuid());
  IF v_res ->> 'error' IS DISTINCT FROM 'FORBIDDEN' THEN
    RAISE EXCEPTION '1.3a: get_owner_payment_context mit Client-JWT nicht FORBIDDEN: %', v_res;
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);

  -- provider_ready: disconnected zählt nicht als bereit (Status ≠ active)
  SELECT pg_get_functiondef('yogaflow_private.provider_ready(uuid)'::regprocedure)
    INTO v_def;
  IF v_def NOT ILIKE '%onboarding_status = ''active''%' THEN
    RAISE EXCEPTION '1.3a: provider_ready prüft active nicht mehr';
  END IF;
END
$$;
