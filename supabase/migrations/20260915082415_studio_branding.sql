-- Zweck: Tenant-Branding (Release 2026-09). Spalten auf public.tenants für Markenfarbe,
-- Kurzbeschreibung, Logo-Pfad und Logo-Anzeigeorte; Kontrastregel als CHECK;
-- RPC update_studio_branding (nur Owner). Rein additiv, bestehende Studios bleiben Standard.
--
-- Rückweg (verliert nur die Branding-Werte):
--   DROP FUNCTION IF EXISTS public.update_studio_branding(text, text, text, boolean, boolean, boolean);
--   ALTER TABLE public.tenants
--     DROP CONSTRAINT IF EXISTS tenants_brand_color_allowed,
--     DROP CONSTRAINT IF EXISTS tenants_tagline_length,
--     DROP CONSTRAINT IF EXISTS tenants_logo_path_scope,
--     DROP COLUMN IF EXISTS brand_color, DROP COLUMN IF EXISTS tagline, DROP COLUMN IF EXISTS logo_path,
--     DROP COLUMN IF EXISTS logo_in_sidebar, DROP COLUMN IF EXISTS logo_on_auth,
--     DROP COLUMN IF EXISTS sidebar_show_name;
--   DROP FUNCTION IF EXISTS yogaflow_private.is_brand_color_allowed(text);

