-- Stufe 3b „Identität auf Login-Ebene" (DB):
-- auth_tokens.user_id referenziert den Login (auth.users), nicht das Studio-Profil.
-- Token-RPCs und complete_email_verification arbeiten auf auth_user_id.
--
-- Beleg vor DROP (DEV, gelesen vor Entwurf):
--   SELECT count(*) FROM public.auth_tokens t
--     WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = t.user_id);
--   → 0 (11 Token-Zeilen). Cleanup nicht nötig.
--
-- Rückweg (solange kein zweites Profil: auth_user_id IS DISTINCT FROM id = 0):
--   FK zurück auf public.users(id); Token-RPCs / complete_email_verification
--   aus Snapshot; DROP lookup_login_by_email, lookup_studio_slug_for_login.
--
-- update-user wird in dieser Stufe nicht angefasst.

-- 2a. Login-FK
-- user_id ist jetzt der Login, nicht das Studio-Profil.
ALTER TABLE public.auth_tokens DROP CONSTRAINT auth_tokens_user_id_fkey;
ALTER TABLE public.auth_tokens
  ADD CONSTRAINT auth_tokens_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2b. create_verification_token: p_user_id = Login.
-- Live-Änderung gegenüber Inventur 1a: das UPDATE auf public.users
-- nutzte WHERE id = p_user_id — wird WHERE auth_user_id = p_user_id
-- (alle Profile des Logins, analog 2c).
-- create_password_reset_token: Körper unverändert (schreibt nur auth_tokens.user_id).
CREATE OR REPLACE FUNCTION public.create_verification_token(p_user_id uuid, p_email text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token text;
BEGIN
  -- Alte, noch nicht verwendete Tokens invalidieren
  UPDATE auth_tokens
  SET    used = true
  WHERE  user_id = p_user_id
    AND  type    = 'email_verification'
    AND  NOT used;

  -- Verifikationsstatus zurücksetzen, damit neuer Klick erforderlich ist
  UPDATE users
  SET    email_verified    = false,
         email_verified_at = NULL
  WHERE  auth_user_id   = p_user_id
    AND  email_verified = true;

  -- Neuen Token generieren (32 Bytes = 64 Hex-Zeichen, 24 h gültig)
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO auth_tokens (user_id, token, type, expires_at)
  VALUES (p_user_id, v_token, 'email_verification', now() + interval '24 hours');

  RETURN v_token;
END;
$function$;

-- 2c. Ein Login, eine E-Mail → alle seine Profile bestätigt.
CREATE OR REPLACE FUNCTION public.complete_email_verification(p_user_id uuid, p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM auth_tokens
    WHERE token = p_token
      AND user_id = p_user_id
      AND type = 'email_verification'
      AND NOT used
      AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'invalid_or_expired_token';
  END IF;

  UPDATE users
  SET email_verified = true,
      email_verified_at = COALESCE(email_verified_at, now())
  WHERE auth_user_id = p_user_id;

  UPDATE auth_tokens
  SET used = true
  WHERE token = p_token;
END;
$function$;

-- 2d. ensure_public_user
-- Aufrufer live: nur supabase/functions/send-verification-email/index.ts:38.
-- Live-Body INSERT ohne tenant_id und ohne auth_user_id; beide Spalten sind
-- NOT NULL ohne Default. Ohne Studio-Kontext kein gültiges Profil.
-- Nur die tote Spalte roles aus dem INSERT entfernt.
-- Rückfallpfad, tenant_id fehlt, nur bei Bedarf reaktivieren.
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
    phone,
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
    true,
    now()
  )
  ON CONFLICT (id) DO UPDATE SET updated_at = now();

  RETURN;
END;
$function$;

-- Für Edge 3b/3c: Login per E-Mail (auth.users, höchstens eine id).
-- service_role only — nicht für anon/authenticated.
CREATE OR REPLACE FUNCTION public.lookup_login_by_email(p_email text)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id
  FROM auth.users
  WHERE lower(email) = lower(btrim(p_email))
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.lookup_login_by_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lookup_login_by_email(text) TO service_role;

-- Studio-Slug für Mail-Links: optionaler Hint, sonst lexikographisch erster Slug des Logins.
CREATE OR REPLACE FUNCTION public.lookup_studio_slug_for_login(p_auth_user_id uuid, p_hint text DEFAULT NULL)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hint text;
  v_slug text;
BEGIN
  v_hint := lower(btrim(COALESCE(p_hint, '')));
  IF v_hint ~ '^[a-z0-9]{3,30}$' THEN
    SELECT t.slug INTO v_slug
    FROM public.users u
    JOIN public.tenants t ON t.id = u.tenant_id
    WHERE u.auth_user_id = p_auth_user_id
      AND t.slug = v_hint;
    IF v_slug IS NOT NULL THEN
      RETURN v_slug;
    END IF;
  END IF;

  SELECT t.slug INTO v_slug
  FROM public.users u
  JOIN public.tenants t ON t.id = u.tenant_id
  WHERE u.auth_user_id = p_auth_user_id
  ORDER BY t.slug
  LIMIT 1;

  RETURN v_slug;
END;
$function$;

REVOKE ALL ON FUNCTION public.lookup_studio_slug_for_login(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lookup_studio_slug_for_login(uuid, text) TO service_role;

-- 2e. Selbstprüfung
DO $$
DECLARE
  v_to_schema text;
  v_to_table text;
  v_orphan integer;
  v_mismatch integer;
  v_allowed text[] := ARRAY['first_name','last_name','email','phone',
                            'street','house_number','postal_code','city','role'];
  v_col text;
  v_has boolean;
BEGIN
  SELECT fnsp.nspname, frel.relname
  INTO v_to_schema, v_to_table
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  JOIN pg_class frel ON frel.oid = con.confrelid
  JOIN pg_namespace fnsp ON fnsp.oid = frel.relnamespace
  WHERE nsp.nspname = 'public' AND rel.relname = 'auth_tokens'
    AND con.conname = 'auth_tokens_user_id_fkey';

  IF v_to_schema IS DISTINCT FROM 'auth' OR v_to_table IS DISTINCT FROM 'users' THEN
    RAISE EXCEPTION 'auth_tokens_user_id_fkey zeigt auf %.%, erwartet auth.users',
      v_to_schema, v_to_table;
  END IF;

  IF has_function_privilege('anon', 'public.lookup_login_by_email(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon hat EXECUTE auf lookup_login_by_email(text)';
  END IF;

  IF has_function_privilege('anon', 'public.lookup_studio_slug_for_login(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon hat EXECUTE auf lookup_studio_slug_for_login(uuid, text)';
  END IF;

  SELECT count(*) INTO v_orphan
  FROM public.auth_tokens t
  WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = t.user_id);

  IF v_orphan <> 0 THEN
    RAISE EXCEPTION '% auth_tokens-Zeilen ohne passenden auth.users-Login', v_orphan;
  END IF;

  IF has_any_column_privilege('anon', 'public.users', 'UPDATE') THEN
    RAISE EXCEPTION 'Stufe 0: anon hat noch UPDATE auf public.users';
  END IF;

  IF has_table_privilege('authenticated', 'public.users', 'UPDATE') THEN
    RAISE EXCEPTION 'Stufe 0: authenticated hat noch Tabellen-UPDATE auf public.users';
  END IF;

  FOR v_col IN
    SELECT attname FROM pg_attribute
    WHERE attrelid = 'public.users'::regclass AND attnum > 0 AND NOT attisdropped
  LOOP
    v_has := has_column_privilege('authenticated', 'public.users', v_col, 'UPDATE');
    IF v_has IS DISTINCT FROM (v_col = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'Stufe 0: public.users.% UPDATE für authenticated ist %, erwartet %',
        v_col, v_has, (v_col = ANY (v_allowed));
    END IF;
  END LOOP;

  SELECT count(*) INTO v_mismatch
  FROM public.users
  WHERE auth_user_id IS DISTINCT FROM id;

  IF v_mismatch <> 0 THEN
    RAISE EXCEPTION '% Zeilen mit auth_user_id IS DISTINCT FROM id (kein Beitritt erwartet)',
      v_mismatch;
  END IF;
END $$;
