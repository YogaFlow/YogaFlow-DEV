-- ZW-1 — Zahlungswege: Methodenliste, Default Z4, min. ein Weg, Online wählbar mit Vor Ort.
-- allow: online_method_block_reason,online_method_available,online_payment_required,booking_payment_options,set_online_payments_enabled,set_allow_onsite_payment,get_payment_setup_status,register_for_course,promote_from_waitlist
-- Entscheidung 14 (Z1–Z6).
--
-- Rückweg (nur DEV, vor PROD-Push):
--   ALTER TABLE public.registrations DROP CONSTRAINT registrations_coverage_intent_check;
--   ALTER TABLE public.registrations ADD CONSTRAINT registrations_coverage_intent_check
--     CHECK (coverage_intent IS NULL OR coverage_intent = 'pass');
--   DROP FUNCTION IF EXISTS public.booking_payment_options(uuid, integer);
--   DROP FUNCTION IF EXISTS public.register_for_course(uuid, boolean, text);
--   -- booking_payment_options(integer) / register_for_course(uuid, boolean) /
--   -- online_payment_required / set_* aus 20261004090000 / 20261004140000 wiederherstellen.

-- ---------------------------------------------------------------------------
-- 0. Z6 Vorher-Zählung (nur RAISE NOTICE; kein Datenverlust)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_both_on int;
  v_only_online int;
  v_only_onsite int;
  v_both_off int;
BEGIN
  SELECT
    COUNT(*) FILTER (
      WHERE COALESCE(s.online_payments_enabled, false)
        AND COALESCE(s.allow_onsite_payment, true)
    ),
    COUNT(*) FILTER (
      WHERE COALESCE(s.online_payments_enabled, false)
        AND NOT COALESCE(s.allow_onsite_payment, true)
    ),
    COUNT(*) FILTER (
      WHERE NOT COALESCE(s.online_payments_enabled, false)
        AND COALESCE(s.allow_onsite_payment, true)
    ),
    COUNT(*) FILTER (
      WHERE NOT COALESCE(s.online_payments_enabled, false)
        AND NOT COALESCE(s.allow_onsite_payment, true)
    )
  INTO v_both_on, v_only_online, v_only_onsite, v_both_off
  FROM public.tenants t
  LEFT JOIN public.tenant_payment_settings s ON s.tenant_id = t.id;

  RAISE NOTICE 'ZW1 Z6 vorher: both_on=% only_online=% only_onsite=% both_off=%',
    v_both_on, v_only_online, v_only_onsite, v_both_off;

  -- beide aus → nur Vor Ort (Z6 / Z1 mindestens einer)
  UPDATE public.tenant_payment_settings s
  SET allow_onsite_payment = true,
      updated_at = pg_catalog.now()
  WHERE COALESCE(s.online_payments_enabled, false) = false
    AND COALESCE(s.allow_onsite_payment, true) = false;

  SELECT
    COUNT(*) FILTER (
      WHERE COALESCE(s.online_payments_enabled, false)
        AND COALESCE(s.allow_onsite_payment, true)
    ),
    COUNT(*) FILTER (
      WHERE COALESCE(s.online_payments_enabled, false)
        AND NOT COALESCE(s.allow_onsite_payment, true)
    ),
    COUNT(*) FILTER (
      WHERE NOT COALESCE(s.online_payments_enabled, false)
        AND COALESCE(s.allow_onsite_payment, true)
    ),
    COUNT(*) FILTER (
      WHERE NOT COALESCE(s.online_payments_enabled, false)
        AND NOT COALESCE(s.allow_onsite_payment, true)
    )
  INTO v_both_on, v_only_online, v_only_onsite, v_both_off
  FROM public.tenants t
  LEFT JOIN public.tenant_payment_settings s ON s.tenant_id = t.id;

  RAISE NOTICE 'ZW1 Z6 nachher: both_on=% only_online=% only_onsite=% both_off=%',
    v_both_on, v_only_online, v_only_onsite, v_both_off;

  IF v_both_off <> 0 THEN
    RAISE EXCEPTION 'ZW1 Z6: both_off muss 0 sein, ist %', v_both_off;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. coverage_intent: online | onsite | pass
-- ---------------------------------------------------------------------------

ALTER TABLE public.registrations
  DROP CONSTRAINT registrations_coverage_intent_check;