-- 1. Kontrastprüfung — dieselbe Rechnung wie src/design/brand.ts (isBrandColorAllowed).
CREATE OR REPLACE FUNCTION yogaflow_private.is_brand_color_allowed(p_hex text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_i integer;
  v_hex text;
  v_r integer;
  v_g integer;
  v_b integer;
  v_cr double precision;
  v_cg double precision;
  v_cb double precision;
  v_lr double precision;
  v_lg double precision;
  v_lb double precision;
  v_l double precision;
  v_l_bg double precision;
BEGIN
  IF p_hex IS NULL OR p_hex !~ '^#[0-9A-F]{6}$' THEN
    RETURN false;
  END IF;

  FOR v_i IN 1..2 LOOP
    v_hex := CASE v_i WHEN 1 THEN p_hex ELSE '#F5F3EF' END;
    v_r := ('x' || substr(v_hex, 2, 2))::bit(8)::int;
    v_g := ('x' || substr(v_hex, 4, 2))::bit(8)::int;
    v_b := ('x' || substr(v_hex, 6, 2))::bit(8)::int;
    v_cr := v_r::double precision / 255.0;
    v_cg := v_g::double precision / 255.0;
    v_cb := v_b::double precision / 255.0;
    v_lr := CASE WHEN v_cr <= 0.03928 THEN v_cr / 12.92 ELSE power((v_cr + 0.055) / 1.055, 2.4) END;
    v_lg := CASE WHEN v_cg <= 0.03928 THEN v_cg / 12.92 ELSE power((v_cg + 0.055) / 1.055, 2.4) END;
    v_lb := CASE WHEN v_cb <= 0.03928 THEN v_cb / 12.92 ELSE power((v_cb + 0.055) / 1.055, 2.4) END;
    IF v_i = 1 THEN
      v_l := 0.2126 * v_lr + 0.7152 * v_lg + 0.0722 * v_lb;
    ELSE
      v_l_bg := 0.2126 * v_lr + 0.7152 * v_lg + 0.0722 * v_lb;
    END IF;
  END LOOP;

  RETURN
    ((GREATEST(v_l, 1.0) + 0.05) / (LEAST(v_l, 1.0) + 0.05)) >= 4.5
    AND ((GREATEST(v_l, v_l_bg) + 0.05) / (LEAST(v_l, v_l_bg) + 0.05)) >= 4.5;
END;
$function$;

-- Die Funktion steckt im CHECK auf tenants; jede schreibende Rolle braucht EXECUTE, sonst scheitern Inserts/Updates (auch mit brand_color NULL).
REVOKE ALL ON FUNCTION yogaflow_private.is_brand_color_allowed(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION yogaflow_private.is_brand_color_allowed(text) TO authenticated, service_role;

-- 2. Spalten und Constraints
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS brand_color text NULL,
  ADD COLUMN IF NOT EXISTS tagline text NULL,
  ADD COLUMN IF NOT EXISTS logo_path text NULL,
  ADD COLUMN IF NOT EXISTS logo_in_sidebar boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS logo_on_auth boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sidebar_show_name boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_brand_color_allowed'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_brand_color_allowed
      CHECK (brand_color IS NULL OR yogaflow_private.is_brand_color_allowed(brand_color));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_tagline_length'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_tagline_length
      CHECK (tagline IS NULL OR (btrim(tagline) <> '' AND char_length(tagline) <= 140));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_logo_path_scope'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_logo_path_scope
      CHECK (logo_path IS NULL OR logo_path LIKE (id::text || '/%'));
  END IF;
END;
$$;

-- 3. RPC: Owner ersetzt Name und Design vollständig (logo_path nicht).
CREATE OR REPLACE FUNCTION public.update_studio_branding(
  p_name text,
  p_brand_color text,
  p_tagline text,
  p_logo_in_sidebar boolean,
  p_logo_on_auth boolean,
  p_sidebar_show_name boolean
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_member uuid;
  v_tenant_id uuid;
  v_name text;
  v_brand_color text;
  v_tagline text;
  v_row public.tenants;
BEGIN
  v_member := yogaflow_private.get_my_member_id();
  IF v_member IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Bitte melde dich an.'
    );
  END IF;

  IF NOT yogaflow_private.is_owner() THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Nur die Inhaberin oder der Inhaber des Studios kann Name und Design ändern.'
    );
  END IF;

  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Studio nicht gefunden.'
    );
  END IF;

  v_name := btrim(p_name);
  IF v_name IS NULL OR char_length(v_name) < 2 OR char_length(v_name) > 60 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Der Studioname muss zwischen 2 und 60 Zeichen lang sein.'
    );
  END IF;

  v_brand_color := NULLIF(upper(btrim(p_brand_color)), '');
  IF v_brand_color IS NOT NULL AND v_brand_color !~ '^#[0-9A-F]{6}$' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Bitte gib die Farbe im Format #RRGGBB an.'
    );
  END IF;
  IF v_brand_color IS NOT NULL AND NOT yogaflow_private.is_brand_color_allowed(v_brand_color) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Diese Farbe ist zu hell. Wähle eine dunklere Farbe, damit Texte gut lesbar bleiben.'
    );
  END IF;

  v_tagline := NULLIF(btrim(p_tagline), '');
  IF v_tagline IS NOT NULL AND char_length(v_tagline) > 140 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Die Kurzbeschreibung darf höchstens 140 Zeichen lang sein.'
    );
  END IF;

  IF p_logo_in_sidebar IS NULL OR p_logo_on_auth IS NULL OR p_sidebar_show_name IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Bitte alle Anzeigeoptionen angeben.'
    );
  END IF;

  UPDATE public.tenants
  SET
    name = v_name,
    brand_color = v_brand_color,
    tagline = v_tagline,
    logo_in_sidebar = p_logo_in_sidebar,
    logo_on_auth = p_logo_on_auth,
    sidebar_show_name = p_sidebar_show_name
  WHERE id = v_tenant_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Studio nicht gefunden.'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Gespeichert.',
    'tenant', jsonb_build_object(
      'id', v_row.id,
      'name', v_row.name,
      'slug', v_row.slug,
      'brand_color', v_row.brand_color,
      'tagline', v_row.tagline,
      'logo_path', v_row.logo_path,
      'logo_in_sidebar', v_row.logo_in_sidebar,
      'logo_on_auth', v_row.logo_on_auth,
      'sidebar_show_name', v_row.sidebar_show_name,
      'updated_at', v_row.updated_at
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_studio_branding(text, text, text, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_studio_branding(text, text, text, boolean, boolean, boolean) TO authenticated;

-- 4. Selbstprüfung
DO $$
DECLARE
  v_hex text;
  v_true text[] := ARRAY[
    '#2F5A4E', '#5A6B2E', '#1F5F6B', '#2C4A7A', '#5B4B8A',
    '#6E3B5E', '#A23B62', '#6A4E3B', '#3D4852', '#000000'
  ];
  v_false text[] := ARRAY['#FFF59D', '#777777', '#767676', '#2f5a4e', '2F5A4E', '#12345'];
  v_prosecdef boolean;
  v_proconfig text[];
  v_count integer;
  v_data_type text;
  v_nullable text;
  v_default text;
  v_expect_name text;
  v_expect_type text;
  v_expect_null text;
  v_expect_default text;
  v_owner_onboarding text;
  v_owner_rpc text;
BEGIN
  -- a) Spalten
  FOREACH v_expect_name IN ARRAY ARRAY[
    'brand_color', 'tagline', 'logo_path',
    'logo_in_sidebar', 'logo_on_auth', 'sidebar_show_name'
  ] LOOP
    v_expect_type := CASE
      WHEN v_expect_name IN ('brand_color', 'tagline', 'logo_path') THEN 'text'
      ELSE 'boolean'
    END;
    v_expect_null := CASE
      WHEN v_expect_name IN ('brand_color', 'tagline', 'logo_path') THEN 'YES'
      ELSE 'NO'
    END;
    v_expect_default := CASE v_expect_name
      WHEN 'logo_in_sidebar' THEN 'false'
      WHEN 'logo_on_auth' THEN 'false'
      WHEN 'sidebar_show_name' THEN 'true'
      ELSE NULL
    END;

    SELECT c.data_type, c.is_nullable, c.column_default
      INTO v_data_type, v_nullable, v_default
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'tenants'
      AND c.column_name = v_expect_name;

    IF v_data_type IS NULL THEN
      RAISE EXCEPTION 'Spalte public.tenants.% fehlt', v_expect_name;
    END IF;
    IF v_data_type IS DISTINCT FROM v_expect_type THEN
      RAISE EXCEPTION 'public.tenants.% hat Typ %, erwartet %', v_expect_name, v_data_type, v_expect_type;
    END IF;
    IF v_nullable IS DISTINCT FROM v_expect_null THEN
      RAISE EXCEPTION 'public.tenants.% is_nullable=%, erwartet %', v_expect_name, v_nullable, v_expect_null;
    END IF;
    IF v_expect_default IS NULL THEN
      IF v_default IS NOT NULL THEN
        RAISE EXCEPTION 'public.tenants.% hat Default %, erwartet NULL', v_expect_name, v_default;
      END IF;
    ELSIF regexp_replace(lower(coalesce(v_default, '')), '[^a-z]', '', 'g') IS DISTINCT FROM v_expect_default THEN
      RAISE EXCEPTION 'public.tenants.% Default %, erwartet %', v_expect_name, v_default, v_expect_default;
    END IF;
  END LOOP;

  -- b) Constraints
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_brand_color_allowed'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    RAISE EXCEPTION 'Constraint tenants_brand_color_allowed fehlt';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_tagline_length'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    RAISE EXCEPTION 'Constraint tenants_tagline_length fehlt';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_logo_path_scope'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    RAISE EXCEPTION 'Constraint tenants_logo_path_scope fehlt';
  END IF;

  -- c) Parität mit brand.ts
  FOREACH v_hex IN ARRAY v_true LOOP
    IF yogaflow_private.is_brand_color_allowed(v_hex) IS NOT TRUE THEN
      RAISE EXCEPTION 'is_brand_color_allowed(%) sollte true sein', v_hex;
    END IF;
  END LOOP;
  FOREACH v_hex IN ARRAY v_false LOOP
    IF yogaflow_private.is_brand_color_allowed(v_hex) IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'is_brand_color_allowed(%) sollte false sein', v_hex;
    END IF;
  END LOOP;
  IF yogaflow_private.is_brand_color_allowed(NULL) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'is_brand_color_allowed(NULL) sollte false sein';
  END IF;

  -- d) RPC SECURITY DEFINER und search_path
  SELECT p.prosecdef, p.proconfig
    INTO v_prosecdef, v_proconfig
  FROM pg_proc p
  WHERE p.oid = 'public.update_studio_branding(text, text, text, boolean, boolean, boolean)'::regprocedure;

  IF v_prosecdef IS NOT TRUE THEN
    RAISE EXCEPTION 'update_studio_branding ist nicht SECURITY DEFINER';
  END IF;
  IF v_proconfig IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM unnest(v_proconfig) AS cfg
       WHERE cfg LIKE 'search_path=public%'
     )
  THEN
    RAISE EXCEPTION 'update_studio_branding proconfig ohne search_path=public: %', v_proconfig;
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_proconfig) AS cfg WHERE cfg LIKE '%pg_temp%'
  ) THEN
    RAISE EXCEPTION 'update_studio_branding proconfig enthält pg_temp: %', v_proconfig;
  END IF;

  -- e) Rechte
  IF has_function_privilege(
    'anon',
    'public.update_studio_branding(text, text, text, boolean, boolean, boolean)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'anon hat EXECUTE auf update_studio_branding';
  END IF;
  IF NOT has_function_privilege(
    'authenticated',
    'public.update_studio_branding(text, text, text, boolean, boolean, boolean)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated fehlt EXECUTE auf update_studio_branding';
  END IF;
  IF has_function_privilege(
    'anon',
    'yogaflow_private.is_brand_color_allowed(text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'anon hat EXECUTE auf is_brand_color_allowed';
  END IF;
  IF NOT has_function_privilege(
    'authenticated',
    'yogaflow_private.is_brand_color_allowed(text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated fehlt EXECUTE auf is_brand_color_allowed';
  END IF;
  IF NOT has_function_privilege(
    'service_role',
    'yogaflow_private.is_brand_color_allowed(text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'service_role fehlt EXECUTE auf is_brand_color_allowed';
  END IF;

  SELECT pg_get_userbyid(p.proowner) INTO v_owner_onboarding
  FROM pg_proc p
  WHERE p.oid = 'public.begin_tenant_onboarding(text, text)'::regprocedure;
  SELECT pg_get_userbyid(p.proowner) INTO v_owner_rpc
  FROM pg_proc p
  WHERE p.oid = 'public.update_studio_branding(text, text, text, boolean, boolean, boolean)'::regprocedure;

  IF v_owner_onboarding IS NULL
     OR NOT has_function_privilege(
       v_owner_onboarding,
       'yogaflow_private.is_brand_color_allowed(text)',
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION 'Eigentümer von begin_tenant_onboarding (%) hat kein EXECUTE auf is_brand_color_allowed',
      v_owner_onboarding;
  END IF;
  IF v_owner_rpc IS NULL
     OR NOT has_function_privilege(
       v_owner_rpc,
       'yogaflow_private.is_brand_color_allowed(text)',
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION 'Eigentümer von update_studio_branding (%) hat kein EXECUTE auf is_brand_color_allowed',
      v_owner_rpc;
  END IF;

  -- f) Bestand bleibt Standard
  SELECT count(*) INTO v_count
  FROM public.tenants
  WHERE brand_color IS NOT NULL
     OR tagline IS NOT NULL
     OR logo_path IS NOT NULL
     OR logo_in_sidebar
     OR logo_on_auth
     OR NOT sidebar_show_name;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Bestand nicht Standard: % Zeilen weichen ab', v_count;
  END IF;
END;
$$;
