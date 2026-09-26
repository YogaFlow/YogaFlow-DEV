-- Hotfix — handle_new_user übernimmt erhöhte Rollen nicht mehr aus dem Client.
--
-- Befund (26.09.2026, DEV und PROD wortgleich, Fassung 20260911182000):
--   Der Trigger on_auth_user_created liest role und tenant_id aus
--   raw_user_meta_data. Dieses Feld setzt jeder Client bei signUp.
--   Erlaubt waren owner, admin, teacher. tenant_id wurde nicht geprüft.
--   Wer die id eines Studios kennt, konnte sich per Registrierung zum Owner
--   machen. tenants ist für anon lesbar (Policy „Tenants sind öffentlich
--   lesbar“, USING true), die id steht damit zu jedem Slug.
--
-- Zweck:
--   signUp aus dem Browser erzeugt nie admin oder teacher.
--   owner nur für ein Studio, das höchstens 10 Minuten alt ist und noch
--   keinen Owner hat (Onboarding: begin_tenant_onboarding legt nur die
--   tenants-Zeile an, kein Profil, kein Statusfeld, kein Geheimnis).
--   Erhöhte Rollen aus Seeds und der Admin-API nur noch über
--   raw_app_meta_data (setzt nur service_role).
--   GoTrue legt den Login zuerst an (App-Meta nur provider/providers) und
--   schreibt die mitgegebene app_metadata danach per UPDATE in derselben
--   Transaktion (adminUserCreate: Create, dann UpdateAppMetaData). Der
--   INSERT-Trigger sieht die Rolle daher nicht. Ein UPDATE-Trigger übernimmt
--   sie, sobald sich raw_app_meta_data->>'role' ändert, und nur wenn genau
--   ein Profil zu diesem Login gehört.
--   Selbstregistrierung ohne role (RegisterForm) bleibt user im genannten Studio.
--
-- Studio existiert nicht: unverändert Abbruch durch die Tabelle.
--   users.tenant_id ist NOT NULL, FK users_tenant_id_fkey auf tenants(id).
--   Ungültiger Text scheitert am Cast ::uuid, NULL an NOT NULL, eine
--   unbekannte UUID an der FK. Der INSERT in auth.users rollt mit zurück.
--
-- Restlücke: In den 10 Minuten nach begin_tenant_onboarding gewinnt, wer
--   zuerst signUp mit role=owner schickt. Gleichzeitige Anmeldungen
--   serialisiert FOR UPDATE auf der tenants-Zeile. Ein älteres Studio
--   ohne Owner (abgebrochenes Onboarding, das nicht per cancel gelöscht
--   wurde) bekommt keinen Owner mehr über signUp.
--
-- Audit: actor_member_id bleibt NULL. Die Spalte zeigt mit ON DELETE
--   RESTRICT auf users. Ein Verweis auf das neue Profil würde späteres
--   Löschen des Logins blockieren. audit_log ist append-only.
--
-- Rückweg (Fassung 20260911182000, live vor diesem Hotfix):
--   CREATE OR REPLACE FUNCTION public.handle_new_user()
--   RETURNS trigger
--   LANGUAGE plpgsql
--   SECURITY DEFINER
--   SET search_path TO 'public'
--   AS $function$
--   DECLARE
--     v_role text;
--   BEGIN
--     v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'user');
--     IF v_role NOT IN ('owner', 'admin', 'teacher', 'user') THEN
--       v_role := 'user';
--     END IF;
--
--     INSERT INTO public.users (
--       email, tenant_id, role,
--       first_name, last_name,
--       street, house_number, postal_code, city, phone,
--       auth_user_id
--     )
--     VALUES (
--       NEW.email,
--       (NEW.raw_user_meta_data->>'tenant_id')::uuid,
--       v_role,
--       COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
--       COALESCE(NEW.raw_user_meta_data->>'last_name',  ''),
--       COALESCE(NEW.raw_user_meta_data->>'street',       NULL),
--       COALESCE(NEW.raw_user_meta_data->>'house_number', NULL),
--       COALESCE(NEW.raw_user_meta_data->>'postal_code',  NULL),
--       COALESCE(NEW.raw_user_meta_data->>'city',         NULL),
--       COALESCE(NEW.raw_user_meta_data->>'phone',        NULL),
--       NEW.id
--     );
--     RETURN NEW;
--   END;
--   $function$;

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
BEGIN
  v_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::uuid;
  v_trusted := NEW.raw_app_meta_data->>'role';
  v_wanted := NEW.raw_user_meta_data->>'role';

  IF v_trusted IN ('owner', 'admin', 'teacher', 'user') THEN
    v_role := v_trusted;
  ELSIF v_wanted = 'owner' THEN
    -- Sperre bis Transaktionsende, damit zwei gleichzeitige Owner-Anmeldungen
    -- nicht beide „noch kein Owner“ sehen.
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

DO $$
DECLARE
  v_src text;
  v_oid oid;
