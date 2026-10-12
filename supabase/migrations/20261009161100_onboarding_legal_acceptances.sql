-- RT-2 Fix — Zustimmungen (terms, privacy, avv) bei Studio-Registrierung.
-- allow: begin_tenant_onboarding,handle_new_user,record_onboarding_legal_acceptances,cancel_tenant_onboarding
--
-- Ursache: Onboarding speicherte nur sessionStorage auf der Apex-Origin;
-- Login auf Studio-Subdomain → Flag weg → legal_acceptances leer → Banner.
--
-- Fix: begin_tenant_onboarding verlangt p_legal_accepted und setzt
-- tenants.onboarding_legal_accepted_at. handle_new_user schreibt beim
-- Owner-Onboarding die drei Zeilen (accepted_at = Häkchen-Zeitpunkt).
-- Ohne Zustimmung oder bei Insert-Fehler → Sign-up bricht ab.
--
-- Nach Cron 20261009160000 (DEV hatte Cron schon; fachlich unabhängig).
--
-- Rückweg: DROP Spalte; begin(text,text,boolean) → begin(text,text);
-- handle_new_user aus 20260926160500 wiederherstellen.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS onboarding_legal_accepted_at timestamptz;

COMMENT ON COLUMN public.tenants.onboarding_legal_accepted_at IS
  'RT-2: Zeitpunkt der Onboarding-Häkchen (AGB+Datenschutz+AVV); NULL = keine Bundle-Zustimmung.';

-- ---------------------------------------------------------------------------
-- Helfer: drei Nachweise aus legal_document_versions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.record_onboarding_legal_acceptances(
  p_tenant uuid,
  p_member uuid,
  p_accepted_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_doc text;
  v_ver text;
  v_hash text;
  v_n integer := 0;
BEGIN
  IF p_tenant IS NULL OR p_member IS NULL OR p_accepted_at IS NULL THEN
    RAISE EXCEPTION 'LEGAL_ACCEPTANCE_REQUIRED'
      USING ERRCODE = 'P0001',
            MESSAGE = 'LEGAL_ACCEPTANCE_REQUIRED';
  END IF;

  FOR v_doc, v_ver, v_hash IN
    SELECT v.document, v.version, v.content_hash
    FROM public.legal_document_versions v
    WHERE v.document IN ('terms', 'privacy', 'avv')
    ORDER BY v.document
  LOOP
    INSERT INTO public.legal_acceptances (
      tenant_id, user_id, document, version, content_hash, accepted_at
    ) VALUES (
      p_tenant, p_member, v_doc, v_ver, v_hash, p_accepted_at
    );
    v_n := v_n + 1;
  END LOOP;

  IF v_n <> 3 THEN
    RAISE EXCEPTION 'LEGAL_ACCEPTANCE_REQUIRED'
      USING ERRCODE = 'P0001',
            MESSAGE = 'LEGAL_DOCUMENTS_INCOMPLETE';
  END IF;
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.record_onboarding_legal_acceptances(uuid, uuid, timestamptz) IS
  'RT-2: Insert terms+privacy+avv bei Owner-Onboarding. Nur intern.';

REVOKE ALL ON FUNCTION yogaflow_private.record_onboarding_legal_acceptances(uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- begin_tenant_onboarding: Zustimmung Pflicht
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.begin_tenant_onboarding(text, text);

CREATE OR REPLACE FUNCTION public.begin_tenant_onboarding(
  p_name text,
  p_slug text,
  p_legal_accepted boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tenant_id uuid;
  v_slug text;
  v_name text;
BEGIN
  IF COALESCE(p_legal_accepted, false) IS NOT TRUE THEN
    RETURN json_build_object(
      'success', false,
      'error', 'LEGAL_REQUIRED',
      'message', 'Bitte akzeptiere AGB, Datenschutz und den AVV.'
    );
  END IF;

  v_name := pg_catalog.btrim(COALESCE(p_name, ''));
  v_slug := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_slug, '')));

  IF v_name = '' THEN
    RETURN json_build_object('success', false, 'error', 'invalid_name',
      'message', 'Studio-Name darf nicht leer sein.');
  END IF;

  IF v_slug !~ '^[a-z0-9]+$' THEN
    RETURN json_build_object('success', false, 'error', 'invalid_format',
      'message', 'Nur Kleinbuchstaben und Zahlen erlaubt.');
  END IF;

  IF pg_catalog.length(v_slug) < 3 OR pg_catalog.length(v_slug) > 30 THEN
    RETURN json_build_object('success', false, 'error', 'invalid_length',
      'message', 'Der Name muss zwischen 3 und 30 Zeichen lang sein.');
  END IF;

  IF EXISTS (SELECT 1 FROM public.reserved_slugs WHERE slug = v_slug) THEN
    RETURN json_build_object('success', false, 'error', 'reserved_slug',
      'message', 'Dieser Name ist nicht erlaubt.');
  END IF;

  IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_slug) THEN
    RETURN json_build_object('success', false, 'error', 'slug_taken',
      'message', 'Dieser Name ist bereits vergeben. Bitte wähle einen anderen.');
  END IF;

  INSERT INTO public.tenants (name, slug, onboarding_legal_accepted_at)
  VALUES (v_name, v_slug, pg_catalog.now())
  RETURNING id INTO v_tenant_id;

  RETURN json_build_object('success', true, 'tenant_id', v_tenant_id);

EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'error', 'slug_taken',
      'message', 'Dieser Name ist bereits vergeben. Bitte wähle einen anderen.');
  WHEN others THEN
    RAISE LOG 'begin_tenant_onboarding error: %', SQLERRM;
    RETURN json_build_object('success', false, 'error', 'server_error',
      'message', 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.');
END;
$function$;

COMMENT ON FUNCTION public.begin_tenant_onboarding(text, text, boolean) IS
  'Legt Tenant an; p_legal_accepted muss true sein (RT-2). Nur service_role (onboarding-public).';

REVOKE ALL ON FUNCTION public.begin_tenant_onboarding(text, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_tenant_onboarding(text, text, boolean)
  TO service_role;

-- ---------------------------------------------------------------------------
-- handle_new_user: Nachweise beim Owner-Onboarding
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role text;
  v_tenant_id uuid;
  v_trusted text;
  v_wanted text;
  v_fresh_tenant uuid;
  v_member_id uuid;
  v_downgraded boolean := false;
  v_legal_at timestamptz;
  v_onboarding_owner boolean := false;
BEGIN
  v_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::uuid;
  v_trusted := NEW.raw_app_meta_data->>'role';
  v_wanted := NEW.raw_user_meta_data->>'role';

  IF v_trusted IN ('owner', 'admin', 'teacher', 'user') THEN
    v_role := v_trusted;
  ELSIF v_wanted = 'owner' THEN
    SELECT t.id
      INTO v_fresh_tenant
    FROM public.tenants t
    WHERE t.id = v_tenant_id
      AND t.created_at > pg_catalog.now() - interval '10 minutes'
    FOR UPDATE;

    IF v_fresh_tenant IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM public.users u
         WHERE u.tenant_id = v_tenant_id
           AND u.role = 'owner'
       )
    THEN
      v_role := 'owner';
      v_onboarding_owner := true;
    ELSE
      v_role := 'user';
      v_downgraded := true;
    END IF;
  ELSIF v_wanted IN ('admin', 'teacher') THEN
    v_role := 'user';
    v_downgraded := true;
  ELSE
    v_role := 'user';
  END IF;

  IF v_downgraded THEN
    RAISE LOG 'security.role_downgraded_on_signup auth_user_id=% wanted=% tenant_id=%',
      NEW.id, v_wanted, v_tenant_id;
  END IF;

  IF v_onboarding_owner THEN
    SELECT t.onboarding_legal_accepted_at
      INTO v_legal_at
    FROM public.tenants t
    WHERE t.id = v_tenant_id;

    IF v_legal_at IS NULL THEN
      RAISE EXCEPTION 'LEGAL_ACCEPTANCE_REQUIRED'
        USING ERRCODE = 'P0001',
              MESSAGE = 'LEGAL_ACCEPTANCE_REQUIRED';
    END IF;
  END IF;

  INSERT INTO public.users (
    email, tenant_id, role,
    first_name, last_name,
    street, house_number, postal_code, city, phone,
    auth_user_id
  )
  VALUES (
    NEW.email,
    v_tenant_id,
    v_role,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'street', NULL),
    COALESCE(NEW.raw_user_meta_data->>'house_number', NULL),
    COALESCE(NEW.raw_user_meta_data->>'postal_code', NULL),
    COALESCE(NEW.raw_user_meta_data->>'city', NULL),
    COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
    NEW.id
  )
  RETURNING id INTO v_member_id;

  IF v_onboarding_owner THEN
    PERFORM yogaflow_private.record_onboarding_legal_acceptances(
      v_tenant_id, v_member_id, v_legal_at
    );
  END IF;

  IF v_downgraded THEN
    PERFORM yogaflow_private.insert_audit(
      v_tenant_id,
      NULL,
      'security.role_downgraded_on_signup',
      'users',
      v_member_id,
      ARRAY['role']::text[],
      NULL
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Selbstprüfung
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_src text;
  v_begin oid;
  v_old oid;
BEGIN
  SELECT p.oid INTO v_begin
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'begin_tenant_onboarding'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid)
      LIKE '%text%text%boolean%';

  IF v_begin IS NULL THEN
    RAISE EXCEPTION 'RT-2 onboarding: begin_tenant_onboarding(text,text,boolean) fehlt';
  END IF;

  SELECT p.oid INTO v_old
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'begin_tenant_onboarding'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid) NOT LIKE '%boolean%';

  IF v_old IS NOT NULL THEN
    RAISE EXCEPTION 'RT-2 onboarding: alte Signatur begin(text,text) noch vorhanden';
  END IF;

  IF has_function_privilege('anon', v_begin, 'EXECUTE')
     OR has_function_privilege('authenticated', v_begin, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'RT-2 onboarding: begin noch EXECUTE für anon/authenticated';
  END IF;

  SELECT p.prosrc INTO v_src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'handle_new_user'
    AND pg_get_function_identity_arguments(p.oid) = '';

  IF v_src IS NULL OR v_src NOT LIKE '%record_onboarding_legal_acceptances%' THEN
    RAISE EXCEPTION 'RT-2 onboarding: handle_new_user ohne legal_acceptances';
  END IF;

  IF v_src NOT LIKE '%raw_app_meta_data%' THEN
    RAISE EXCEPTION 'RT-2 onboarding: handle_new_user ohne app_meta Rolle';
  END IF;
END;
$$;
