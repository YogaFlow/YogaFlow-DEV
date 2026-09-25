-- K2a: Liste „Login nur in diesem Studio“ für Owner/Admin.
--
-- Bewusst offengelegt: login_exclusive = false sagt dem Aufrufer, dass dieser
-- Login noch mindestens ein weiteres Profil hat. Nicht, in welchem Studio.
-- Das ist die minimale Angabe für den Hinweistext in der Nutzerverwaltung.
-- auth_user_id IS NULL ergibt ebenfalls false (kein Login, also nicht „nur hier“).
-- Die Rückgabe enthält nur member_id und login_exclusive, keine Personenfelder.
--
-- K2b schreibt die Glocke über record_studio_password_notice, aufgerufen mit
-- dem Service-Role-Client nach updateUserById. EXECUTE nur service_role:
-- authenticated soll die Meldung nicht ohne Passwortwechsel erzeugen können.
--
-- Der Service-Role-Aufruf hat kein auth.uid() der handelnden Person.
-- Deshalb übergibt die Function die Profil-Id, die sie vorher mit dem
-- Nutzer-JWT über get_current_member() gelesen hat (p_actor_id). Die RPC
-- liest diese Zeile neu: Rolle owner/admin, und die Zielzeile muss dieselbe
-- tenant_id und Rolle user haben. Ein falsches Id-Paar schreibt keine Glocke.
-- Den JWT prüft sie nicht erneut — den hat nur die Function, und nur die
-- darf hier überhaupt aufrufen.
--
-- Rückweg: DROP FUNCTION public.studio_member_login_exclusive();
--           DROP FUNCTION public.record_studio_password_notice(uuid, uuid);

CREATE OR REPLACE FUNCTION public.studio_member_login_exclusive()
RETURNS TABLE (member_id uuid, login_exclusive boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    u.id,
    (
      u.auth_user_id IS NOT NULL
      AND (
        SELECT count(*)
        FROM public.users u2
        WHERE u2.auth_user_id = u.auth_user_id
      ) = 1
    )
  FROM public.users u
  WHERE yogaflow_private.is_tenant_manager()
    AND u.tenant_id = yogaflow_private.get_my_tenant_id();
$function$;

REVOKE ALL ON FUNCTION public.studio_member_login_exclusive() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_member_login_exclusive() TO authenticated;

CREATE OR REPLACE FUNCTION public.record_studio_password_notice(
  p_actor_id uuid,
  p_member_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tenant uuid;
BEGIN
  IF p_actor_id IS NULL OR p_member_id IS NULL THEN
    RAISE EXCEPTION 'password notice forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT u.tenant_id
    INTO v_tenant
  FROM public.users u
  WHERE u.id = p_actor_id
    AND u.role IN ('owner', 'admin');

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'password notice forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users t
    WHERE t.id = p_member_id
      AND t.tenant_id = v_tenant
      AND t.role = 'user'
  ) THEN
    RAISE EXCEPTION 'password notice forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.user_notifications (
    tenant_id, user_id, type, body, action_path
  ) VALUES (
    v_tenant,
    p_member_id,
    'password_changed',
    'Dein Passwort wurde vom Studio geändert.',
    '/profile'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.record_studio_password_notice(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_studio_password_notice(uuid, uuid) TO service_role;

DO $$
DECLARE
  v_path text;
  v_cols text;
  v_teacher_auth uuid;
  v_teacher_slug text;
  v_member uuid;
BEGIN
  IF has_function_privilege('anon', 'public.studio_member_login_exclusive()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon darf studio_member_login_exclusive nicht ausführen';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.studio_member_login_exclusive()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated braucht EXECUTE auf studio_member_login_exclusive';
  END IF;

  IF has_function_privilege('anon', 'public.record_studio_password_notice(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon darf record_studio_password_notice nicht ausführen';
  END IF;
  IF has_function_privilege('authenticated', 'public.record_studio_password_notice(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated darf record_studio_password_notice nicht ausführen';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.record_studio_password_notice(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role braucht EXECUTE auf record_studio_password_notice';
  END IF;

  SELECT array_to_string(p.proconfig, ',')
    INTO v_path
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'studio_member_login_exclusive';
  IF v_path IS NULL OR v_path NOT LIKE '%search_path=public, pg_temp%' THEN
    RAISE EXCEPTION 'studio_member_login_exclusive search_path ist nicht public, pg_temp';
  END IF;

  SELECT array_to_string(p.proconfig, ',')
    INTO v_path
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'record_studio_password_notice';
  IF v_path IS NULL OR v_path NOT LIKE '%search_path=public, pg_temp%' THEN
    RAISE EXCEPTION 'record_studio_password_notice search_path ist nicht public, pg_temp';
  END IF;

  SELECT array_to_string(p.proargnames, ',')
    INTO v_cols
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'studio_member_login_exclusive'
    AND p.proargmodes = ARRAY['t','t']::"char"[];
  IF v_cols IS DISTINCT FROM 'member_id,login_exclusive' THEN
    RAISE EXCEPTION 'studio_member_login_exclusive liefert nicht nur member_id und login_exclusive (ist: %)', COALESCE(v_cols, 'keine');
  END IF;

  SELECT u.auth_user_id, t.slug
    INTO v_teacher_auth, v_teacher_slug
  FROM public.users u
  JOIN public.tenants t ON t.id = u.tenant_id
  WHERE u.role = 'teacher'
    AND u.auth_user_id IS NOT NULL
    AND t.slug ~ '^[a-z0-9]{3,30}$'
  LIMIT 1;

  IF v_teacher_auth IS NULL THEN
    RAISE NOTICE 'Selbstprüfung teacher übersprungen: kein Lehrerprofil mit Login';
  ELSE
  PERFORM set_config(
    'request.jwt.claim.sub',
    v_teacher_auth::text,
    true
  );
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_teacher_auth, 'role', 'authenticated')::text,
    true
  );
  PERFORM set_config(
    'request.headers',
    json_build_object('x-omlify-tenant', v_teacher_slug)::text,
    true
  );

  v_member := yogaflow_private.get_my_member_id();
  IF v_member IS NULL THEN
    RAISE EXCEPTION 'Selbstprüfung: Lehrerprofil nicht aufgelöst';
  END IF;
  IF yogaflow_private.is_tenant_manager() THEN
    RAISE EXCEPTION 'Selbstprüfung: Lehrer gilt als Manager';
  END IF;
  IF EXISTS (SELECT 1 FROM public.studio_member_login_exclusive()) THEN
    RAISE EXCEPTION 'Selbstprüfung: teacher sieht Zeilen';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.headers', '', true);
  END IF;
END $$;
