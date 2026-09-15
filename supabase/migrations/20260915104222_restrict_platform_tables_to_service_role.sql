-- Zweck: Hotfix (15.09.2026). system_settings und admin_emails nur noch für service_role.
-- Befund (Audit 15.09.): Owner/Admin jedes Studios durften system_settings lesen und schreiben
-- (Policies ohne Studio-Bezug), jedes Login durfte admin_emails lesen (USING true).
-- Keine Daten werden gelesen, geändert oder gelöscht. App und Edge Functions nutzen beide Tabellen nicht
-- (SMTP kommt aus Edge-Function-Secrets); ensure_public_user ist SECURITY DEFINER (Eigentümer postgres).
--
-- Rückweg:
--   CREATE POLICY "admin_emails_select_authenticated"
--     ON public.admin_emails
--     FOR SELECT
--     TO authenticated
--     USING (true);
--   CREATE POLICY "system_settings_manage_managers"
--     ON public.system_settings FOR ALL
--     TO authenticated
--     USING (yogaflow_private.is_tenant_manager())
--     WITH CHECK (yogaflow_private.is_tenant_manager());
--   CREATE POLICY "system_settings_select_managers"
--     ON public.system_settings FOR SELECT
--     TO authenticated
--     USING (yogaflow_private.is_tenant_manager());
--   GRANT ALL ON TABLE public.system_settings TO anon, authenticated;
--   GRANT ALL ON TABLE public.admin_emails TO anon, authenticated;

DROP POLICY IF EXISTS system_settings_select_managers ON public.system_settings;
DROP POLICY IF EXISTS system_settings_manage_managers ON public.system_settings;
DROP POLICY IF EXISTS admin_emails_select_authenticated ON public.admin_emails;

REVOKE ALL ON TABLE public.system_settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_emails FROM anon, authenticated;

DO $$
DECLARE
  v_policies text[];
  v_role text;
  v_table text;
  v_priv text;
  v_owner name;
  v_definer boolean;
BEGIN
  SELECT array_agg(policyname ORDER BY policyname)
    INTO v_policies
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'system_settings';
  IF v_policies IS DISTINCT FROM ARRAY['system_settings_service_role_all'] THEN
    RAISE EXCEPTION 'system_settings policies sind %, erwartet {system_settings_service_role_all}', v_policies;
  END IF;

  SELECT array_agg(policyname ORDER BY policyname)
    INTO v_policies
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'admin_emails';
  IF v_policies IS DISTINCT FROM ARRAY['admin_emails_service_role_all'] THEN
    RAISE EXCEPTION 'admin_emails policies sind %, erwartet {admin_emails_service_role_all}', v_policies;
  END IF;

  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH v_table IN ARRAY ARRAY['public.system_settings', 'public.admin_emails'] LOOP
      FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
        IF has_table_privilege(v_role, v_table, v_priv) THEN
          RAISE EXCEPTION '% hat noch % auf %', v_role, v_priv, v_table;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  IF NOT has_table_privilege('service_role', 'public.system_settings', 'SELECT') THEN
    RAISE EXCEPTION 'service_role hat kein SELECT auf public.system_settings';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.admin_emails', 'SELECT') THEN
    RAISE EXCEPTION 'service_role hat kein SELECT auf public.admin_emails';
  END IF;

  SELECT p.prosecdef, pg_get_userbyid(p.proowner)
    INTO v_definer, v_owner
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'ensure_public_user'
     AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid';
  IF v_definer IS DISTINCT FROM true OR v_owner IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'ensure_public_user prosecdef=% owner=%, erwartet true/postgres', v_definer, v_owner;
  END IF;
END $$;
