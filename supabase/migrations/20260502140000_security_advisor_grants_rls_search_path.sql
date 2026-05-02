-- Security Advisor: EXECUTE-Rechte, RLS, search_path, Multitenant-Härtung
-- Zuerst auf DEV anwenden und testen; PROD nur nach Pre-PROD-Checkliste.

-- =============================================================================
-- Overload: nur (uuid, text) — Edge nutzt zwei Argumente (request-password-reset)
-- =============================================================================
DROP FUNCTION IF EXISTS public.create_password_reset_token(uuid);

-- =============================================================================
-- is_admin(): Multitenant — Spalte role (roles[] wurde in E2 entfernt)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'admin'
  );
$$;

-- =============================================================================
-- search_path: Trigger-Helfer (Advisor function_search_path_mutable)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- create_password_reset_token(uuid, text): search_path explizit (Advisor)
CREATE OR REPLACE FUNCTION public.create_password_reset_token(
  p_user_id uuid,
  p_email text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token text;
BEGIN
  UPDATE public.auth_tokens SET used = true
  WHERE user_id = p_user_id AND type = 'password_reset' AND NOT used;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.auth_tokens (user_id, token, type, expires_at)
  VALUES (p_user_id, v_token, 'password_reset', now() + interval '1 hour');
  RETURN v_token;
END;
$$;

-- =============================================================================
-- get_course_participant_counts: nur Kurse im eigenen Tenant (Mandantenisolation)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_course_participant_counts(p_course_ids uuid[])
RETURNS TABLE (
  course_id uuid,
  registered_count bigint,
  waitlist_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT u.tenant_id INTO v_tenant
  FROM public.users u
  WHERE u.id = auth.uid();

  IF v_tenant IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id AS course_id,
    COUNT(r.id) FILTER (
      WHERE r.status = 'registered'
        AND r.is_waitlist = false
        AND r.cancellation_timestamp IS NULL
    ) AS registered_count,
    COUNT(r.id) FILTER (
      WHERE r.is_waitlist = true
        AND r.cancellation_timestamp IS NULL
    ) AS waitlist_count
  FROM public.courses c
  LEFT JOIN public.registrations r ON r.course_id = c.id
  WHERE c.id = ANY(p_course_ids)
    AND c.tenant_id = v_tenant
  GROUP BY c.id;
END;
$$;

-- =============================================================================
-- RLS: Advisor rls_enabled_no_policy (0008)
-- =============================================================================

DROP POLICY IF EXISTS "Service role can manage all tokens" ON public.auth_tokens;
CREATE POLICY "Service role can manage all tokens"
  ON public.auth_tokens
  FOR ALL
  TO service_role
  USING ((select auth.jwt())->>'role' = 'service_role')
  WITH CHECK ((select auth.jwt())->>'role' = 'service_role');

DROP POLICY IF EXISTS "Anyone authenticated can read admin emails" ON public.admin_emails;
DROP POLICY IF EXISTS "Admins can insert admin emails" ON public.admin_emails;
DROP POLICY IF EXISTS "Admins can delete admin emails" ON public.admin_emails;
DROP POLICY IF EXISTS "Admins can manage admin emails" ON public.admin_emails;
DROP POLICY IF EXISTS "Only admins can read admin emails" ON public.admin_emails;
DROP POLICY IF EXISTS "admin_emails_select_authenticated" ON public.admin_emails;
DROP POLICY IF EXISTS "admin_emails_service_role_all" ON public.admin_emails;

CREATE POLICY "admin_emails_select_authenticated"
  ON public.admin_emails
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admin_emails_service_role_all"
  ON public.admin_emails
  FOR ALL
  TO service_role
  USING ((select auth.jwt())->>'role' = 'service_role')
  WITH CHECK ((select auth.jwt())->>'role' = 'service_role');

DROP POLICY IF EXISTS "Anyone can read email templates" ON public.email_templates;
DROP POLICY IF EXISTS "All can read email templates" ON public.email_templates;
DROP POLICY IF EXISTS "Admins can manage email templates" ON public.email_templates;
DROP POLICY IF EXISTS "Admins can modify email templates" ON public.email_templates;
DROP POLICY IF EXISTS "Admins can update email templates" ON public.email_templates;
DROP POLICY IF EXISTS "Admins can delete email templates" ON public.email_templates;
DROP POLICY IF EXISTS "email_templates_select_authenticated" ON public.email_templates;
DROP POLICY IF EXISTS "email_templates_insert_managers" ON public.email_templates;
DROP POLICY IF EXISTS "email_templates_update_managers" ON public.email_templates;
DROP POLICY IF EXISTS "email_templates_delete_managers" ON public.email_templates;
DROP POLICY IF EXISTS "email_templates_modify_managers" ON public.email_templates;
DROP POLICY IF EXISTS "email_templates_service_role_all" ON public.email_templates;

CREATE POLICY "email_templates_select_authenticated"
  ON public.email_templates
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "email_templates_insert_managers"
  ON public.email_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_tenant_manager());

CREATE POLICY "email_templates_update_managers"
  ON public.email_templates
  FOR UPDATE
  TO authenticated
  USING (public.is_tenant_manager())
  WITH CHECK (public.is_tenant_manager());

CREATE POLICY "email_templates_delete_managers"
  ON public.email_templates
  FOR DELETE
  TO authenticated
  USING (public.is_tenant_manager());

CREATE POLICY "email_templates_service_role_all"
  ON public.email_templates
  FOR ALL
  TO service_role
  USING ((select auth.jwt())->>'role' = 'service_role')
  WITH CHECK ((select auth.jwt())->>'role' = 'service_role');

DROP POLICY IF EXISTS "Admins can read system settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admins can manage system settings" ON public.system_settings;
DROP POLICY IF EXISTS "system_settings_select_managers" ON public.system_settings;
DROP POLICY IF EXISTS "system_settings_manage_managers" ON public.system_settings;
DROP POLICY IF EXISTS "system_settings_service_role_all" ON public.system_settings;

CREATE POLICY "system_settings_select_managers"
  ON public.system_settings
  FOR SELECT
  TO authenticated
  USING (public.is_tenant_manager());

CREATE POLICY "system_settings_manage_managers"
  ON public.system_settings
  FOR ALL
  TO authenticated
  USING (public.is_tenant_manager())
  WITH CHECK (public.is_tenant_manager());

CREATE POLICY "system_settings_service_role_all"
  ON public.system_settings
  FOR ALL
  TO service_role
  USING ((select auth.jwt())->>'role' = 'service_role')
  WITH CHECK ((select auth.jwt())->>'role' = 'service_role');

-- =============================================================================
-- EXECUTE: alle public SECURITY DEFINER neu vergeben (Onboarding: anon für 3 RPCs)
-- =============================================================================
DO $grant_reset$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS ns,
           p.proname AS pname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosecdef = true
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated, service_role',
      r.ns, r.pname, r.args
    );
  END LOOP;
END;
$grant_reset$;

-- Trigger / intern (kein Client-RPC; postgres als Owner ausführend)
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres;
GRANT EXECUTE ON FUNCTION public.prevent_role_escalation() TO postgres;
GRANT EXECUTE ON FUNCTION public.prevent_last_owner_delete() TO postgres;
GRANT EXECUTE ON FUNCTION public.count_tenant_owners(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.promote_from_waitlist(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.check_course_not_past() TO postgres;
GRANT EXECUTE ON FUNCTION public.check_registration_course_not_past() TO postgres;

-- Edge Functions (Service Role Key)
GRANT EXECUTE ON FUNCTION public.create_password_reset_token(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_verification_token(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_token(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_token_used(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_tokens() TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_public_user(uuid) TO service_role;

-- Eingeloggte App + RLS-Helfer
GRANT EXECUTE ON FUNCTION public.get_my_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_for_course(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_from_course(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_course_participant_counts(uuid[]) TO authenticated;

-- Onboarding vor signUp (Anon-Key im Browser)
GRANT EXECUTE ON FUNCTION public.check_slug_available(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_tenant_onboarding(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_tenant_onboarding(uuid) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.begin_tenant_onboarding(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_tenant_onboarding(uuid) TO service_role;