BEGIN
  SELECT p.oid, p.prosrc
    INTO v_oid, v_src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'handle_new_user'
    AND pg_get_function_identity_arguments(p.oid) = '';

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'security: public.handle_new_user() fehlt';
  END IF;

  IF v_src NOT LIKE '%raw_app_meta_data%' THEN
    RAISE EXCEPTION 'security: handle_new_user liest raw_app_meta_data nicht';
  END IF;

  IF v_src LIKE '%v_role := v_wanted%'
     OR v_src LIKE '%v_role := NEW.raw_user_meta_data%'
     OR v_src LIKE '%v_role := COALESCE(NEW.raw_user_meta_data%'
  THEN
    RAISE EXCEPTION 'security: Rolle wird noch aus raw_user_meta_data zugewiesen';
  END IF;

  IF v_src NOT LIKE '%v_wanted = ''owner''%' OR v_src NOT LIKE '%v_role := ''owner''%' THEN
    RAISE EXCEPTION 'security: owner-Zweig fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_options_to_table((SELECT proconfig FROM pg_proc WHERE oid = v_oid))
    WHERE option_name = 'search_path'
      AND option_value = '""'
  ) THEN
    RAISE EXCEPTION 'security: handle_new_user search_path ist nicht leer';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth'
      AND c.relname = 'users'
      AND t.tgname = 'on_auth_user_created'
      AND NOT t.tgisinternal
      AND pg_get_triggerdef(t.oid) ILIKE '%handle_new_user%'
  ) THEN
    RAISE EXCEPTION 'security: Trigger on_auth_user_created fehlt';
  END IF;
END $$;

-- GoTrue schreibt app_metadata erst nach dem INSERT. prevent_role_escalation
-- lässt die daraus folgende Rollenänderung nur zu, wenn die Session GoTrue
-- gehört (supabase_auth_admin). PostgREST läuft als authenticator; ein
-- set_config aus dem Browser reicht dafür nicht.

CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_actor_role text;
  v_actor_tenant uuid;
  v_owner_count integer;
BEGIN
  IF OLD.role IS NOT DISTINCT FROM NEW.role THEN
    RETURN NEW;
  END IF;

  IF session_user::text = 'supabase_auth_admin' THEN
    RETURN NEW;
  END IF;

  SELECT role, tenant_id
  INTO v_actor_role, v_actor_tenant
  FROM public.users
  WHERE id = yogaflow_private.get_my_member_id();

  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'ROLE_CHANGE_FORBIDDEN: actor profile missing';
  END IF;

  IF v_actor_tenant IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'ROLE_CHANGE_FORBIDDEN: cross-tenant role change is not allowed';
  END IF;

  -- Non-managers cannot change any role.
  IF v_actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'ROLE_CHANGE_FORBIDDEN: only owner or admin can change roles';
  END IF;

  -- Admins (or lower roles) may never grant owner.
  IF NEW.role = 'owner' AND v_actor_role <> 'owner' THEN
    RAISE EXCEPTION 'OWNER_ASSIGNMENT_FORBIDDEN: only existing owners can assign owner role';
  END IF;

  -- Any change that touches owner records requires owner privileges.
  IF (OLD.role = 'owner' OR NEW.role = 'owner') AND v_actor_role <> 'owner' THEN
    RAISE EXCEPTION 'OWNER_ROLE_CHANGE_FORBIDDEN: only owners can modify owner role assignments';
  END IF;

  -- When owner role is removed, ensure at least one owner remains in tenant.
  IF OLD.role = 'owner' AND NEW.role <> 'owner' THEN
    v_owner_count := public.count_tenant_owners(OLD.tenant_id);
    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'LAST_OWNER_REQUIRED: at least one owner must remain in this studio';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_profile_role_from_app_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_trusted text;
  v_profiles integer;
BEGIN
  v_trusted := NEW.raw_app_meta_data->>'role';
  IF v_trusted IS NULL
     OR v_trusted NOT IN ('owner', 'admin', 'teacher', 'user')
     OR v_trusted IS NOT DISTINCT FROM (OLD.raw_app_meta_data->>'role')
  THEN
    RETURN NEW;
  END IF;

  SELECT count(*)
    INTO v_profiles
  FROM public.users
  WHERE auth_user_id = NEW.id;

  IF v_profiles = 1 THEN
    UPDATE public.users
    SET role = v_trusted
    WHERE auth_user_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_profile_role_from_app_metadata() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_profile_role_from_app_metadata() TO supabase_auth_admin;

DROP TRIGGER IF EXISTS on_auth_user_app_metadata ON auth.users;
CREATE TRIGGER on_auth_user_app_metadata
  AFTER UPDATE OF raw_app_meta_data ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_role_from_app_metadata();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'prevent_role_escalation'
      AND p.prosrc LIKE '%supabase_auth_admin%'
  ) THEN
    RAISE EXCEPTION 'security: prevent_role_escalation lässt GoTrue nicht zu';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth'
      AND c.relname = 'users'
      AND t.tgname = 'on_auth_user_app_metadata'
      AND NOT t.tgisinternal
      AND pg_get_triggerdef(t.oid) ILIKE '%sync_profile_role_from_app_metadata%'
  ) THEN
    RAISE EXCEPTION 'security: Trigger on_auth_user_app_metadata fehlt';
  END IF;

  IF has_function_privilege('anon', 'public.sync_profile_role_from_app_metadata()', 'EXECUTE') THEN
    RAISE EXCEPTION 'security: anon hat EXECUTE auf sync_profile_role_from_app_metadata';
  END IF;
END $$;
