-- Release 2026-10 — Online-Zahlung: Allowlist + Rollout-Modus (vor Freeze).
-- allow: online_payments_platform_visible,online_payments_effective,online_method_block_reason,get_payment_setup_status,set_online_payments_enabled,get_owner_payment_context,set_online_payments_rollout,set_online_payments_studio_allowed,list_online_payments_effective
--
-- Wirksam freigeschaltet =
--   platform_flags.online_payments an
--   UND (rollout = 'all' ODER Studio auf Allowlist).
-- Schreiben nur service_role. Lesen des wirksamen Ergebnisses über get_payment_setup_status.platform_enabled.
--
-- Seed: DEV (demoalpha vorhanden) → alle aktuellen Studios auf Allowlist.
--       PROD (kein Demo-Studio) → Liste leer, Modus allowlist.
--
-- Nach Cron 20261009160000 (DEV hatte Cron schon; fachlich unabhängig von Cron).
--
-- Rückweg: DROP FUNCTIONS/Tables unten; online_method_block_reason /
-- get_payment_setup_status / set_online_payments_enabled / get_owner_payment_context /
-- online_payments_effective aus 20261005120000 bzw. 20260929140001 wiederherstellen.

-- ---------------------------------------------------------------------------
-- 1. Rollout-Modus (eine Zeile)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.online_payments_rollout (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  mode text NOT NULL DEFAULT 'allowlist'
    CHECK (mode IN ('allowlist', 'all')),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

COMMENT ON TABLE public.online_payments_rollout IS
  'Release 2026-10: allowlist = nur gelistete Studios; all = jedes Studio. Nur service_role.';

INSERT INTO public.online_payments_rollout (id, mode)
VALUES (true, 'allowlist')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.online_payments_rollout ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.online_payments_rollout
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE ON TABLE public.online_payments_rollout TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Allowlist
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.online_payments_studio_allowlist (
  tenant_id uuid PRIMARY KEY
    REFERENCES public.tenants (id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

COMMENT ON TABLE public.online_payments_studio_allowlist IS
  'Release 2026-10: Studios mit Online-Zahlung-UI/Connect bei Modus allowlist. Nur service_role.';

ALTER TABLE public.online_payments_studio_allowlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.online_payments_studio_allowlist
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.online_payments_studio_allowlist TO service_role;

-- DEV: alle bestehenden Studios (Kennzeichen: Demo-Slug). PROD: niemand.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.tenants
    WHERE slug IN ('demoalpha', 'demobeta', 'e2eapp')
  ) THEN
    INSERT INTO public.online_payments_studio_allowlist (tenant_id)
    SELECT t.id FROM public.tenants t
    ON CONFLICT (tenant_id) DO NOTHING;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Helfer: Plattform für dieses Studio sichtbar?
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.online_payments_platform_visible(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p_tenant IS NOT NULL
     AND yogaflow_private.platform_flag('online_payments')
     AND (
       (SELECT r.mode FROM public.online_payments_rollout r WHERE r.id) = 'all'
       OR EXISTS (
         SELECT 1
         FROM public.online_payments_studio_allowlist a
         WHERE a.tenant_id = p_tenant
       )
     );
$function$;

COMMENT ON FUNCTION yogaflow_private.online_payments_platform_visible(uuid) IS
  'Plattform an und (Modus all oder Studio auf Allowlist). Steuert UI/Connect/Checkout-Gates.';

REVOKE ALL ON FUNCTION yogaflow_private.online_payments_platform_visible(uuid)
  FROM PUBLIC, anon, authenticated;

-- effective = sichtbar UND Owner-Schalter an
CREATE OR REPLACE FUNCTION yogaflow_private.online_payments_effective(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT yogaflow_private.online_payments_platform_visible(p_tenant)
     AND COALESCE(
       (SELECT s.online_payments_enabled
          FROM public.tenant_payment_settings s
         WHERE s.tenant_id = p_tenant),
       false
     );
$function$;

COMMENT ON FUNCTION yogaflow_private.online_payments_effective(uuid) IS
  'P10 + Allowlist: platform_visible und Studio-Schalter online_payments_enabled.';

REVOKE ALL ON FUNCTION yogaflow_private.online_payments_effective(uuid)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Gates: block_reason, setup status, Owner-Schalter, onboarding context
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.online_method_block_reason(
  p_tenant uuid,
  p_amount_cents integer DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_online boolean;
BEGIN
  IF p_tenant IS NULL THEN
    RETURN 'FORBIDDEN';
  END IF;

  IF NOT yogaflow_private.online_payments_platform_visible(p_tenant) THEN
    RETURN 'PLATFORM_DISABLED';
  END IF;

  SELECT s.online_payments_enabled
    INTO v_online
  FROM yogaflow_private.tenant_payment_settings_for(p_tenant) s;

  IF NOT COALESCE(v_online, false) THEN
    RETURN 'ONLINE_DISABLED';
  END IF;

  IF NOT yogaflow_private.provider_ready(p_tenant) THEN
    RETURN 'PROVIDER_NOT_READY';
  END IF;

  IF NOT yogaflow_private.tax_setting_present(p_tenant) THEN
    RETURN 'TAX_SETTING_MISSING';
  END IF;

  IF NOT yogaflow_private.legal_profile_complete(p_tenant) THEN
    RETURN 'LEGAL_PROFILE_MISSING';
  END IF;

  IF NOT yogaflow_private.current_avv_accepted(p_tenant) THEN
    RETURN 'AVV_MISSING';
  END IF;

  IF NOT yogaflow_private.studio_legal_texts_ready(p_tenant) THEN
    RETURN 'STUDIO_LEGAL_TEXTS_MISSING';
  END IF;

  IF NOT yogaflow_private.online_amount_allowed(p_amount_cents) THEN
    RETURN 'AMOUNT_ABOVE_RECEIPT_LIMIT';
  END IF;

  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.online_method_block_reason(uuid, integer) IS
  'ZW-1/RT-1/Allowlist: Erster Blocker warum Online nicht wählbar ist, sonst NULL.';

REVOKE ALL ON FUNCTION yogaflow_private.online_method_block_reason(uuid, integer)
  FROM PUBLIC, anon, authenticated;

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
    'platform_enabled', yogaflow_private.online_payments_platform_visible(v_tenant_id),
    'has_account', v_has,
    'onboarding_status', CASE WHEN v_has THEN v_acc.onboarding_status ELSE 'not_started' END,
    'charges_enabled', COALESCE(v_acc.charges_enabled, false),
    'card_active', COALESCE(v_card = 'active', false),
    'tax_setting_present', yogaflow_private.tax_setting_present(v_tenant_id),
    'legal_profile_present', yogaflow_private.legal_profile_complete(v_tenant_id),
    'avv_accepted', yogaflow_private.current_avv_accepted(v_tenant_id),
    'studio_legal_texts_ready', yogaflow_private.studio_legal_texts_ready(v_tenant_id),
    'online_payments_enabled', v_online,
    'allow_onsite_payment', v_onsite,
    'requirements_pending', COALESCE(v_acc.requirements_pending, false),
    'requirements_due_at', CASE WHEN v_has THEN v_acc.requirements_due_at ELSE NULL END,
    'disconnected', COALESCE(v_acc.onboarding_status = 'disconnected', false)
  );
END;
$function$;

COMMENT ON FUNCTION public.get_payment_setup_status() IS
  'ZW-1/RT-1/Allowlist: Online-Setup; platform_enabled = wirksam sichtbar für dieses Studio.';

REVOKE ALL ON FUNCTION public.get_payment_setup_status()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_setup_status()
  TO authenticated;

CREATE OR REPLACE FUNCTION public.set_online_payments_enabled(p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_member_id uuid;
  v_tenant_id uuid;
  v_online boolean;
  v_onsite boolean;
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

  SELECT s.online_payments_enabled, s.allow_onsite_payment
    INTO v_online, v_onsite
  FROM yogaflow_private.tenant_payment_settings_for(v_tenant_id) s;

  IF p_enabled THEN
    IF NOT yogaflow_private.online_payments_platform_visible(v_tenant_id) THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'PLATFORM_DISABLED');
    END IF;
    IF NOT yogaflow_private.provider_ready(v_tenant_id) THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'PROVIDER_NOT_READY');
    END IF;
    IF NOT yogaflow_private.tax_setting_present(v_tenant_id) THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'TAX_SETTING_MISSING');
    END IF;
    IF NOT yogaflow_private.legal_profile_complete(v_tenant_id) THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'LEGAL_PROFILE_MISSING');
    END IF;
    IF NOT yogaflow_private.current_avv_accepted(v_tenant_id) THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'AVV_MISSING');
    END IF;
    IF NOT yogaflow_private.studio_legal_texts_ready(v_tenant_id) THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'STUDIO_LEGAL_TEXTS_MISSING');
    END IF;
  ELSE
    IF NOT COALESCE(v_onsite, true) THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'LAST_METHOD');
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

