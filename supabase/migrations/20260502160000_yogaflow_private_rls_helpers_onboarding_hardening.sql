-- RLS-Hilfsfunktionen in Schema yogaflow_private (nicht PostgREST-exponiert) → Security Advisor 0029 für diese fünf entfällt.
-- Onboarding-RPCs: EXECUTE nur noch service_role (Edge Function onboarding-public); Advisor 0028/0029 für diese drei reduziert.
-- Kurs-RPCs: search_path mit pg_temp (Advisor function_search_path_mutable).

-- =============================================================================
-- 1. Schema yogaflow_private
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS yogaflow_private;

REVOKE ALL ON SCHEMA yogaflow_private FROM PUBLIC;
GRANT USAGE ON SCHEMA yogaflow_private TO authenticated;
GRANT USAGE ON SCHEMA yogaflow_private TO service_role;
GRANT USAGE ON SCHEMA yogaflow_private TO postgres;

-- =============================================================================
-- 2. Hilfsfunktionen (SECURITY DEFINER, gleiche Semantik wie zuvor in public)
-- =============================================================================
CREATE OR REPLACE FUNCTION yogaflow_private.get_my_tenant_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION yogaflow_private.is_tenant_manager()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION yogaflow_private.is_owner()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'owner'
  );
$$;

CREATE OR REPLACE FUNCTION yogaflow_private.is_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role IN ('owner', 'admin', 'teacher')
  );
$$;

CREATE OR REPLACE FUNCTION yogaflow_private.is_admin()
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

REVOKE ALL ON FUNCTION yogaflow_private.get_my_tenant_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION yogaflow_private.is_tenant_manager() FROM PUBLIC;
REVOKE ALL ON FUNCTION yogaflow_private.is_owner() FROM PUBLIC;
REVOKE ALL ON FUNCTION yogaflow_private.is_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION yogaflow_private.is_admin() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION yogaflow_private.get_my_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION yogaflow_private.is_tenant_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION yogaflow_private.is_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION yogaflow_private.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION yogaflow_private.is_admin() TO authenticated;

GRANT EXECUTE ON FUNCTION yogaflow_private.get_my_tenant_id() TO postgres;
GRANT EXECUTE ON FUNCTION yogaflow_private.is_tenant_manager() TO postgres;
GRANT EXECUTE ON FUNCTION yogaflow_private.is_owner() TO postgres;
GRANT EXECUTE ON FUNCTION yogaflow_private.is_staff() TO postgres;
GRANT EXECUTE ON FUNCTION yogaflow_private.is_admin() TO postgres;

-- =============================================================================
-- 3. Policies: public.* → yogaflow_private.*
-- =============================================================================

DROP POLICY IF EXISTS "courses_select_own_tenant" ON public.courses;
CREATE POLICY "courses_select_own_tenant"
  ON public.courses FOR SELECT
  TO authenticated
  USING (tenant_id = yogaflow_private.get_my_tenant_id());

DROP POLICY IF EXISTS "courses_update_own_or_manager" ON public.courses;
CREATE POLICY "courses_update_own_or_manager"
  ON public.courses FOR UPDATE
  TO authenticated
  USING (
    (tenant_id = yogaflow_private.get_my_tenant_id())
    AND ((teacher_id = auth.uid()) OR yogaflow_private.is_tenant_manager())
  )
  WITH CHECK (tenant_id = yogaflow_private.get_my_tenant_id());

DROP POLICY IF EXISTS "managers_delete_courses" ON public.courses;
CREATE POLICY "managers_delete_courses"
  ON public.courses FOR DELETE
  TO authenticated
  USING (
    (tenant_id = yogaflow_private.get_my_tenant_id())
    AND yogaflow_private.is_tenant_manager()
  );

DROP POLICY IF EXISTS "staff_insert_courses" ON public.courses;
CREATE POLICY "staff_insert_courses"
  ON public.courses FOR INSERT
  TO authenticated
  WITH CHECK (
    (tenant_id = yogaflow_private.get_my_tenant_id())
    AND yogaflow_private.is_staff()
  );

DROP POLICY IF EXISTS "email_templates_delete_managers" ON public.email_templates;
CREATE POLICY "email_templates_delete_managers"
  ON public.email_templates FOR DELETE
  TO authenticated
  USING (yogaflow_private.is_tenant_manager());

DROP POLICY IF EXISTS "email_templates_insert_managers" ON public.email_templates;
CREATE POLICY "email_templates_insert_managers"
  ON public.email_templates FOR INSERT
  TO authenticated
  WITH CHECK (yogaflow_private.is_tenant_manager());

DROP POLICY IF EXISTS "email_templates_update_managers" ON public.email_templates;
CREATE POLICY "email_templates_update_managers"
  ON public.email_templates FOR UPDATE
  TO authenticated
  USING (yogaflow_private.is_tenant_manager())
  WITH CHECK (yogaflow_private.is_tenant_manager());

