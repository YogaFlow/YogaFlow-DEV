-- Expand: staff_names — Anzeigenamen für Staff ohne volle users-Zeile.
--
-- Zweck: Teilnehmende brauchen first_name/last_name der Kursleitung (Kursliste,
-- Detail, Chat). Policy users_select_participant_staff gibt heute die ganze
-- Zeile frei (E-Mail, Adresse, auth_user_id). Diese RPC liefert nur id,
-- first_name, last_name, role und nur Staff im eigenen Tenant.
--
-- Die Policy bleibt hier unangetastet. Contract in
-- 20260922154600_drop_users_select_participant_staff.sql, erst nach dem
-- Frontend mit staff_names.
--
-- Rückweg: DROP FUNCTION public.staff_names(uuid[]);

CREATE OR REPLACE FUNCTION public.staff_names(p_ids uuid[])
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  role text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF yogaflow_private.get_my_member_id() IS NULL THEN
    RETURN;
  END IF;

  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN;
  END IF;

  IF cardinality(p_ids) > 500 THEN
    RAISE EXCEPTION 'staff_names: höchstens 500 IDs';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.first_name,
    u.last_name,
    u.role
  FROM public.users u
  WHERE u.id = ANY (p_ids)
    AND u.tenant_id = yogaflow_private.get_my_tenant_id()
    AND u.role IN ('teacher', 'admin', 'owner');
END;
$function$;

REVOKE ALL ON FUNCTION public.staff_names(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_names(uuid[]) TO authenticated;

DO $$
DECLARE
  v_oid oid;
  v_prosecdef boolean;
  v_cols text[];
BEGIN
  SELECT p.oid, p.prosecdef
    INTO v_oid, v_prosecdef
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'staff_names'
    AND pg_get_function_identity_arguments(p.oid) = 'p_ids uuid[]';

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'public.staff_names(uuid[]) fehlt';
  END IF;

  IF NOT v_prosecdef THEN
    RAISE EXCEPTION 'staff_names ist nicht SECURITY DEFINER';
  END IF;

  -- SET search_path TO '' speichert als option_value die zwei Zeichen "".
  IF NOT EXISTS (
    SELECT 1
    FROM pg_options_to_table((SELECT proconfig FROM pg_proc WHERE oid = v_oid))
    WHERE option_name = 'search_path'
      AND option_value = '""'
  ) THEN
    RAISE EXCEPTION 'staff_names search_path ist nicht leer';
  END IF;

  IF has_function_privilege('anon', 'public.staff_names(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon hat EXECUTE auf public.staff_names(uuid[])';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.staff_names(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated braucht EXECUTE auf public.staff_names(uuid[])';
  END IF;

  SELECT array_agg(u.name ORDER BY u.ord)
    INTO v_cols
  FROM pg_proc p
  CROSS JOIN LATERAL unnest(p.proargnames, p.proargmodes)
    WITH ORDINALITY AS u(name, mode, ord)
  WHERE p.oid = v_oid
    AND u.mode = 't';

  IF v_cols IS DISTINCT FROM ARRAY['id', 'first_name', 'last_name', 'role']::text[] THEN
    RAISE EXCEPTION 'staff_names Rückgabespalten sind %, erwartet id,first_name,last_name,role', v_cols;
  END IF;
END $$;
