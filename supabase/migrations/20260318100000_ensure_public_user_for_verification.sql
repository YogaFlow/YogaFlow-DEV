-- Wenn der Trigger on_auth_user_created den User noch nicht in public.users angelegt hat
-- (z. B. Race oder Trigger fehlt), legt diese Funktion den Eintrag aus auth.users nach.
-- Wird von send-verification-email vor create_verification_token aufgerufen.

CREATE OR REPLACE FUNCTION public.ensure_public_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  auth_rec record;
  user_roles text[];
  is_admin boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    RETURN;
  END IF;

  SELECT id, email, raw_user_meta_data INTO auth_rec
  FROM auth.users WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT EXISTS (SELECT 1 FROM admin_emails WHERE email = auth_rec.email) INTO is_admin;
  IF is_admin THEN
    user_roles := ARRAY['admin', 'course_leader', 'participant'];
  ELSE
    user_roles := ARRAY['participant'];
  END IF;

  INSERT INTO public.users (
    id,
    email,
    first_name,
    last_name,
    street,
    house_number,
    postal_code,
    city,
    phone,
    roles,
    gdpr_consent,
    gdpr_consent_date
  ) VALUES (
    auth_rec.id,
    auth_rec.email,
    COALESCE(auth_rec.raw_user_meta_data->>'first_name', ''),
    COALESCE(auth_rec.raw_user_meta_data->>'last_name', ''),
    COALESCE(auth_rec.raw_user_meta_data->>'street', ''),
    COALESCE(auth_rec.raw_user_meta_data->>'house_number', ''),
    COALESCE(auth_rec.raw_user_meta_data->>'postal_code', ''),
    COALESCE(auth_rec.raw_user_meta_data->>'city', ''),
    COALESCE(auth_rec.raw_user_meta_data->>'phone', ''),
    user_roles,
    true,
    now()
  )
  ON CONFLICT (id) DO UPDATE SET updated_at = now();

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_public_user(uuid) TO service_role;