ALTER TABLE public.registrations
  ADD CONSTRAINT registrations_coverage_intent_check
  CHECK (
    coverage_intent IS NULL
    OR coverage_intent = ANY (ARRAY['pass'::text, 'online'::text, 'onsite'::text])
  );

-- ---------------------------------------------------------------------------
-- 2. Helfer: warum Online nicht wählbar / ob wählbar
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

  IF NOT yogaflow_private.platform_flag('online_payments') THEN
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

  IF NOT yogaflow_private.online_amount_allowed(p_amount_cents) THEN
    RETURN 'AMOUNT_ABOVE_RECEIPT_LIMIT';
  END IF;

  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.online_method_block_reason(uuid, integer) IS
  'ZW-1: Erster Blocker warum Online nicht wählbar ist, sonst NULL.';

REVOKE ALL ON FUNCTION yogaflow_private.online_method_block_reason(uuid, integer)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION yogaflow_private.online_method_available(
  p_tenant uuid,
  p_amount_cents integer DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT yogaflow_private.online_method_block_reason(p_tenant, p_amount_cents) IS NULL;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.online_method_available(uuid, integer)
  FROM PUBLIC, anon, authenticated;

-- Online-Pflicht = Online wählbar und Vor Ort aus (nur-Online-Studio).
CREATE OR REPLACE FUNCTION yogaflow_private.online_payment_required(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT yogaflow_private.online_method_available(p_tenant, NULL)
     AND NOT COALESCE(
       (SELECT s.allow_onsite_payment
          FROM public.tenant_payment_settings s
         WHERE s.tenant_id = p_tenant),
       true
     );
$function$;

COMMENT ON FUNCTION yogaflow_private.online_payment_required(uuid) IS
  'ZW-1: Online wählbar und Vor Ort aus → Pflichtweg ohne Karte.';

-- ---------------------------------------------------------------------------
-- 3. booking_payment_options(course, amount) — Methodenliste + Default Z4
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.booking_payment_options(integer);

CREATE OR REPLACE FUNCTION public.booking_payment_options(
  p_course_id uuid DEFAULT NULL,
  p_amount_cents integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid := yogaflow_private.get_my_member_id();
  v_tenant_id uuid := yogaflow_private.get_my_tenant_id();
  v_amount integer := p_amount_cents;
  v_course_tenant uuid;
  v_course_price numeric;
  v_pass_eligible boolean;
  v_course_date date;
  v_onsite boolean;
  v_block text;
  v_online_ok boolean;
  v_methods jsonb := '[]'::jsonb;
  v_default text := NULL;
  v_pass record;
  v_remaining integer;
  v_label text;
BEGIN
  IF v_member_id IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_course_id IS NOT NULL THEN
    SELECT c.tenant_id, c.price, COALESCE(c.pass_eligible, true), c.date
      INTO v_course_tenant, v_course_price, v_pass_eligible, v_course_date
    FROM public.courses c
    WHERE c.id = p_course_id;

    IF NOT FOUND OR v_course_tenant IS DISTINCT FROM v_tenant_id THEN
      RAISE EXCEPTION 'FORBIDDEN'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_amount IS NULL THEN
      v_amount := pg_catalog.round(COALESCE(v_course_price, 0) * 100)::integer;
    END IF;
  END IF;

  SELECT s.allow_onsite_payment
    INTO v_onsite
  FROM yogaflow_private.tenant_payment_settings_for(v_tenant_id) s;

  v_block := yogaflow_private.online_method_block_reason(v_tenant_id, v_amount);
  v_online_ok := v_block IS NULL;

  -- Z3: Karte nur mit gültigem Guthaben für diesen Kurs
  IF p_course_id IS NOT NULL
     AND v_pass_eligible
     AND COALESCE(v_course_price, 0) > 0
  THEN
    SELECT p.id, p.name
      INTO v_pass
    FROM public.passes p
    WHERE p.member_id = v_member_id
      AND p.tenant_id = v_tenant_id
      AND p.status = 'active'
      AND p.valid_until >= v_course_date
      AND yogaflow_private.pass_remaining(p.id) >= 1
    ORDER BY p.valid_until ASC, p.created_at ASC, p.id ASC
    LIMIT 1;

    IF FOUND THEN
      v_remaining := yogaflow_private.pass_remaining(v_pass.id);
      v_label := v_pass.name || ' · noch ' || v_remaining::text;
      v_methods := v_methods || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'method', 'pass',
          'pass_id', v_pass.id,
          'label', v_label,
          'remaining', v_remaining
        )
      );
      v_default := 'pass';
    END IF;
  END IF;

  IF v_online_ok THEN
    v_methods := v_methods || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('method', 'online')
    );
    IF v_default IS NULL THEN
      v_default := 'online';
    END IF;
  END IF;

  IF COALESCE(v_onsite, true) THEN
    v_methods := v_methods || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('method', 'onsite')
    );
    IF v_default IS NULL THEN
      v_default := 'onsite';
    END IF;
  END IF;

  -- Mindestens Vor Ort, falls alles andere fehlt (fail-open wie Default-Schema)
  IF pg_catalog.jsonb_array_length(v_methods) = 0 THEN
    v_methods := pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('method', 'onsite')
    );
    v_default := 'onsite';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'methods', v_methods,
    'default', v_default,
    'online_required', v_online_ok AND NOT COALESCE(v_onsite, true),
    'online_offered', v_block IS DISTINCT FROM 'ONLINE_DISABLED'
      AND v_block IS DISTINCT FROM 'PLATFORM_DISABLED',
    'online_ready', v_online_ok,
    'online_unavailable_reason', v_block,
    'reason', v_block
  );