REVOKE ALL ON FUNCTION public.set_online_payments_enabled(boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_online_payments_enabled(boolean)
  TO authenticated;

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
      'platform_enabled', yogaflow_private.online_payments_platform_visible(p_tenant),
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
    'platform_enabled', yogaflow_private.online_payments_platform_visible(p_tenant),
    'account_ref', CASE WHEN v_has THEN v_acc.provider_ref ELSE NULL END,
    'onboarding_status', CASE WHEN v_has THEN v_acc.onboarding_status ELSE 'not_started' END
  );
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.get_owner_payment_context(uuid, uuid) IS
  'Owner-Prüfung und Zahlungskontext; platform_enabled inkl. Allowlist. 1.3a/Allowlist.';

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

REVOKE ALL ON FUNCTION public.get_owner_payment_context(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_owner_payment_context(uuid, uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 5. service_role Runbook-RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_online_payments_rollout(p_mode text)
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
  IF p_mode IS NULL OR p_mode NOT IN ('allowlist', 'all') THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_MODE');
  END IF;

  UPDATE public.online_payments_rollout
     SET mode = p_mode,
         updated_at = pg_catalog.now()
   WHERE id;

  RETURN pg_catalog.jsonb_build_object('success', true, 'mode', p_mode);
END;
$function$;

COMMENT ON FUNCTION public.set_online_payments_rollout(text) IS
  'Modus allowlist|all. Nur service_role.';

REVOKE ALL ON FUNCTION public.set_online_payments_rollout(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_online_payments_rollout(text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.set_online_payments_studio_allowed(
  p_slug text,
  p_allowed boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tenant uuid;
  v_slug text;
BEGIN
  IF COALESCE(
       NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) IN ('anon', 'authenticated')
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  v_slug := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_slug, '')));
  IF v_slug !~ '^[a-z0-9]{3,30}$' OR p_allowed IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
  END IF;

  SELECT t.id INTO v_tenant
  FROM public.tenants t
  WHERE t.slug = v_slug;
  IF v_tenant IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'TENANT_NOT_FOUND');
  END IF;

  IF p_allowed THEN
    INSERT INTO public.online_payments_studio_allowlist (tenant_id)
    VALUES (v_tenant)
    ON CONFLICT (tenant_id) DO NOTHING;
  ELSE
    DELETE FROM public.online_payments_studio_allowlist
    WHERE tenant_id = v_tenant;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'slug', v_slug,
    'allowed', p_allowed,
    'platform_visible', yogaflow_private.online_payments_platform_visible(v_tenant)
  );