DROP POLICY IF EXISTS "settings_manage_managers" ON public.global_settings;
CREATE POLICY "settings_manage_managers"
  ON public.global_settings FOR ALL
  TO authenticated
  USING (yogaflow_private.is_tenant_manager())
  WITH CHECK (yogaflow_private.is_tenant_manager());

DROP POLICY IF EXISTS "messages_insert_own_tenant" ON public.messages;
CREATE POLICY "messages_insert_own_tenant"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    (tenant_id = yogaflow_private.get_my_tenant_id())
    AND (sender_id = auth.uid())
  );

DROP POLICY IF EXISTS "messages_select_own_tenant" ON public.messages;
CREATE POLICY "messages_select_own_tenant"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    (tenant_id = yogaflow_private.get_my_tenant_id())
    AND ((recipient_id = auth.uid()) OR (sender_id = auth.uid()) OR is_broadcast)
  );

DROP POLICY IF EXISTS "messages_update_own" ON public.messages;
CREATE POLICY "messages_update_own"
  ON public.messages FOR UPDATE
  TO authenticated
  USING (
    (tenant_id = yogaflow_private.get_my_tenant_id())
    AND (recipient_id = auth.uid())
  )
  WITH CHECK (tenant_id = yogaflow_private.get_my_tenant_id());

DROP POLICY IF EXISTS "registrations_delete" ON public.registrations;
CREATE POLICY "registrations_delete"
  ON public.registrations FOR DELETE
  TO authenticated
  USING (
    (tenant_id = yogaflow_private.get_my_tenant_id())
    AND ((user_id = auth.uid()) OR yogaflow_private.is_tenant_manager())
  );

DROP POLICY IF EXISTS "registrations_insert_own" ON public.registrations;
CREATE POLICY "registrations_insert_own"
  ON public.registrations FOR INSERT
  TO authenticated
  WITH CHECK (
    (tenant_id = yogaflow_private.get_my_tenant_id())
    AND (user_id = auth.uid())
  );

DROP POLICY IF EXISTS "registrations_select" ON public.registrations;
CREATE POLICY "registrations_select"
  ON public.registrations FOR SELECT
  TO authenticated
  USING (
    (tenant_id = yogaflow_private.get_my_tenant_id())
    AND ((user_id = auth.uid()) OR yogaflow_private.is_staff())
  );

DROP POLICY IF EXISTS "registrations_update_manager" ON public.registrations;
CREATE POLICY "registrations_update_manager"
  ON public.registrations FOR UPDATE
  TO authenticated
  USING (
    (tenant_id = yogaflow_private.get_my_tenant_id())
    AND yogaflow_private.is_tenant_manager()
  )
  WITH CHECK (tenant_id = yogaflow_private.get_my_tenant_id());

DROP POLICY IF EXISTS "system_settings_manage_managers" ON public.system_settings;
CREATE POLICY "system_settings_manage_managers"
  ON public.system_settings FOR ALL
  TO authenticated
  USING (yogaflow_private.is_tenant_manager())
  WITH CHECK (yogaflow_private.is_tenant_manager());

DROP POLICY IF EXISTS "system_settings_select_managers" ON public.system_settings;
CREATE POLICY "system_settings_select_managers"
  ON public.system_settings FOR SELECT
  TO authenticated
  USING (yogaflow_private.is_tenant_manager());

DROP POLICY IF EXISTS "managers_delete_tenant_users" ON public.users;
CREATE POLICY "managers_delete_tenant_users"
  ON public.users FOR DELETE
  TO authenticated
  USING (
    (tenant_id = yogaflow_private.get_my_tenant_id())
    AND yogaflow_private.is_tenant_manager()
    AND (id <> auth.uid())
    AND (role <> 'owner'::text)
  );

DROP POLICY IF EXISTS "managers_update_tenant_users" ON public.users;
CREATE POLICY "managers_update_tenant_users"
  ON public.users FOR UPDATE
  TO authenticated
  USING (
    (tenant_id = yogaflow_private.get_my_tenant_id())
    AND yogaflow_private.is_tenant_manager()
    AND (id <> auth.uid())
  )
  WITH CHECK (tenant_id = yogaflow_private.get_my_tenant_id());

DROP POLICY IF EXISTS "users_select_same_tenant" ON public.users;
CREATE POLICY "users_select_same_tenant"
  ON public.users FOR SELECT
  TO authenticated
  USING (tenant_id = yogaflow_private.get_my_tenant_id());