END;
$function$;

COMMENT ON FUNCTION public.booking_payment_options(uuid, integer) IS
  'ZW-1: Wählbare Zahlungswege + Default (pass → online → onsite).';

REVOKE ALL ON FUNCTION public.booking_payment_options(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.booking_payment_options(uuid, integer)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Schalter: letzten Weg nicht ausschalten
-- ---------------------------------------------------------------------------

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
    IF NOT yogaflow_private.platform_flag('online_payments') THEN
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
  ELSE
    -- Z1: mindestens ein Weg
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
  v_online boolean;
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

  SELECT s.allow_onsite_payment, s.online_payments_enabled
    INTO v_onsite, v_online
  FROM yogaflow_private.tenant_payment_settings_for(v_tenant_id) s;

  IF NOT p_allow AND NOT COALESCE(v_online, false) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'LAST_METHOD');
  END IF;

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
  'ZW-1: Vor Ort anbieten. Letzten Weg nicht ausschaltbar (LAST_METHOD).';

REVOKE ALL ON FUNCTION public.set_allow_onsite_payment(boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_allow_onsite_payment(boolean)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 4b. get_payment_setup_status: avv_accepted für Statuszeile
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
    'legal_profile_present', yogaflow_private.legal_profile_complete(v_tenant_id),
    'avv_accepted', yogaflow_private.current_avv_accepted(v_tenant_id),
    'online_payments_enabled', v_online,
    'allow_onsite_payment', v_onsite,
    'requirements_pending', COALESCE(v_acc.requirements_pending, false),
    'requirements_due_at', CASE WHEN v_has THEN v_acc.requirements_due_at ELSE NULL END,
    'disconnected', COALESCE(v_acc.onboarding_status = 'disconnected', false)
  );
END;
$function$;

COMMENT ON FUNCTION public.get_payment_setup_status() IS
  'ZW-1: Online-Setup inkl. avv_accepted für Statuszeile.';

REVOKE ALL ON FUNCTION public.get_payment_setup_status()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_setup_status()
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. register_for_course(+ p_method)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.register_for_course(uuid, boolean);

