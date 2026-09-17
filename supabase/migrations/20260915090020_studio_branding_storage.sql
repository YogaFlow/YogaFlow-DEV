-- Zweck: Logo-Speicher für Tenant-Branding (Release 2026-09). Öffentlicher Bucket studio-branding
-- (1 MB, PNG/JPEG/WebP), Schreiben/Löschen nur Owner im eigenen Studio-Ordner, RPC set_studio_logo.
--
-- Rückweg:
--   DROP FUNCTION IF EXISTS public.set_studio_logo(text);
--   DROP POLICY IF EXISTS studio_branding_insert_owner ON storage.objects;
--   DROP POLICY IF EXISTS studio_branding_select_owner ON storage.objects;
--   DROP POLICY IF EXISTS studio_branding_delete_owner ON storage.objects;
--   UPDATE public.tenants SET logo_path = NULL WHERE logo_path IS NOT NULL;
--   Dateien im Bucket über Storage-API/Dashboard löschen, danach:
--   DELETE FROM storage.buckets WHERE id = 'studio-branding';

-- 1. Bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('studio-branding', 'studio-branding', true, 1048576, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- 2. Policies: Owner nur im eigenen Studio-Ordner. Kein UPDATE (jeder Upload ist neu).
DROP POLICY IF EXISTS studio_branding_insert_owner ON storage.objects;
CREATE POLICY studio_branding_insert_owner
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'studio-branding'
    AND (storage.foldername(name))[1] = yogaflow_private.get_my_tenant_id()::text
    AND yogaflow_private.is_owner()
    AND name ~ '^[0-9a-f-]{36}/logo-[0-9]{10,16}\.(png|jpg|webp)$'
  );

DROP POLICY IF EXISTS studio_branding_select_owner ON storage.objects;
CREATE POLICY studio_branding_select_owner
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'studio-branding'
    AND (storage.foldername(name))[1] = yogaflow_private.get_my_tenant_id()::text
    AND yogaflow_private.is_owner()
  );

DROP POLICY IF EXISTS studio_branding_delete_owner ON storage.objects;
CREATE POLICY studio_branding_delete_owner
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'studio-branding'
    AND (storage.foldername(name))[1] = yogaflow_private.get_my_tenant_id()::text
    AND yogaflow_private.is_owner()
  );

-- 3. RPC: Logo-Pfad setzen oder entfernen (Schalter unverändert).
CREATE OR REPLACE FUNCTION public.set_studio_logo(p_logo_path text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_member uuid;
  v_tenant_id uuid;
  v_path text;
  v_previous text;
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
      'message', 'Nur die Inhaberin oder der Inhaber des Studios kann das Logo ändern.'
    );
  END IF;

  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Studio nicht gefunden.'
    );
  END IF;

  v_path := NULLIF(btrim(p_logo_path), '');

  IF v_path IS NOT NULL THEN
    IF v_path !~ ('^' || v_tenant_id::text || '/logo-[0-9]{10,16}\.(png|jpg|webp)$') THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Ungültiger Logo-Pfad.'
      );
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM storage.objects
      WHERE bucket_id = 'studio-branding'
        AND name = v_path
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Das Logo wurde nicht gefunden. Bitte lade es erneut hoch.'
      );
    END IF;
  END IF;

  SELECT logo_path INTO v_previous
  FROM public.tenants
  WHERE id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Studio nicht gefunden.'
    );
  END IF;

  UPDATE public.tenants
  SET logo_path = v_path
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
    'previous_logo_path', v_previous,
    'tenant', jsonb_build_object(
      'id', v_row.id,
      'logo_path', v_row.logo_path,
      'logo_in_sidebar', v_row.logo_in_sidebar,
      'logo_on_auth', v_row.logo_on_auth,
      'sidebar_show_name', v_row.sidebar_show_name,
      'updated_at', v_row.updated_at
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_studio_logo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_studio_logo(text) TO authenticated;

-- 4. Selbstprüfung
DO $$
DECLARE
  v_public boolean;
  v_limit bigint;
  v_mimes text[];
  v_expected text[] := ARRAY['image/png', 'image/jpeg', 'image/webp'];
  v_prosecdef boolean;
  v_proconfig text[];
  v_count integer;
BEGIN
  -- a) Bucket
  SELECT b.public, b.file_size_limit, b.allowed_mime_types
    INTO v_public, v_limit, v_mimes
  FROM storage.buckets b
  WHERE b.id = 'studio-branding';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bucket studio-branding fehlt';
  END IF;
  IF v_public IS NOT TRUE THEN
    RAISE EXCEPTION 'Bucket studio-branding ist nicht public';
  END IF;
  IF v_limit IS DISTINCT FROM 1048576 THEN
    RAISE EXCEPTION 'Bucket studio-branding file_size_limit=%, erwartet 1048576', v_limit;
  END IF;
  IF v_mimes IS NULL
     OR NOT (v_mimes @> v_expected AND v_expected @> v_mimes)
  THEN
    RAISE EXCEPTION 'Bucket studio-branding allowed_mime_types=%, erwartet png/jpeg/webp', v_mimes;
  END IF;

  -- b) Policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'studio_branding_insert_owner'
      AND roles = ARRAY['authenticated']::name[]
      AND cmd = 'INSERT'
  ) THEN
    RAISE EXCEPTION 'Policy studio_branding_insert_owner fehlt oder weicht ab';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'studio_branding_select_owner'
      AND roles = ARRAY['authenticated']::name[]
      AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'Policy studio_branding_select_owner fehlt oder weicht ab';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'studio_branding_delete_owner'
      AND roles = ARRAY['authenticated']::name[]
      AND cmd = 'DELETE'
  ) THEN
    RAISE EXCEPTION 'Policy studio_branding_delete_owner fehlt oder weicht ab';
  END IF;

  -- c) Kein UPDATE auf diesem Bucket
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND cmd = 'UPDATE'
      AND (
        coalesce(qual, '') LIKE '%studio-branding%'
        OR coalesce(with_check, '') LIKE '%studio-branding%'
      )
  ) THEN
    RAISE EXCEPTION 'Unerwartete UPDATE-Policy auf storage.objects für studio-branding';
  END IF;

  -- d) RPC SECURITY DEFINER und search_path
  SELECT p.prosecdef, p.proconfig
    INTO v_prosecdef, v_proconfig
  FROM pg_proc p
  WHERE p.oid = 'public.set_studio_logo(text)'::regprocedure;

  IF v_prosecdef IS NOT TRUE THEN
    RAISE EXCEPTION 'set_studio_logo ist nicht SECURITY DEFINER';
  END IF;
  IF v_proconfig IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM unnest(v_proconfig) AS cfg
       WHERE cfg LIKE 'search_path=public%'
     )
  THEN
    RAISE EXCEPTION 'set_studio_logo proconfig ohne search_path=public: %', v_proconfig;
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_proconfig) AS cfg WHERE cfg LIKE '%pg_temp%'
  ) THEN
    RAISE EXCEPTION 'set_studio_logo proconfig enthält pg_temp: %', v_proconfig;
  END IF;

  -- e) Rechte
  IF has_function_privilege('anon', 'public.set_studio_logo(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon hat EXECUTE auf set_studio_logo';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.set_studio_logo(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated fehlt EXECUTE auf set_studio_logo';
  END IF;

  -- f) Bestand ohne Logo-Pfad
  SELECT count(*) INTO v_count
  FROM public.tenants
  WHERE logo_path IS NOT NULL;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Bestand hat bereits logo_path: % Zeilen', v_count;
  END IF;
END;
$$;
