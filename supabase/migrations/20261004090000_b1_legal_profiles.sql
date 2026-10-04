-- B1 Teil A — Studio-Angaben (K1), Sperre (K2), Preisgrenze 250 € (K3).
-- allow: legal_profile_complete,online_amount_allowed,online_amount_allowed_price,upsert_studio_legal_profile,get_studio_legal_profile,get_studio_provider_info,online_payment_required,booking_payment_options,set_online_payments_enabled,get_payment_setup_status,register_for_course,promote_from_waitlist,prepare_online_payment,delete_tenant_complete
--
-- Keine Default-Angaben für bestehende Studios.
--
-- Rückweg:
--   DROP FUNCTION IF EXISTS public.booking_payment_options(integer);
--   -- booking_payment_options() aus 20261001120000 wiederherstellen
--   -- online_payment_required / set_online_payments_enabled / get_payment_setup_status
--   --   / register_for_course / promote_from_waitlist / prepare_online_payment
--   --   / delete_tenant_complete aus dem jeweiligen Vorgänger wiederherstellen
--   DROP FUNCTION IF EXISTS public.get_studio_provider_info();
--   DROP FUNCTION IF EXISTS public.get_studio_legal_profile();
--   DROP FUNCTION IF EXISTS public.upsert_studio_legal_profile(text,text,text,text,text,text,text,text,text);
--   DROP FUNCTION IF EXISTS yogaflow_private.online_amount_allowed_price(numeric);
--   DROP FUNCTION IF EXISTS yogaflow_private.online_amount_allowed(integer);
--   DROP FUNCTION IF EXISTS yogaflow_private.legal_profile_complete(uuid);
--   DROP TABLE IF EXISTS public.tenant_legal_profiles;

-- ---------------------------------------------------------------------------
-- 1. Tabelle
-- ---------------------------------------------------------------------------

CREATE TABLE public.tenant_legal_profiles (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants (id) ON DELETE RESTRICT,
  legal_name text NOT NULL,
  street text NOT NULL,
  house_number text NOT NULL,
  postal_code text NOT NULL,
  city text NOT NULL,
  country text NOT NULL DEFAULT 'DE',
  contact_email text NOT NULL,
  phone text,
  tax_id text,
  updated_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT tenant_legal_profiles_legal_name_len CHECK (char_length(legal_name) BETWEEN 1 AND 120),
  CONSTRAINT tenant_legal_profiles_street_len CHECK (char_length(street) BETWEEN 1 AND 120),
  CONSTRAINT tenant_legal_profiles_house_number_len CHECK (char_length(house_number) BETWEEN 1 AND 16),
  CONSTRAINT tenant_legal_profiles_postal_code_len CHECK (char_length(postal_code) BETWEEN 1 AND 10),
  CONSTRAINT tenant_legal_profiles_city_len CHECK (char_length(city) BETWEEN 1 AND 80),
  CONSTRAINT tenant_legal_profiles_country_len CHECK (char_length(country) = 2),
  CONSTRAINT tenant_legal_profiles_email_len CHECK (char_length(contact_email) BETWEEN 3 AND 120),
  CONSTRAINT tenant_legal_profiles_phone_len CHECK (phone IS NULL OR char_length(phone) BETWEEN 1 AND 40),
  CONSTRAINT tenant_legal_profiles_tax_id_len CHECK (tax_id IS NULL OR char_length(tax_id) BETWEEN 1 AND 40)
);

COMMENT ON TABLE public.tenant_legal_profiles IS
  'B1 K1: Anbieterangaben je Studio. Quelle für Bestätigung, Beleg, Impressum.';

ALTER TABLE public.tenant_legal_profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tenant_legal_profiles FROM PUBLIC, anon, authenticated;

-- Lesen nur über RPCs (keine breite Policy).

-- ---------------------------------------------------------------------------
-- 2. Helfer
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.legal_profile_complete(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_legal_profiles p
    WHERE p.tenant_id = p_tenant
      AND pg_catalog.btrim(p.legal_name) <> ''
      AND pg_catalog.btrim(p.street) <> ''
      AND pg_catalog.btrim(p.house_number) <> ''
      AND pg_catalog.btrim(p.postal_code) <> ''
      AND pg_catalog.btrim(p.city) <> ''
      AND pg_catalog.btrim(p.country) <> ''
      AND pg_catalog.btrim(p.contact_email) <> ''
  );
$function$;

COMMENT ON FUNCTION yogaflow_private.legal_profile_complete(uuid) IS
  'B1 K2: Pflichtfelder der Anbieterangaben vollständig.';