CREATE OR REPLACE FUNCTION public.register_for_course(
  p_course_id uuid,
  p_use_pass boolean DEFAULT false,
  p_method text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := yogaflow_private.get_my_member_id();
  v_tenant_id uuid;
  v_user_role text;
  v_course_tenant uuid;
  v_max_participants integer;
  v_course_date date;
  v_course_status text;
  v_teacher_id uuid;
  v_course_price numeric;
  v_current_count integer;
  v_next_position integer;
  v_reg_id uuid;
  v_pass_id uuid;
  v_want_pass boolean;
  v_free boolean;
  v_coverage text;
  v_remaining integer;
  v_hold_expires timestamptz;
  v_method text;
  v_amount integer;
  v_online_ok boolean;
  v_onsite boolean;
  v_opts jsonb;
  v_intent text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Bitte melde dich an.'
    );
  END IF;

  SELECT tenant_id, role
  INTO v_tenant_id, v_user_role
  FROM public.users
  WHERE id = v_user_id;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Kein Tenant für Benutzer gefunden.'
    );
  END IF;

  IF v_user_role NOT IN ('user', 'teacher') THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Owner und Admins können sich nicht für Kurse anmelden.'
    );
  END IF;

  SELECT tenant_id, max_participants, date, status, teacher_id, price
  INTO v_course_tenant, v_max_participants, v_course_date, v_course_status,
       v_teacher_id, v_course_price
  FROM public.courses
  WHERE id = p_course_id
  FOR UPDATE;

  IF NOT FOUND OR v_max_participants IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Kurs nicht gefunden.'
    );
  END IF;

  IF v_teacher_id IS NOT DISTINCT FROM v_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Du kannst dich nicht für deinen eigenen Kurs anmelden.'
    );
  END IF;

  IF v_course_tenant IS DISTINCT FROM v_tenant_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Dieser Kurs gehört nicht zu deinem Studio.'
    );
  END IF;

  IF v_course_date < CURRENT_DATE THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Anmeldung für vergangene Kurse ist nicht möglich.'
    );
  END IF;

  IF lower(trim(coalesce(v_course_status, 'active'))) IN (
    'canceled', 'cancelled', 'not_planned'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Dieser Kurs ist nicht zur Anmeldung verfügbar.'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.registrations
    WHERE course_id = p_course_id
      AND user_id = v_user_id
      AND cancellation_timestamp IS NULL
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Du bist für diesen Kurs bereits angemeldet oder stehst auf der Warteliste.'
    );
  END IF;

  v_free := (COALESCE(v_course_price, 0) = 0);
  v_amount := pg_catalog.round(COALESCE(v_course_price, 0) * 100)::integer;
  v_online_ok := yogaflow_private.online_method_available(v_tenant_id, v_amount);
  SELECT s.allow_onsite_payment INTO v_onsite
  FROM yogaflow_private.tenant_payment_settings_for(v_tenant_id) s;

  -- Methode auflösen: p_use_pass (Kompat) oder p_method oder Default Z4
  IF v_free THEN
    v_method := 'onsite';
  ELSIF COALESCE(p_use_pass, false) THEN
    v_method := 'pass';
  ELSIF p_method IS NOT NULL THEN
    v_method := lower(btrim(p_method));
  ELSE
    v_opts := public.booking_payment_options(p_course_id, v_amount);
    v_method := COALESCE(v_opts->>'default', 'onsite');
  END IF;

  IF v_method NOT IN ('pass', 'online', 'onsite') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_METHOD',
      'message', 'Ungültiger Zahlungsweg.'
    );
  END IF;

  IF v_method = 'pass' AND v_free THEN
    v_method := 'onsite';
  END IF;

  IF v_method = 'online' AND NOT v_online_ok THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ONLINE_UNAVAILABLE',
      'message', 'Online-Zahlung ist gerade nicht verfügbar.'
    );
  END IF;

  IF v_method = 'onsite' AND NOT COALESCE(v_onsite, true) AND NOT v_free THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ONSITE_UNAVAILABLE',
      'message', 'Vor-Ort-Zahlung ist in diesem Studio nicht angeboten.'
    );
  END IF;

  v_want_pass := (v_method = 'pass');

  v_current_count := yogaflow_private.course_occupied_seats(p_course_id);

  IF v_current_count >= v_max_participants THEN
    SELECT COUNT(*)::integer + 1 INTO v_next_position
    FROM public.registrations
    WHERE course_id = p_course_id
      AND is_waitlist = true
      AND status = 'waitlist'
      AND cancellation_timestamp IS NULL;

    v_intent := CASE
      WHEN v_free THEN NULL
      WHEN v_method = 'pass' THEN 'pass'
      WHEN v_method = 'online' THEN 'online'
      WHEN v_method = 'onsite' THEN 'onsite'
      ELSE NULL
    END;

    INSERT INTO public.registrations (
      user_id,
      course_id,
      tenant_id,
      status,
      is_waitlist,
      waitlist_position,
      coverage_intent
    )
    VALUES (
      v_user_id,
      p_course_id,
      v_tenant_id,
      'waitlist',
      true,
      v_next_position,
      v_intent
    )
    RETURNING id INTO v_reg_id;

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Du wurdest auf die Warteliste gesetzt.',
      'waitlist_position', v_next_position,
      'is_waitlist', true,
      'coverage', CASE WHEN v_free THEN 'not_required' ELSE 'open' END,
      'status', 'waitlist',
      'registration_id', v_reg_id
    );
  END IF;

  IF v_want_pass THEN
    v_pass_id := yogaflow_private.pick_pass_for_registration(v_user_id, p_course_id);
    IF v_pass_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'NO_VALID_PASS',
        'message', 'Du hast keine gültige Karte für diesen Kurs.'
      );
    END IF;
  END IF;

  -- Online gewählt (oder Default nur-Online) → Hold
  IF NOT v_free AND v_method = 'online' THEN
    v_hold_expires := pg_catalog.now() + interval '15 minutes';
    v_reg_id := yogaflow_private.create_pending_registration(
      p_course_id,
      v_user_id,
      'checkout',
      v_hold_expires
    );

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Platz reserviert — bitte jetzt online bezahlen.',
      'is_waitlist', false,
      'coverage', 'open',
      'status', 'pending_payment',
      'registration_id', v_reg_id,
      'hold_expires_at', v_hold_expires
    );
  END IF;

  BEGIN
    INSERT INTO public.registrations (
      user_id,
      course_id,
      tenant_id,
      status,
      is_waitlist,
      waitlist_position
    )
    VALUES (
      v_user_id,
      p_course_id,
      v_tenant_id,
      'registered',
      false,
      NULL
    )
    RETURNING id INTO v_reg_id;

    IF v_want_pass THEN
      PERFORM yogaflow_private.redeem_pass(v_reg_id, v_pass_id, v_user_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM IN (
      'PASS_EMPTY', 'PASS_EXPIRED', 'PASS_MISMATCH',
      'NOT_PASS_ELIGIBLE', 'NOT_OPEN'
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'message', CASE SQLERRM
          WHEN 'PASS_EMPTY' THEN 'Deine Karte ist aufgebraucht.'
          WHEN 'PASS_EXPIRED' THEN 'Deine Karte gilt nicht für diesen Kurstag.'
          WHEN 'NOT_PASS_ELIGIBLE' THEN 'In diesem Kurs kannst du keine Karte nutzen.'
          ELSE 'Die Karte konnte nicht eingelöst werden.'
        END
      );
    END IF;
    RAISE;
  END;

  SELECT coverage_status::text INTO v_coverage
  FROM public.registrations WHERE id = v_reg_id;

  IF v_coverage = 'pass' THEN
    v_remaining := yogaflow_private.pass_remaining(v_pass_id);
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Erfolgreich angemeldet.',
      'is_waitlist', false,
      'coverage', 'pass',
      'pass_remaining', v_remaining,
      'status', 'registered',
      'registration_id', v_reg_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Erfolgreich angemeldet.',
    'is_waitlist', false,
    'coverage', COALESCE(v_coverage, 'open'),
    'status', 'registered',
    'registration_id', v_reg_id
  );
