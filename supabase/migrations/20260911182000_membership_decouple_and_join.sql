-- Stufe 3a „Öffnen (DB)": public.users.id wird eine eigenständige Profil-ID.
-- Login-Anker bleibt auth_user_id (FK auf auth.users, ON DELETE CASCADE).
--
-- Punkt ohne Rückweg: sobald ein zweites Profil je Login existiert, ist
-- Rollback ohne Datenverlust nicht mehr möglich (eine UUID kann nicht
-- gleichzeitig zwei Profilzeilen und auth.users.id sein).
--
-- Rückweg NUR solange noch kein zweites Profil existiert
-- (auth_user_id IS DISTINCT FROM id zählt 0; Re-Seed via seed:dev auf DEV):
--   ALTER TABLE public.users ALTER COLUMN id DROP DEFAULT;
--   ALTER TABLE public.users ADD CONSTRAINT users_id_fkey
--     FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
--   handle_new_user aus Snapshot (id explizit = NEW.id);
--   DROP FUNCTION public.join_tenant(text, text);
--   DROP FUNCTION public.join_tenant_as_owner(uuid, text, text);
--
-- users_auth_user_id_fkey wird NICHT angefasst.

-- 1. Entkopplung
-- id war FK auf auth.users(id) → PK = Login → nur ein Profil je Login.
-- Default + DROP der FK: neue Zeilen bekommen eine eigene UUID;
-- bestehende Zeilen bleiben id = auth_user_id, bis jemand beitritt.
ALTER TABLE public.users ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.users DROP CONSTRAINT users_id_fkey;

-- 2. handle_new_user: id nicht mehr setzen, Default greift.
-- Basis = Live-Wortlaut Inventur A3; einzige Änderung: id aus INSERT/VALUES.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
BEGIN
  -- Rolle aus Metadata lesen; ungültige Werte auf 'user' zurücksetzen
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'user');
  IF v_role NOT IN ('owner', 'admin', 'teacher', 'user') THEN
    v_role := 'user';
  END IF;

  INSERT INTO public.users (
    email, tenant_id, role,
    first_name, last_name,
    street, house_number, postal_code, city, phone,
    auth_user_id
  )
  VALUES (
    NEW.email,
    (NEW.raw_user_meta_data->>'tenant_id')::uuid,
    v_role,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name',  ''),
    COALESCE(NEW.raw_user_meta_data->>'street',       NULL),
    COALESCE(NEW.raw_user_meta_data->>'house_number', NULL),
    COALESCE(NEW.raw_user_meta_data->>'postal_code',  NULL),
    COALESCE(NEW.raw_user_meta_data->>'city',         NULL),
    COALESCE(NEW.raw_user_meta_data->>'phone',        NULL),
    NEW.id
  );
  RETURN NEW;
END;
$function$;

-- 3. Beitritt zum Studio aus dem Request-Header (x-omlify-tenant).
CREATE OR REPLACE FUNCTION public.join_tenant(p_first_name text, p_last_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_login uuid;
  v_slug text;
  v_tenant uuid;
  v_email text;
  v_verified boolean;
  v_member_id uuid;
BEGIN
  v_login := auth.uid();
  IF v_login IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  v_slug := yogaflow_private.request_tenant_slug();
  IF v_slug IS NULL OR v_slug = '#invalid' THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_studio_context');
  END IF;

  SELECT id INTO v_tenant FROM public.tenants WHERE slug = v_slug;
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'studio_not_found');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_user_id = v_login AND tenant_id = v_tenant
  ) THEN
    RETURN jsonb_build_object('success', true, 'already_member', true);
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_login;

  v_verified := EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_user_id = v_login AND email_verified
  );

  INSERT INTO public.users (
    email, tenant_id, role, first_name, last_name,
    auth_user_id, email_verified, email_verified_at
  )
  VALUES (
    v_email, v_tenant, 'user',
    COALESCE(NULLIF(trim(p_first_name), ''), ''),
    COALESCE(NULLIF(trim(p_last_name), ''), ''),
    v_login, v_verified, CASE WHEN v_verified THEN now() ELSE NULL END
  )
  RETURNING id INTO v_member_id;

  RETURN jsonb_build_object('success', true, 'member_id', v_member_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.join_tenant(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_tenant(text, text) TO authenticated;

-- 4. Bestehender Login gründet über Onboarding ein neues Studio (Owner).
CREATE OR REPLACE FUNCTION public.join_tenant_as_owner(
  p_tenant_id uuid,
  p_first_name text,
  p_last_name text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_login uuid;
  v_email text;
  v_verified boolean;
  v_member_id uuid;
BEGIN
  v_login := auth.uid();
  IF v_login IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'studio_not_found');
  END IF;

  IF EXISTS (SELECT 1 FROM public.users WHERE tenant_id = p_tenant_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'studio_not_empty');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_user_id = v_login AND tenant_id = p_tenant_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_member');
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_login;

  v_verified := EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_user_id = v_login AND email_verified
  );

  INSERT INTO public.users (
    email, tenant_id, role, first_name, last_name,
    auth_user_id, email_verified, email_verified_at
  )
  VALUES (
    v_email, p_tenant_id, 'owner',
    COALESCE(NULLIF(trim(p_first_name), ''), ''),
    COALESCE(NULLIF(trim(p_last_name), ''), ''),
    v_login, v_verified, CASE WHEN v_verified THEN now() ELSE NULL END
  )
  RETURNING id INTO v_member_id;

  RETURN jsonb_build_object('success', true, 'member_id', v_member_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.join_tenant_as_owner(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_tenant_as_owner(uuid, text, text) TO authenticated;

-- 6. Selbstprüfung
DO $$
DECLARE
  v_def text;
  v_mismatch integer;
  v_allowed text[] := ARRAY['first_name','last_name','email','phone',
                            'street','house_number','postal_code','city','role'];
  v_col text;
  v_has boolean;
BEGIN
  SELECT pg_get_expr(d.adbin, d.adrelid) INTO v_def
  FROM pg_attrdef d
  JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
  JOIN pg_class c ON c.oid = d.adrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'users' AND a.attname = 'id';

  IF v_def IS NULL OR v_def NOT LIKE '%gen_random_uuid%' THEN
    RAISE EXCEPTION 'users.id Default ist %, erwartet gen_random_uuid', v_def;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public' AND rel.relname = 'users'
      AND con.conname = 'users_id_fkey'
  ) THEN
    RAISE EXCEPTION 'users_id_fkey existiert noch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public' AND rel.relname = 'users'
      AND con.conname = 'users_auth_user_id_fkey'
  ) THEN
    RAISE EXCEPTION 'users_auth_user_id_fkey fehlt';
  END IF;

  SELECT count(*) INTO v_mismatch
  FROM public.users
  WHERE auth_user_id IS DISTINCT FROM id;

  IF v_mismatch <> 0 THEN
    RAISE EXCEPTION 'noch % Zeilen mit auth_user_id IS DISTINCT FROM id (kein Beitritt erwartet)',
      v_mismatch;
  END IF;

  IF has_function_privilege('anon', 'public.join_tenant(text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon hat EXECUTE auf join_tenant(text, text)';
  END IF;

  IF has_function_privilege('anon', 'public.join_tenant_as_owner(uuid, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon hat EXECUTE auf join_tenant_as_owner(uuid, text, text)';
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
END $$;
