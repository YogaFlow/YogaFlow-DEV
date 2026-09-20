-- Zweck: gdpr_consent und gdpr_consent_date von public.users entfernen.
-- Inventur DEV 20.09.2026: einzige lebende Function, die die Spalten nennt,
-- ist public.ensure_public_user(p_user_id uuid). Views, Policies, Constraints,
-- Indizes, Rules: 0 Treffer. Trigger handle_new_user (auth.users) sowie
-- join_tenant / join_tenant_as_owner schreiben die Spalten nicht mehr
-- (historisch taten sie das in 20251105170605 / 20251105174741).
--
-- Reihenfolge ist Pflicht: CREATE OR REPLACE zuerst, sonst bricht
-- DROP COLUMN, weil ensure_public_user die Spalten noch im INSERT hat.
--
-- Rückweg:
--   ALTER TABLE public.users
--     ADD COLUMN gdpr_consent boolean DEFAULT true,
--     ADD COLUMN gdpr_consent_date timestamptz DEFAULT now();
--   Function-Body aus 20260911185000 wiederherstellen.

CREATE OR REPLACE FUNCTION public.ensure_public_user(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  auth_rec record;
  is_admin boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM public.users WHERE auth_user_id = p_user_id) THEN
    RETURN;
  END IF;

  SELECT id, email, raw_user_meta_data INTO auth_rec
  FROM auth.users WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT EXISTS (SELECT 1 FROM admin_emails WHERE email = auth_rec.email) INTO is_admin;

  -- Rückfallpfad, tenant_id fehlt, nur bei Bedarf reaktivieren.
  INSERT INTO public.users (
    id,
    email,
    first_name,
    last_name,
    street,
    house_number,
    postal_code,
    city,
    phone
  ) VALUES (
    auth_rec.id,
    auth_rec.email,
    COALESCE(auth_rec.raw_user_meta_data->>'first_name', ''),
    COALESCE(auth_rec.raw_user_meta_data->>'last_name', ''),
    COALESCE(auth_rec.raw_user_meta_data->>'street', ''),
    COALESCE(auth_rec.raw_user_meta_data->>'house_number', ''),
    COALESCE(auth_rec.raw_user_meta_data->>'postal_code', ''),
    COALESCE(auth_rec.raw_user_meta_data->>'city', ''),
    COALESCE(auth_rec.raw_user_meta_data->>'phone', '')
  )
  ON CONFLICT (id) DO UPDATE SET updated_at = now();

  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_public_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_public_user(uuid) TO service_role;

ALTER TABLE public.users DROP COLUMN IF EXISTS gdpr_consent;
ALTER TABLE public.users DROP COLUMN IF EXISTS gdpr_consent_date;

DO $$
DECLARE
  v_def text;
  v_left int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'ensure_public_user'
    AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'ensure_public_user fehlt nach REPLACE';
  END IF;
  IF v_def ILIKE '%gdpr_consent%' THEN
    RAISE EXCEPTION 'ensure_public_user nennt noch gdpr_consent';
  END IF;

  SELECT count(*) INTO v_left
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name IN ('gdpr_consent', 'gdpr_consent_date');
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'gdpr-Spalten noch vorhanden: %', v_left;
  END IF;

  IF has_function_privilege('anon', 'public.ensure_public_user(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon hat EXECUTE auf ensure_public_user';
  END IF;
  IF has_function_privilege('authenticated', 'public.ensure_public_user(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated hat EXECUTE auf ensure_public_user';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.ensure_public_user(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role hat kein EXECUTE auf ensure_public_user';
  END IF;
END $$;