END;
$function$;

COMMENT ON FUNCTION public.set_online_payments_studio_allowed(text, boolean) IS
  'Studio per Slug auf Allowlist setzen/entfernen. Nur service_role.';

REVOKE ALL ON FUNCTION public.set_online_payments_studio_allowed(text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_online_payments_studio_allowed(text, boolean)
  TO service_role;

CREATE OR REPLACE FUNCTION public.list_online_payments_effective()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_mode text;
  v_platform boolean;
BEGIN
  IF COALESCE(
       NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) IN ('anon', 'authenticated')
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT r.mode INTO v_mode FROM public.online_payments_rollout r WHERE r.id;
  v_platform := yogaflow_private.platform_flag('online_payments');

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'platform_enabled', v_platform,
    'mode', v_mode,
    'studios', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'slug', t.slug,
          'tenant_id', t.id,
          'on_allowlist', EXISTS (
            SELECT 1 FROM public.online_payments_studio_allowlist a
            WHERE a.tenant_id = t.id
          ),
          'platform_visible', yogaflow_private.online_payments_platform_visible(t.id)
        )
        ORDER BY t.slug
      )
      FROM public.tenants t
      WHERE yogaflow_private.online_payments_platform_visible(t.id)
    ), '[]'::jsonb)
  );
END;
$function$;

COMMENT ON FUNCTION public.list_online_payments_effective() IS
  'Runbook: welche Studios sind wirksam freigeschaltet. Nur service_role.';

REVOKE ALL ON FUNCTION public.list_online_payments_effective()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_online_payments_effective()
  TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Selbstprüfung
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_procs text[] := ARRAY[
    'yogaflow_private.online_payments_platform_visible(uuid)',
    'yogaflow_private.online_payments_effective(uuid)',
    'public.set_online_payments_rollout(text)',
    'public.set_online_payments_studio_allowed(text,boolean)',
    'public.list_online_payments_effective()'
  ];
  v_p text;
BEGIN
  FOREACH v_p IN ARRAY v_procs LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE oid = v_p::regprocedure) THEN
      RAISE EXCEPTION 'allowlist: Funktion fehlt %', v_p;
    END IF;
    IF has_function_privilege('anon', v_p::regprocedure, 'EXECUTE')
       OR has_function_privilege('authenticated', v_p::regprocedure, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'allowlist: % noch EXECUTE für anon/authenticated', v_p;
    END IF;
  END LOOP;

  IF NOT has_function_privilege(
    'service_role',
    'public.set_online_payments_rollout(text)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'allowlist: service_role braucht set_online_payments_rollout';
  END IF;

  IF pg_catalog.pg_get_functiondef(
       'yogaflow_private.online_method_block_reason(uuid,integer)'::regprocedure
     ) NOT LIKE '%online_payments_platform_visible%'
  THEN
    RAISE EXCEPTION 'allowlist: block_reason ohne platform_visible';
  END IF;

  IF pg_catalog.pg_get_functiondef(
       'public.get_payment_setup_status()'::regprocedure
     ) NOT LIKE '%online_payments_platform_visible%'
  THEN
    RAISE EXCEPTION 'allowlist: get_payment_setup_status ohne platform_visible';
  END IF;
END;
$$;