-- =============================================================================
-- 4. public.get_course_participant_counts: yogaflow_private + search_path pg_temp
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_course_participant_counts(p_course_ids uuid[])
RETURNS TABLE (
  course_id uuid,
  registered_count bigint,
  waitlist_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  v_tenant := yogaflow_private.get_my_tenant_id();

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
-- 5. Kurs-Anmeldung: search_path pg_temp
-- =============================================================================
CREATE OR REPLACE FUNCTION public.register_for_course(
  p_course_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_max_participants integer;
  v_course_date date;
  v_course_status text;
  v_current_count integer;
  v_next_position integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Bitte melden Sie sich an.'
    );
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id <> v_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Nicht autorisiert.'
    );
  END IF;

  SELECT max_participants, date, status
  INTO v_max_participants, v_course_date, v_course_status
  FROM courses
  WHERE id = p_course_id;

  IF NOT FOUND OR v_max_participants IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Kurs nicht gefunden.'
    );
  END IF;

  IF v_course_date < CURRENT_DATE THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Anmeldung für vergangene Kurse ist nicht möglich.'
    );
  END IF;

  IF lower(trim(coalesce(v_course_status, 'active'))) IN (
    'canceled', 'cancelled', 'not_planned'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Dieser Kurs ist nicht zur Anmeldung verfügbar.'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM registrations
    WHERE course_id = p_course_id
      AND user_id = v_user_id
      AND cancellation_timestamp IS NULL
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Sie sind für diesen Kurs bereits angemeldet oder stehen auf der Warteliste.'
    );
  END IF;

  SELECT COUNT(*) INTO v_current_count
  FROM registrations
  WHERE course_id = p_course_id
    AND status = 'registered'
    AND is_waitlist = false
    AND cancellation_timestamp IS NULL;

  IF v_current_count >= v_max_participants THEN
    SELECT COALESCE(MAX(waitlist_position), 0) + 1 INTO v_next_position
    FROM registrations
    WHERE course_id = p_course_id
      AND is_waitlist = true
      AND cancellation_timestamp IS NULL;

    INSERT INTO registrations (
      user_id,
      course_id,
      status,
      is_waitlist,
      waitlist_position
    )
    VALUES (
      v_user_id,
      p_course_id,
      'waitlist',
      true,
      v_next_position
    );

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Sie wurden auf die Warteliste gesetzt.',
      'waitlist_position', v_next_position,
      'is_waitlist', true
    );
  END IF;

  INSERT INTO registrations (
    user_id,
    course_id,
    status,
    is_waitlist,
    waitlist_position
  )
  VALUES (
    v_user_id,
    p_course_id,
    'registered',
    false,
    NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Erfolgreich angemeldet.',
    'is_waitlist', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.unregister_from_course(
  p_course_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_registration_status public.registration_status;
  v_waitlist_user_id uuid;
  v_waitlist_registration_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Bitte melden Sie sich an.'
    );
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id <> v_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Nicht autorisiert.'
    );
  END IF;

  SELECT status INTO v_registration_status
  FROM registrations
  WHERE course_id = p_course_id
    AND user_id = v_user_id
    AND cancellation_timestamp IS NULL;

  IF v_registration_status IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Keine aktive Anmeldung für diesen Kurs gefunden.'
    );
  END IF;

  DELETE FROM registrations
  WHERE course_id = p_course_id
    AND user_id = v_user_id;

  IF v_registration_status = 'registered' THEN
    SELECT user_id, id
    INTO v_waitlist_user_id, v_waitlist_registration_id
    FROM registrations
    WHERE course_id = p_course_id
      AND status = 'waitlist'
      AND cancellation_timestamp IS NULL
    ORDER BY waitlist_position ASC NULLS LAST, signup_timestamp ASC NULLS LAST, id ASC
    LIMIT 1
    FOR UPDATE;

    IF v_waitlist_user_id IS NOT NULL THEN
      UPDATE registrations
      SET
        status = 'registered',
        is_waitlist = false,
        waitlist_position = NULL
      WHERE id = v_waitlist_registration_id;

      RETURN jsonb_build_object(
        'success', true,
        'message',
        'Abgemeldet. Ein Wartelisten-Teilnehmer wurde nachgerückt.',
        'promoted_user_id', v_waitlist_user_id
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Erfolgreich abgemeldet.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_for_course(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_from_course(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_course_participant_counts(uuid[]) TO authenticated;

-- =============================================================================
-- 6. Alte public-Hilfsfunktionen entfernen (kein PostgREST-RPC mehr)
-- =============================================================================
DROP FUNCTION IF EXISTS public.get_my_tenant_id();
DROP FUNCTION IF EXISTS public.is_tenant_manager();
DROP FUNCTION IF EXISTS public.is_owner();
DROP FUNCTION IF EXISTS public.is_staff();
DROP FUNCTION IF EXISTS public.is_admin();

-- =============================================================================
-- 7. Onboarding: nur service_role (Edge „onboarding-public“)
-- =============================================================================
REVOKE ALL ON FUNCTION public.check_slug_available(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.begin_tenant_onboarding(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_tenant_onboarding(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.check_slug_available(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_tenant_onboarding(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_tenant_onboarding(uuid) TO service_role;