END;
$function$;

COMMENT ON FUNCTION public.register_for_course(uuid, boolean, text) IS
  'ZW-1: Selbstanmeldung mit p_method pass|online|onsite (Default Z4). p_use_pass bleibt Kompat.';

REVOKE ALL ON FUNCTION public.register_for_course(uuid, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_for_course(uuid, boolean, text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. promote_from_waitlist — Online-Hold nur bei Intent/Default Online
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.promote_from_waitlist(p_course_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_max_participants integer;
  v_current_count integer;
  v_next_user record;
  v_course_title text;
  v_course_date date;
  v_course_time time;
  v_course_price numeric;
  v_tenant_id uuid;
  v_status text;
  v_notification_body text;
  v_pass_id uuid;
  v_remaining integer;
  v_redeem_ok boolean;
  v_want_online boolean;
  v_amount integer;
  v_deadline timestamptz;
BEGIN
  SELECT max_participants, title, date, time, price, tenant_id, status
  INTO v_max_participants, v_course_title, v_course_date, v_course_time,
       v_course_price, v_tenant_id, v_status
  FROM public.courses
  WHERE id = p_course_id
  FOR UPDATE;

  IF NOT FOUND OR v_status IS DISTINCT FROM 'active' THEN
    RETURN;
  END IF;

  v_current_count := yogaflow_private.course_occupied_seats(p_course_id);
  v_amount := pg_catalog.round(COALESCE(v_course_price, 0) * 100)::integer;

  WHILE v_current_count < v_max_participants LOOP
    SELECT id, user_id, waitlist_position, coverage_intent
      INTO v_next_user
    FROM public.registrations
    WHERE course_id = p_course_id
      AND is_waitlist = true
      AND status = 'waitlist'
      AND cancellation_timestamp IS NULL
    ORDER BY waitlist_position ASC
    LIMIT 1;

    EXIT WHEN v_next_user.id IS NULL;

    -- ZW-1: Online-Hold wenn Intent online, oder Legacy NULL + nur-Online-Studio
    v_want_online := COALESCE(v_course_price, 0) > 0
      AND yogaflow_private.online_method_available(v_tenant_id, v_amount)
      AND (
        v_next_user.coverage_intent IS NOT DISTINCT FROM 'online'
        OR (
          v_next_user.coverage_intent IS NULL
          AND yogaflow_private.online_payment_required(v_tenant_id)
        )
      );

    IF v_want_online THEN
      v_deadline := yogaflow_private.promotion_hold_deadline(p_course_id);
      IF v_deadline IS NULL OR v_deadline <= pg_catalog.now() THEN
        PERFORM yogaflow_private.insert_event(
          v_tenant_id,
          'waitlist.promotion_skipped',
          'course',
          p_course_id,
          pg_catalog.jsonb_build_object(
            'course_id', p_course_id,
            'reason_code', 'TOO_CLOSE_TO_START'
          ),
          pg_catalog.gen_random_uuid()
        );
        EXIT;
      END IF;
    END IF;

    v_redeem_ok := false;
    v_remaining := NULL;

    IF NOT v_want_online THEN
      UPDATE public.registrations
      SET status = 'registered',
          is_waitlist = false,
          waitlist_position = NULL,
          registered_at = pg_catalog.now()
      WHERE id = v_next_user.id;

      IF v_next_user.coverage_intent IS NOT DISTINCT FROM 'pass' THEN
        BEGIN
          v_pass_id := yogaflow_private.pick_pass_for_registration(
            v_next_user.user_id, p_course_id
          );
          IF v_pass_id IS NOT NULL THEN
            PERFORM yogaflow_private.redeem_pass(
              v_next_user.id, v_pass_id, NULL
            );
            v_remaining := yogaflow_private.pass_remaining(v_pass_id);
            v_redeem_ok := true;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_redeem_ok := false;
          v_remaining := NULL;
        END;

        UPDATE public.registrations
        SET coverage_intent = NULL
        WHERE id = v_next_user.id;
      ELSE
        UPDATE public.registrations
        SET coverage_intent = NULL
        WHERE id = v_next_user.id;
      END IF;

      IF v_next_user.coverage_intent IS NOT DISTINCT FROM 'pass' AND NOT v_redeem_ok THEN
        v_notification_body :=
          'Du bist nachgerückt. Deine Karte konnte nicht genutzt werden, bitte bezahle vor Ort.';
      ELSE
        v_notification_body := pg_catalog.format(
          'Du hast einen Platz im Kurs „%s“ am %s um %s bekommen.',
          v_course_title,
          pg_catalog.to_char(v_course_date, 'DD.MM.YYYY'),
          pg_catalog.to_char(v_course_time, 'HH24:MI')
        );
        IF v_redeem_ok THEN
          v_notification_body := v_notification_body
            || pg_catalog.format(
              ' Mit deiner Karte bezahlt (noch %s).',
              v_remaining
            );
        END IF;
      END IF;

      INSERT INTO public.user_notifications (
        tenant_id,
        user_id,
        type,
        body,
        course_id,
        action_path,
        metadata
      ) VALUES (
        v_tenant_id,
        v_next_user.user_id,
        'waitlist_promoted',
        v_notification_body,
        p_course_id,
        '/my-courses',
        pg_catalog.jsonb_build_object('promoted_from_waitlist', true)
      );

    ELSIF v_next_user.coverage_intent IS NOT DISTINCT FROM 'pass' THEN
      UPDATE public.registrations
      SET status = 'registered',
          is_waitlist = false,
          waitlist_position = NULL,
          registered_at = pg_catalog.now()
      WHERE id = v_next_user.id;

      BEGIN
        v_pass_id := yogaflow_private.pick_pass_for_registration(
          v_next_user.user_id, p_course_id
        );
        IF v_pass_id IS NOT NULL THEN
          PERFORM yogaflow_private.redeem_pass(
            v_next_user.id, v_pass_id, NULL
          );
          v_remaining := yogaflow_private.pass_remaining(v_pass_id);
          v_redeem_ok := true;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_redeem_ok := false;
        v_remaining := NULL;
      END;

      UPDATE public.registrations
      SET coverage_intent = NULL
      WHERE id = v_next_user.id;

      IF v_redeem_ok THEN
        v_notification_body := pg_catalog.format(
          'Du hast einen Platz im Kurs „%s“ am %s um %s bekommen.',
          v_course_title,
          pg_catalog.to_char(v_course_date, 'DD.MM.YYYY'),
          pg_catalog.to_char(v_course_time, 'HH24:MI')
        );
        v_notification_body := v_notification_body
          || pg_catalog.format(
            ' Mit deiner Karte bezahlt (noch %s).',
            v_remaining
          );

        INSERT INTO public.user_notifications (
          tenant_id,
          user_id,
          type,
          body,
          course_id,
          action_path,
          metadata
        ) VALUES (
          v_tenant_id,
          v_next_user.user_id,
          'waitlist_promoted',
          v_notification_body,
          p_course_id,
          '/my-courses',
          pg_catalog.jsonb_build_object('promoted_from_waitlist', true)
        );
      ELSE
        PERFORM yogaflow_private.promote_to_pending_payment(
          v_next_user.id, v_deadline
        );
      END IF;

    ELSE
      PERFORM yogaflow_private.promote_to_pending_payment(
        v_next_user.id, v_deadline
      );
    END IF;

    v_current_count := v_current_count + 1;
  END LOOP;

  PERFORM public.compact_waitlist_positions(p_course_id);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Selbstprüfung
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_def text;
BEGIN
  IF to_regprocedure('public.booking_payment_options(uuid, integer)') IS NULL THEN
    RAISE EXCEPTION 'ZW1: booking_payment_options(uuid, integer) fehlt';
  END IF;
  IF to_regprocedure('public.booking_payment_options(integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'ZW1: alte booking_payment_options(integer) muss weg';
  END IF;
  IF to_regprocedure('public.register_for_course(uuid, boolean, text)') IS NULL THEN
    RAISE EXCEPTION 'ZW1: register_for_course(+method) fehlt';
  END IF;
  IF to_regprocedure('public.register_for_course(uuid, boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'ZW1: alte register_for_course(uuid, boolean) muss weg';
  END IF;

  IF has_function_privilege('anon', 'public.booking_payment_options(uuid, integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.register_for_course(uuid, boolean, text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'ZW1: anon darf booking/register nicht';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.booking_payment_options(uuid, integer)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.register_for_course(uuid, boolean, text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'ZW1: authenticated braucht EXECUTE';
  END IF;

  v_def := pg_catalog.pg_get_functiondef(
    'public.booking_payment_options(uuid, integer)'::regprocedure
  );
  IF v_def NOT LIKE '%online_method_block_reason%'
     OR v_def NOT LIKE '%default%'
     OR v_def NOT LIKE '%methods%'
  THEN
    RAISE EXCEPTION 'ZW1: booking_payment_options ohne Methodenliste';
  END IF;

  v_def := pg_catalog.pg_get_functiondef(
    'public.set_allow_onsite_payment(boolean)'::regprocedure
  );
  IF v_def NOT LIKE '%LAST_METHOD%' THEN
    RAISE EXCEPTION 'ZW1: set_allow_onsite ohne LAST_METHOD';
  END IF;

  v_def := pg_catalog.pg_get_functiondef(
    'public.set_online_payments_enabled(boolean)'::regprocedure
  );
  IF v_def NOT LIKE '%LAST_METHOD%' THEN
    RAISE EXCEPTION 'ZW1: set_online ohne LAST_METHOD';
  END IF;

  v_def := pg_catalog.pg_get_constraintdef(
    (SELECT oid FROM pg_constraint
      WHERE conname = 'registrations_coverage_intent_check')
  );
  IF v_def NOT LIKE '%online%' OR v_def NOT LIKE '%onsite%' THEN
    RAISE EXCEPTION 'ZW1: coverage_intent-Check ohne online/onsite';
  END IF;
END;
$$;