REVOKE ALL ON FUNCTION yogaflow_private.legal_profile_complete(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION yogaflow_private.online_amount_allowed(p_amount_cents integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p_amount_cents IS NULL OR p_amount_cents <= 25000;
$function$;

COMMENT ON FUNCTION yogaflow_private.online_amount_allowed(integer) IS
  'B1 K3: Online-Zahlung höchstens 250,00 € brutto (Kleinbetragsrechnung).';

REVOKE ALL ON FUNCTION yogaflow_private.online_amount_allowed(integer)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION yogaflow_private.online_amount_allowed_price(p_price numeric)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT yogaflow_private.online_amount_allowed(
    pg_catalog.round(COALESCE(p_price, 0) * 100)::integer
  );
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.online_amount_allowed_price(numeric)
  FROM PUBLIC, anon, authenticated;

-- K2: Online-Pflicht nur mit vollständigen Anbieterangaben.
CREATE OR REPLACE FUNCTION yogaflow_private.online_payment_required(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT yogaflow_private.online_payments_effective(p_tenant)
     AND yogaflow_private.legal_profile_complete(p_tenant)
     AND NOT COALESCE(
       (SELECT s.allow_onsite_payment
          FROM public.tenant_payment_settings s
         WHERE s.tenant_id = p_tenant),
       true
     );
$function$;

COMMENT ON FUNCTION yogaflow_private.online_payment_required(uuid) IS
  'Online wirksam an, Vor-Ort aus, Anbieterangaben vollständig (P9/P10, B1 K2).';

-- ---------------------------------------------------------------------------
-- 3. RPCs Anbieterangaben
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_studio_legal_profile(
  p_legal_name text,
  p_street text,
  p_house_number text,
  p_postal_code text,
  p_city text,
  p_country text DEFAULT 'DE',
  p_contact_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_tax_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid := yogaflow_private.get_my_member_id();
  v_tenant_id uuid := yogaflow_private.get_my_tenant_id();
  v_name text := pg_catalog.btrim(COALESCE(p_legal_name, ''));
  v_street text := pg_catalog.btrim(COALESCE(p_street, ''));
  v_house text := pg_catalog.btrim(COALESCE(p_house_number, ''));
  v_plz text := pg_catalog.btrim(COALESCE(p_postal_code, ''));
  v_city text := pg_catalog.btrim(COALESCE(p_city, ''));
  v_country text := pg_catalog.upper(pg_catalog.btrim(COALESCE(p_country, 'DE')));
  v_email text := pg_catalog.btrim(COALESCE(p_contact_email, ''));
  v_phone text := NULLIF(pg_catalog.btrim(COALESCE(p_phone, '')), '');
  v_tax text := NULLIF(pg_catalog.btrim(COALESCE(p_tax_id, '')), '');
BEGIN
  IF v_member_id IS NULL OR v_tenant_id IS NULL OR NOT yogaflow_private.is_owner() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF v_name = '' OR char_length(v_name) > 120 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VALIDATION', 'field', 'legal_name');
  END IF;
  IF v_street = '' OR char_length(v_street) > 120 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VALIDATION', 'field', 'street');
  END IF;
  IF v_house = '' OR char_length(v_house) > 16 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VALIDATION', 'field', 'house_number');
  END IF;
  IF v_city = '' OR char_length(v_city) > 80 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VALIDATION', 'field', 'city');
  END IF;
  IF v_country !~ '^[A-Z]{2}$' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VALIDATION', 'field', 'country');
  END IF;
  IF v_country = 'DE' AND v_plz !~ '^[0-9]{5}$' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VALIDATION', 'field', 'postal_code');
  END IF;
  IF v_country <> 'DE' AND (v_plz = '' OR char_length(v_plz) > 10) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VALIDATION', 'field', 'postal_code');
  END IF;
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     OR char_length(v_email) > 120 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VALIDATION', 'field', 'contact_email');
  END IF;
  IF v_phone IS NOT NULL AND char_length(v_phone) > 40 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VALIDATION', 'field', 'phone');
  END IF;
  IF v_tax IS NOT NULL AND char_length(v_tax) > 40 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VALIDATION', 'field', 'tax_id');
  END IF;

  INSERT INTO public.tenant_legal_profiles (
    tenant_id, legal_name, street, house_number, postal_code, city, country,
    contact_email, phone, tax_id, updated_by, updated_at
  ) VALUES (
    v_tenant_id, v_name, v_street, v_house, v_plz, v_city, v_country,
    v_email, v_phone, v_tax, v_member_id, pg_catalog.now()
  )
  ON CONFLICT (tenant_id) DO UPDATE
    SET legal_name = EXCLUDED.legal_name,
        street = EXCLUDED.street,
        house_number = EXCLUDED.house_number,
        postal_code = EXCLUDED.postal_code,
        city = EXCLUDED.city,
        country = EXCLUDED.country,
        contact_email = EXCLUDED.contact_email,
        phone = EXCLUDED.phone,
        tax_id = EXCLUDED.tax_id,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at;

  RETURN pg_catalog.jsonb_build_object('success', true);
END;
$function$;

COMMENT ON FUNCTION public.upsert_studio_legal_profile(text, text, text, text, text, text, text, text, text) IS
  'B1 K1: Anbieterangaben schreiben. Nur Owner, eigenes Studio.';

REVOKE ALL ON FUNCTION public.upsert_studio_legal_profile(text, text, text, text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_studio_legal_profile(text, text, text, text, text, text, text, text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_studio_legal_profile()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid := yogaflow_private.get_my_member_id();
  v_tenant_id uuid := yogaflow_private.get_my_tenant_id();
  v_row public.tenant_legal_profiles%ROWTYPE;
BEGIN
  IF v_member_id IS NULL OR v_tenant_id IS NULL OR NOT yogaflow_private.is_owner() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_row
  FROM public.tenant_legal_profiles
  WHERE tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', true, 'present', false);
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'present', true,
    'legal_name', v_row.legal_name,
    'street', v_row.street,
    'house_number', v_row.house_number,
    'postal_code', v_row.postal_code,
    'city', v_row.city,
    'country', v_row.country,
    'contact_email', v_row.contact_email,
    'phone', v_row.phone,
    'tax_id', v_row.tax_id,
    'updated_at', v_row.updated_at
  );
END;
$function$;

COMMENT ON FUNCTION public.get_studio_legal_profile() IS
  'B1: Volle Anbieterangaben für das Formular. Nur Owner.';

REVOKE ALL ON FUNCTION public.get_studio_legal_profile()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_studio_legal_profile()
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_studio_provider_info()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid := yogaflow_private.get_my_member_id();
  v_tenant_id uuid := yogaflow_private.get_my_tenant_id();
  v_row public.tenant_legal_profiles%ROWTYPE;
BEGIN
  IF v_member_id IS NULL OR v_tenant_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_row
  FROM public.tenant_legal_profiles
  WHERE tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', true, 'present', false);
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'present', true,
    'legal_name', v_row.legal_name,
    'street', v_row.street,
    'house_number', v_row.house_number,
    'postal_code', v_row.postal_code,
    'city', v_row.city,
    'country', v_row.country,
    'contact_email', v_row.contact_email,
    'phone', v_row.phone
  );
END;
$function$;

COMMENT ON FUNCTION public.get_studio_provider_info() IS
  'B1 K1: Anbieter für Kaufprozess. Mitglieder des Studios, ohne Steuernummer.';

REVOKE ALL ON FUNCTION public.get_studio_provider_info()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_studio_provider_info()
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. booking_payment_options + reason (K2/K3)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.booking_payment_options();

CREATE OR REPLACE FUNCTION public.booking_payment_options(p_amount_cents integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid := yogaflow_private.get_my_member_id();
  v_tenant_id uuid := yogaflow_private.get_my_tenant_id();
  v_reason text := NULL;
  v_required boolean;
BEGIN
  IF v_member_id IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT yogaflow_private.legal_profile_complete(v_tenant_id) THEN
    v_reason := 'LEGAL_PROFILE_MISSING';
  ELSIF NOT yogaflow_private.online_amount_allowed(p_amount_cents) THEN
    v_reason := 'AMOUNT_ABOVE_RECEIPT_LIMIT';
  END IF;

  v_required := yogaflow_private.online_payment_required(v_tenant_id)
    AND yogaflow_private.online_amount_allowed(p_amount_cents);

  RETURN pg_catalog.jsonb_build_object(
    'online_required', v_required,
    'reason', v_reason
  );
END;
$function$;

COMMENT ON FUNCTION public.booking_payment_options(integer) IS
  'B1: Ob Online-Pflicht gilt. reason LEGAL_PROFILE_MISSING | AMOUNT_ABOVE_RECEIPT_LIMIT.';

REVOKE ALL ON FUNCTION public.booking_payment_options(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.booking_payment_options(integer)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Einschalten nur mit Anbieterangaben
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
  'Online-Zahlung an/aus. Nur Owner. Einschalten: PLATFORM → PROVIDER → TAX → LEGAL_PROFILE.';

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
    'online_payments_enabled', v_online,
    'allow_onsite_payment', v_onsite,
    'requirements_pending', COALESCE(v_acc.requirements_pending, false),
    'requirements_due_at', CASE WHEN v_has THEN v_acc.requirements_due_at ELSE NULL END,
    'disconnected', COALESCE(v_acc.onboarding_status = 'disconnected', false)
  );
END;
$function$;

COMMENT ON FUNCTION public.get_payment_setup_status() IS
  'Stand der Online-Zahlung inkl. legal_profile_present (B1).';

-- ---------------------------------------------------------------------------
-- 6. register_for_course / promote: Preisgrenze (nur diese Bedingung neu)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.register_for_course(p_course_id uuid, p_use_pass boolean DEFAULT false)
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
  -- W12: kostenlos → Wunsch ignorieren
  v_want_pass := COALESCE(p_use_pass, false) AND NOT v_free;

  v_current_count := yogaflow_private.course_occupied_seats(p_course_id);

  IF v_current_count >= v_max_participants THEN
    SELECT COUNT(*)::integer + 1 INTO v_next_position
    FROM public.registrations
    WHERE course_id = p_course_id
      AND is_waitlist = true
      AND status = 'waitlist'
      AND cancellation_timestamp IS NULL;

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
      CASE WHEN v_want_pass THEN 'pass' ELSE NULL END
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

  -- C8: Mit Karte wie bisher (Fehler bei fehlender Karte unverändert).
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

  -- C2: Online-Pflicht ohne Karte → Reservierung checkout, 15 Min.
  -- B1 K3: über 250,00 € kein Online-Checkout (vor Ort).
  IF NOT v_free
     AND NOT v_want_pass
     AND yogaflow_private.online_payment_required(v_tenant_id)
     AND yogaflow_private.online_amount_allowed_price(v_course_price)
  THEN
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
  v_online_req boolean;
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

    -- S1/S3: Online-Pflicht nur bei kostenpflichtigem Kurs.
    -- B1 K3: über 250,00 € vor Ort.
    v_online_req := yogaflow_private.online_payment_required(v_tenant_id)
      AND COALESCE(v_course_price, 0) > 0
      AND yogaflow_private.online_amount_allowed_price(v_course_price);

    IF v_online_req THEN
      v_deadline := yogaflow_private.promotion_hold_deadline(p_course_id);
      -- S3: Frist nicht in der Zukunft → niemand rückt nach.
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

    IF NOT v_online_req THEN
      -- S1 Fall 1: wie heute registered (+ Karte bei Zustimmung).
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
      -- S1 Fall 2: Online-Pflicht + Karte → registered+pass, sonst Fall 3.
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
        -- Einlösen gescheitert → pending_payment (S1 Fall 3 / K3).
        PERFORM yogaflow_private.promote_to_pending_payment(
          v_next_user.id, v_deadline
        );
      END IF;

    ELSE
      -- S1 Fall 3: Online-Pflicht ohne Karte → pending_payment (K3).
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
-- 7. prepare: Sperre auch bei bestehendem Hold
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.prepare_online_payment(
  p_registration_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_reg public.registrations%ROWTYPE;
  v_attempt public.payment_attempts%ROWTYPE;
  v_account_ref text;
  v_livemode boolean;
  v_attempt_id uuid;
  v_price numeric;
BEGIN
  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = p_registration_id
  FOR UPDATE;

  IF NOT FOUND OR v_reg.user_id IS DISTINCT FROM p_user_id THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF v_reg.status IS DISTINCT FROM 'pending_payment'::public.registration_status THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_PENDING');
  END IF;

  IF v_reg.hold_expires_at IS NULL OR v_reg.hold_expires_at <= pg_catalog.now() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'HOLD_EXPIRED');
  END IF;

  IF NOT yogaflow_private.online_payments_effective(v_reg.tenant_id) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ONLINE_DISABLED');
  END IF;

  IF NOT yogaflow_private.legal_profile_complete(v_reg.tenant_id) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'LEGAL_PROFILE_MISSING');
  END IF;

  SELECT c.price INTO v_price
  FROM public.courses c
  WHERE c.id = v_reg.course_id;

  IF NOT yogaflow_private.online_amount_allowed_price(v_price) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'AMOUNT_ABOVE_RECEIPT_LIMIT');
  END IF;

  SELECT pa.provider_ref, pa.livemode
    INTO v_account_ref, v_livemode
  FROM public.provider_accounts pa
  WHERE pa.tenant_id = v_reg.tenant_id
    AND pa.provider = 'stripe'::public.payment_provider
    AND pa.disconnected_at IS NULL
  ORDER BY pa.created_at DESC
  LIMIT 1;

  IF v_account_ref IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ONLINE_DISABLED');
  END IF;

  SELECT * INTO v_attempt
  FROM public.payment_attempts a
  WHERE a.registration_id = p_registration_id
    AND a.status IN ('initiated', 'processing')
  ORDER BY a.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'attempt_id', v_attempt.id,
      'amount_cents', v_attempt.amount_cents,
      'currency', v_attempt.currency,
      'account_ref', v_account_ref,
      'provider_ref', v_attempt.provider_ref,
      'hold_expires_at', v_reg.hold_expires_at,
      'livemode', v_attempt.livemode
    );
  END IF;

  v_attempt_id := yogaflow_private.create_payment_attempt(
    p_registration_id,
    'stripe'::public.payment_provider,
    v_livemode
  );

  SELECT * INTO v_attempt
  FROM public.payment_attempts
  WHERE id = v_attempt_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'attempt_id', v_attempt.id,
    'amount_cents', v_attempt.amount_cents,
    'currency', v_attempt.currency,
    'account_ref', v_account_ref,
    'provider_ref', v_attempt.provider_ref,
    'hold_expires_at', v_reg.hold_expires_at,
    'livemode', v_attempt.livemode
  );
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.prepare_online_payment(uuid, uuid) IS
  'Checkout: Versuch anlegen/zurückgeben. B1: LEGAL_PROFILE_MISSING, AMOUNT_ABOVE_RECEIPT_LIMIT.';

-- ---------------------------------------------------------------------------
-- 8. delete_tenant_complete: legal_profiles
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
  'Löscht Mandanten inkl. tenant_legal_profiles (B1). Nur postgres/service_role.';

REVOKE ALL ON FUNCTION public.delete_tenant_complete(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tenant_complete(uuid)
  TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- 9. Selbstprüfung
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.tenant_legal_profiles') IS NULL THEN
    RAISE EXCEPTION 'B1: tenant_legal_profiles fehlt';
  END IF;
  IF has_table_privilege('authenticated', 'public.tenant_legal_profiles', 'SELECT')
     OR has_table_privilege('authenticated', 'public.tenant_legal_profiles', 'INSERT')
     OR has_table_privilege('anon', 'public.tenant_legal_profiles', 'SELECT') THEN
    RAISE EXCEPTION 'B1: tenant_legal_profiles zu weit freigegeben';
  END IF;
  IF has_function_privilege('anon', 'public.upsert_studio_legal_profile(text,text,text,text,text,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_studio_legal_profile()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_studio_provider_info()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.booking_payment_options(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'B1: anon hat EXECUTE';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.upsert_studio_legal_profile(text,text,text,text,text,text,text,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.booking_payment_options(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'B1: authenticated ohne EXECUTE';
  END IF;
  IF pg_catalog.pg_get_functiondef('public.booking_payment_options(integer)'::regprocedure)
       NOT LIKE '%LEGAL_PROFILE_MISSING%'
     OR pg_catalog.pg_get_functiondef('public.booking_payment_options(integer)'::regprocedure)
       NOT LIKE '%AMOUNT_ABOVE_RECEIPT_LIMIT%' THEN
    RAISE EXCEPTION 'B1: booking_payment_options ohne K2/K3';
  END IF;
  IF pg_catalog.pg_get_functiondef('public.set_online_payments_enabled(boolean)'::regprocedure)
       NOT LIKE '%LEGAL_PROFILE_MISSING%' THEN
    RAISE EXCEPTION 'B1: set_online_payments_enabled ohne LEGAL_PROFILE_MISSING';
  END IF;
  IF pg_catalog.pg_get_functiondef('yogaflow_private.online_payment_required(uuid)'::regprocedure)
       NOT LIKE '%legal_profile_complete%' THEN
    RAISE EXCEPTION 'B1: online_payment_required ohne legal_profile_complete';
  END IF;
  IF pg_catalog.pg_get_functiondef('public.register_for_course(uuid, boolean)'::regprocedure)
       NOT LIKE '%online_amount_allowed_price%' THEN
    RAISE EXCEPTION 'B1: register_for_course ohne Preisgrenze';
  END IF;
  IF pg_catalog.pg_get_functiondef('public.delete_tenant_complete(uuid)'::regprocedure)
       NOT LIKE '%tenant_legal_profiles%' THEN
    RAISE EXCEPTION 'B1: delete_tenant_complete ohne legal_profiles';
  END IF;
END;
$$;
