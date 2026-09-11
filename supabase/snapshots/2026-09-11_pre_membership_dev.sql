-- Schema-Schnappschuss vor Mehrfachmitgliedschaft (Stufe 0 live).
-- Zweck: Referenz-Rückweg vor Mehrfachmitgliedschaft.
-- Quelle: DEV mufxhtctutfpzklwqnze (https://mufxhtctutfpzklwqnze.supabase.co)
-- Zeitpunkt: 2026-09-11 14:55:48 Europe/Berlin (2026-09-11 12:55:48+00)
-- Nicht blind ausführen. Keine Daten enthalten.
-- Liegt bewusst nicht unter supabase/migrations/.

-- ===== POLICIES public =====

DROP POLICY IF EXISTS admin_emails_select_authenticated ON public.admin_emails;
CREATE POLICY admin_emails_select_authenticated ON public.admin_emails
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS admin_emails_service_role_all ON public.admin_emails;
CREATE POLICY admin_emails_service_role_all ON public.admin_emails
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (((( SELECT auth.jwt() AS jwt) ->> 'role'::text) = 'service_role'::text))
  WITH CHECK (((( SELECT auth.jwt() AS jwt) ->> 'role'::text) = 'service_role'::text));

DROP POLICY IF EXISTS "Service role can manage all tokens" ON public.auth_tokens;
CREATE POLICY "Service role can manage all tokens" ON public.auth_tokens
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (((( SELECT auth.jwt() AS jwt) ->> 'role'::text) = 'service_role'::text))
  WITH CHECK (((( SELECT auth.jwt() AS jwt) ->> 'role'::text) = 'service_role'::text));

DROP POLICY IF EXISTS courses_select_own_tenant ON public.courses;
CREATE POLICY courses_select_own_tenant ON public.courses
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((tenant_id = yogaflow_private.get_my_tenant_id()));

DROP POLICY IF EXISTS courses_update_own_or_manager ON public.courses;
CREATE POLICY courses_update_own_or_manager ON public.courses
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((tenant_id = yogaflow_private.get_my_tenant_id()) AND ((teacher_id = auth.uid()) OR yogaflow_private.is_tenant_manager())))
  WITH CHECK ((tenant_id = yogaflow_private.get_my_tenant_id()));

DROP POLICY IF EXISTS managers_delete_courses ON public.courses;
CREATE POLICY managers_delete_courses ON public.courses
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((tenant_id = yogaflow_private.get_my_tenant_id()) AND yogaflow_private.is_tenant_manager()));

DROP POLICY IF EXISTS staff_insert_courses ON public.courses;
CREATE POLICY staff_insert_courses ON public.courses
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((tenant_id = yogaflow_private.get_my_tenant_id()) AND yogaflow_private.is_staff()));

DROP POLICY IF EXISTS email_templates_delete_managers ON public.email_templates;
CREATE POLICY email_templates_delete_managers ON public.email_templates
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (yogaflow_private.is_tenant_manager());

DROP POLICY IF EXISTS email_templates_insert_managers ON public.email_templates;
CREATE POLICY email_templates_insert_managers ON public.email_templates
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (yogaflow_private.is_tenant_manager());

DROP POLICY IF EXISTS email_templates_select_authenticated ON public.email_templates;
CREATE POLICY email_templates_select_authenticated ON public.email_templates
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS email_templates_service_role_all ON public.email_templates;
CREATE POLICY email_templates_service_role_all ON public.email_templates
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (((( SELECT auth.jwt() AS jwt) ->> 'role'::text) = 'service_role'::text))
  WITH CHECK (((( SELECT auth.jwt() AS jwt) ->> 'role'::text) = 'service_role'::text));

DROP POLICY IF EXISTS email_templates_update_managers ON public.email_templates;
CREATE POLICY email_templates_update_managers ON public.email_templates
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (yogaflow_private.is_tenant_manager())
  WITH CHECK (yogaflow_private.is_tenant_manager());

DROP POLICY IF EXISTS settings_manage_managers ON public.global_settings;
CREATE POLICY settings_manage_managers ON public.global_settings
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (yogaflow_private.is_tenant_manager())
  WITH CHECK (yogaflow_private.is_tenant_manager());

DROP POLICY IF EXISTS settings_select_authenticated ON public.global_settings;
CREATE POLICY settings_select_authenticated ON public.global_settings
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS messages_delete_own ON public.messages;
CREATE POLICY messages_delete_own ON public.messages
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((tenant_id = yogaflow_private.get_my_tenant_id()) AND ((sender_id = auth.uid()) OR (recipient_id = auth.uid()))));

DROP POLICY IF EXISTS messages_insert_own_tenant ON public.messages;
CREATE POLICY messages_insert_own_tenant ON public.messages
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((tenant_id = yogaflow_private.get_my_tenant_id()) AND (sender_id = auth.uid())));

DROP POLICY IF EXISTS messages_select_own_tenant ON public.messages;
CREATE POLICY messages_select_own_tenant ON public.messages
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((tenant_id = yogaflow_private.get_my_tenant_id()) AND ((recipient_id = auth.uid()) OR (sender_id = auth.uid()) OR is_broadcast)));

DROP POLICY IF EXISTS messages_update_own ON public.messages;
CREATE POLICY messages_update_own ON public.messages
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((tenant_id = yogaflow_private.get_my_tenant_id()) AND (recipient_id = auth.uid())))
  WITH CHECK ((tenant_id = yogaflow_private.get_my_tenant_id()));

DROP POLICY IF EXISTS registrations_delete ON public.registrations;
CREATE POLICY registrations_delete ON public.registrations
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((tenant_id = yogaflow_private.get_my_tenant_id()) AND ((user_id = auth.uid()) OR yogaflow_private.is_tenant_manager())));

DROP POLICY IF EXISTS registrations_insert_own ON public.registrations;
CREATE POLICY registrations_insert_own ON public.registrations
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((tenant_id = yogaflow_private.get_my_tenant_id()) AND (user_id = auth.uid())));

DROP POLICY IF EXISTS registrations_select ON public.registrations;
CREATE POLICY registrations_select ON public.registrations
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((tenant_id = yogaflow_private.get_my_tenant_id()) AND ((user_id = auth.uid()) OR yogaflow_private.is_staff())));

DROP POLICY IF EXISTS registrations_update_manager ON public.registrations;
CREATE POLICY registrations_update_manager ON public.registrations
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((tenant_id = yogaflow_private.get_my_tenant_id()) AND yogaflow_private.is_tenant_manager()))
  WITH CHECK ((tenant_id = yogaflow_private.get_my_tenant_id()));

DROP POLICY IF EXISTS reserved_slugs_public_read ON public.reserved_slugs;
CREATE POLICY reserved_slugs_public_read ON public.reserved_slugs
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS system_settings_manage_managers ON public.system_settings;
CREATE POLICY system_settings_manage_managers ON public.system_settings
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (yogaflow_private.is_tenant_manager())
  WITH CHECK (yogaflow_private.is_tenant_manager());

DROP POLICY IF EXISTS system_settings_select_managers ON public.system_settings;
CREATE POLICY system_settings_select_managers ON public.system_settings
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (yogaflow_private.is_tenant_manager());

DROP POLICY IF EXISTS system_settings_service_role_all ON public.system_settings;
CREATE POLICY system_settings_service_role_all ON public.system_settings
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (((( SELECT auth.jwt() AS jwt) ->> 'role'::text) = 'service_role'::text))
  WITH CHECK (((( SELECT auth.jwt() AS jwt) ->> 'role'::text) = 'service_role'::text));

DROP POLICY IF EXISTS "Tenants sind öffentlich lesbar" ON public.tenants;
CREATE POLICY "Tenants sind öffentlich lesbar" ON public.tenants
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS tenants_select_anon_slug_resolve ON public.tenants;
CREATE POLICY tenants_select_anon_slug_resolve ON public.tenants
  AS PERMISSIVE
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Users can mark own notifications read" ON public.user_notifications;
CREATE POLICY "Users can mark own notifications read" ON public.user_notifications
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view own notifications" ON public.user_notifications;
CREATE POLICY "Users can view own notifications" ON public.user_notifications
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((user_id = auth.uid()));

DROP POLICY IF EXISTS managers_delete_tenant_users ON public.users;
CREATE POLICY managers_delete_tenant_users ON public.users
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((tenant_id = yogaflow_private.get_my_tenant_id()) AND yogaflow_private.is_tenant_manager() AND (id <> auth.uid()) AND (role <> 'owner'::text)));

DROP POLICY IF EXISTS managers_update_tenant_users ON public.users;
CREATE POLICY managers_update_tenant_users ON public.users
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((tenant_id = yogaflow_private.get_my_tenant_id()) AND yogaflow_private.is_tenant_manager() AND (id <> auth.uid())))
  WITH CHECK ((tenant_id = yogaflow_private.get_my_tenant_id()));

DROP POLICY IF EXISTS users_select_managers ON public.users;
CREATE POLICY users_select_managers ON public.users
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((tenant_id = yogaflow_private.get_my_tenant_id()) AND yogaflow_private.is_tenant_manager()));

DROP POLICY IF EXISTS users_select_own ON public.users;
CREATE POLICY users_select_own ON public.users
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((id = auth.uid()));

DROP POLICY IF EXISTS users_select_participant_staff ON public.users;
CREATE POLICY users_select_participant_staff ON public.users
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((tenant_id = yogaflow_private.get_my_tenant_id()) AND yogaflow_private.is_participant() AND (role = ANY (ARRAY['teacher'::text, 'admin'::text, 'owner'::text]))));

DROP POLICY IF EXISTS users_select_teacher_participants ON public.users;
CREATE POLICY users_select_teacher_participants ON public.users
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((tenant_id = yogaflow_private.get_my_tenant_id()) AND yogaflow_private.is_teacher() AND (role = 'user'::text)));

DROP POLICY IF EXISTS users_select_teacher_staff ON public.users;
CREATE POLICY users_select_teacher_staff ON public.users
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((tenant_id = yogaflow_private.get_my_tenant_id()) AND yogaflow_private.is_teacher() AND (role = ANY (ARRAY['teacher'::text, 'admin'::text, 'owner'::text]))));

DROP POLICY IF EXISTS users_update_own_profile ON public.users;
CREATE POLICY users_update_own_profile ON public.users
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((id = auth.uid()))
  WITH CHECK ((id = auth.uid()));

-- ===== FUNCTIONS public + yogaflow_private =====

CREATE OR REPLACE FUNCTION public.admin_register_user_for_course(p_user_id uuid, p_course_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id           uuid;
  v_actor_role         text;
  v_actor_tenant       uuid;
  v_course_tenant      uuid;
  v_teacher_id         uuid;
  v_max_participants   integer;
  v_course_date        date;
  v_course_title       text;
  v_course_time        time;
  v_current_count      integer;
  v_next_position      integer;
  v_notification_body  text;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT role, tenant_id INTO v_actor_role, v_actor_tenant
  FROM public.users WHERE id = v_actor_id;

  IF v_actor_role NOT IN ('owner', 'admin', 'teacher') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions');
  END IF;

  SELECT tenant_id, teacher_id, max_participants, date, title, time
  INTO v_course_tenant, v_teacher_id, v_max_participants, v_course_date, v_course_title, v_course_time
  FROM public.courses WHERE id = p_course_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Course not found');
  END IF;

  IF v_course_tenant IS DISTINCT FROM v_actor_tenant THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cross-tenant operation not allowed');
  END IF;

  IF v_actor_role = 'teacher' AND v_teacher_id IS DISTINCT FROM v_actor_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Teachers can only add participants to their own courses');
  END IF;

  IF p_user_id IS NOT DISTINCT FROM v_teacher_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Course teachers cannot be added as participants to their own course');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_user_id
      AND tenant_id = v_actor_tenant
      AND role IN ('user', 'teacher')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user not found or not a participant');
  END IF;

  IF v_course_date < CURRENT_DATE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot register for past courses');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.registrations
    WHERE course_id = p_course_id
      AND user_id = p_user_id
      AND cancellation_timestamp IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_registered');
  END IF;

  SELECT COUNT(*) INTO v_current_count
  FROM public.registrations
  WHERE course_id = p_course_id
    AND status = 'registered'
    AND is_waitlist = false
    AND cancellation_timestamp IS NULL;

  IF v_current_count >= v_max_participants THEN
    SELECT COUNT(*)::integer + 1 INTO v_next_position
    FROM public.registrations
    WHERE course_id = p_course_id
      AND is_waitlist = true
      AND status = 'waitlist'
      AND cancellation_timestamp IS NULL;

    INSERT INTO public.registrations (user_id, course_id, tenant_id, status, is_waitlist, waitlist_position)
    VALUES (p_user_id, p_course_id, v_actor_tenant, 'waitlist', true, v_next_position);

    v_notification_body := format(
      'Du wurdest für den Kurs "%s" auf die Warteliste gesetzt (Platz %s).',
      v_course_title,
      v_next_position
    );

    INSERT INTO public.user_notifications (
      tenant_id, user_id, type, body, course_id, action_path, metadata
    ) VALUES (
      v_actor_tenant,
      p_user_id,
      'course_waitlisted',
      v_notification_body,
      p_course_id,
      '/my-courses',
      jsonb_build_object('added_by_user_id', v_actor_id, 'waitlist_position', v_next_position)
    );

    RETURN jsonb_build_object(
      'success', true,
      'on_waitlist', true,
      'waitlist_position', v_next_position
    );
  ELSE
    INSERT INTO public.registrations (user_id, course_id, tenant_id, status, is_waitlist)
    VALUES (p_user_id, p_course_id, v_actor_tenant, 'registered', false);

    v_notification_body := format(
      'Du wurdest zum Kurs "%s" am %s um %s hinzugefügt.',
      v_course_title,
      to_char(v_course_date, 'DD.MM.YYYY'),
      to_char(v_course_time, 'HH24:MI')
    );

    INSERT INTO public.user_notifications (
      tenant_id, user_id, type, body, course_id, action_path, metadata
    ) VALUES (
      v_actor_tenant,
      p_user_id,
      'course_added',
      v_notification_body,
      p_course_id,
      '/my-courses',
      jsonb_build_object('added_by_user_id', v_actor_id)
    );

    RETURN jsonb_build_object('success', true, 'on_waitlist', false);
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.admin_unregister_user_from_course(p_user_id uuid, p_course_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor_id                 uuid;
  v_actor_role               text;
  v_actor_tenant             uuid;
  v_course_tenant            uuid;
  v_teacher_id               uuid;
  v_course_date              date;
  v_course_title             text;
  v_course_time              time;
  v_registration_status      public.registration_status;
  v_registration_is_waitlist boolean;
  v_was_registered           boolean;
  v_waitlist_user_id         uuid;
  v_notification_body        text;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT role, tenant_id INTO v_actor_role, v_actor_tenant
  FROM public.users WHERE id = v_actor_id;

  IF v_actor_role NOT IN ('owner', 'admin', 'teacher') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions');
  END IF;

  SELECT tenant_id, teacher_id, date, title, time
  INTO v_course_tenant, v_teacher_id, v_course_date, v_course_title, v_course_time
  FROM public.courses WHERE id = p_course_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Course not found');
  END IF;

  IF v_course_tenant IS DISTINCT FROM v_actor_tenant THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cross-tenant operation not allowed');
  END IF;

  IF v_actor_role = 'teacher' AND v_teacher_id IS DISTINCT FROM v_actor_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Teachers can only unregister participants from their own courses');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_user_id
      AND tenant_id = v_actor_tenant
      AND role IN ('user', 'teacher')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user not found or not a participant');
  END IF;

  IF v_course_date < CURRENT_DATE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot unregister from past courses');
  END IF;

  SELECT status, is_waitlist
  INTO v_registration_status, v_registration_is_waitlist
  FROM public.registrations
  WHERE course_id = p_course_id
    AND user_id = p_user_id
    AND cancellation_timestamp IS NULL;

  IF v_registration_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_registered');
  END IF;

  IF v_actor_role = 'teacher'
     AND (v_registration_is_waitlist OR v_registration_status <> 'registered') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Teachers can only unregister active participants from their own courses'
    );
  END IF;

  v_was_registered := (v_registration_status = 'registered' AND NOT v_registration_is_waitlist);

  IF v_was_registered THEN
    SELECT user_id
    INTO v_waitlist_user_id
    FROM public.registrations
    WHERE course_id = p_course_id
      AND status = 'waitlist'
      AND is_waitlist = true
      AND cancellation_timestamp IS NULL
    ORDER BY waitlist_position ASC NULLS LAST, signup_timestamp ASC NULLS LAST, id ASC
    LIMIT 1;
  END IF;

  DELETE FROM public.registrations
  WHERE course_id = p_course_id
    AND user_id = p_user_id;

  PERFORM public.compact_waitlist_positions(p_course_id);

  v_notification_body := format(
    'Du wurdest vom Kurs "%s" am %s um %s abgemeldet.',
    v_course_title,
    to_char(v_course_date, 'DD.MM.YYYY'),
    to_char(v_course_time, 'HH24:MI')
  );

  INSERT INTO public.user_notifications (
    tenant_id, user_id, type, body, course_id, action_path, metadata
  ) VALUES (
    v_actor_tenant,
    p_user_id,
    'course_removed',
    v_notification_body,
    p_course_id,
    '/my-courses',
    jsonb_build_object('removed_by_user_id', v_actor_id)
  );

  IF v_was_registered AND v_waitlist_user_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Teilnehmer abgemeldet. Ein Wartelisten-Teilnehmer wurde nachgerückt.',
      'promoted_user_id', v_waitlist_user_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Teilnehmer erfolgreich abgemeldet.'
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.begin_tenant_onboarding(p_name text, p_slug text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
BEGIN
  -- Validierungen (redundant zu DB-Constraints, aber bessere Fehlermeldungen)
  IF TRIM(p_name) = '' THEN
    RETURN json_build_object('success', false, 'error', 'invalid_name',
      'message', 'Studio-Name darf nicht leer sein.');
  END IF;

  IF p_slug !~ '^[a-z0-9]+$' THEN
    RETURN json_build_object('success', false, 'error', 'invalid_format',
      'message', 'Nur Kleinbuchstaben und Zahlen erlaubt.');
  END IF;

  IF LENGTH(p_slug) < 3 OR LENGTH(p_slug) > 30 THEN
    RETURN json_build_object('success', false, 'error', 'invalid_length',
      'message', 'Der Name muss zwischen 3 und 30 Zeichen lang sein.');
  END IF;

  IF EXISTS (SELECT 1 FROM public.reserved_slugs WHERE slug = p_slug) THEN
    RETURN json_build_object('success', false, 'error', 'reserved_slug',
      'message', 'Dieser Name ist nicht erlaubt.');
  END IF;

  IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = p_slug) THEN
    RETURN json_build_object('success', false, 'error', 'slug_taken',
      'message', 'Dieser Name ist bereits vergeben. Bitte wähle einen anderen.');
  END IF;

  INSERT INTO public.tenants (name, slug)
  VALUES (TRIM(p_name), p_slug)
  RETURNING id INTO v_tenant_id;

  RETURN json_build_object('success', true, 'tenant_id', v_tenant_id);

EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'error', 'slug_taken',
      'message', 'Dieser Name ist bereits vergeben. Bitte wähle einen anderen.');
  WHEN others THEN
    RAISE LOG 'begin_tenant_onboarding error: %', SQLERRM;
    RETURN json_build_object('success', false, 'error', 'server_error',
      'message', 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.');
END;
$function$


CREATE OR REPLACE FUNCTION public.cancel_tenant_onboarding(p_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.tenants
  WHERE id = p_tenant_id
    AND NOT EXISTS (
      SELECT 1 FROM public.users WHERE tenant_id = p_tenant_id
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.check_course_not_past()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot create or modify courses with past dates';
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.check_registration_course_not_past()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_course_date date;
BEGIN
  -- Get the course date via the course_id
  SELECT date INTO v_course_date
  FROM courses
  WHERE id = NEW.course_id;
  
  -- Check if course date is in the past
  IF v_course_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot register for courses in the past';
  END IF;
  
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.check_slug_available(p_slug text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_slug !~ '^[a-z0-9]+$'                        THEN RETURN false; END IF;
  IF LENGTH(p_slug) < 3 OR LENGTH(p_slug) > 30       THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.reserved_slugs WHERE slug = p_slug) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.tenants      WHERE slug = p_slug) THEN RETURN false; END IF;
  RETURN true;
END;
$function$


CREATE OR REPLACE FUNCTION public.check_tenant_slug_not_reserved()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.reserved_slugs WHERE slug = NEW.slug) THEN
    RAISE EXCEPTION 'reserved_slug: Dieser Name ist nicht erlaubt.';
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.cleanup_expired_tokens()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM auth_tokens WHERE expires_at < now();
END;
$function$


CREATE OR REPLACE FUNCTION public.cleanup_future_registrations_on_role_upgrade()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.role = 'user'
     AND NEW.role IN ('admin', 'owner')
     AND NEW.id IS NOT NULL
  THEN
    DELETE FROM public.registrations r
    USING public.courses c
    WHERE r.course_id = c.id
      AND r.user_id = NEW.id
      AND c.tenant_id = NEW.tenant_id
      AND r.cancellation_timestamp IS NULL;
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.close_past_course_registrations()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_updated_count integer := 0;
BEGIN
  UPDATE public.registrations r
  SET cancellation_timestamp = NOW()
  FROM public.courses c
  WHERE r.course_id = c.id
    AND r.cancellation_timestamp IS NULL
    AND r.status IN ('registered', 'waitlist')
    AND (
      c.date::timestamp
      + COALESCE(NULLIF(c.time, '')::time, TIME '00:00')
    ) < NOW();

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$function$


CREATE OR REPLACE FUNCTION public.compact_waitlist_positions(p_course_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_course_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM 1
  FROM public.registrations
  WHERE course_id = p_course_id
    AND is_waitlist = true
    AND cancellation_timestamp IS NULL
  ORDER BY id
  FOR UPDATE;

  WITH ranked AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        ORDER BY waitlist_position ASC NULLS LAST, signup_timestamp ASC NULLS LAST, id ASC
      )::integer AS new_pos
    FROM public.registrations
    WHERE course_id = p_course_id
      AND is_waitlist = true
      AND status = 'waitlist'
      AND cancellation_timestamp IS NULL
  )
  UPDATE public.registrations r
  SET waitlist_position = ranked.new_pos
  FROM ranked
  WHERE r.id = ranked.id
    AND r.waitlist_position IS DISTINCT FROM ranked.new_pos;
END;
$function$


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
  WHERE id = p_user_id;

  UPDATE auth_tokens
  SET used = true
  WHERE token = p_token;
END;
$function$


CREATE OR REPLACE FUNCTION public.count_tenant_owners(p_tenant_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)::integer
  FROM public.users
  WHERE tenant_id = p_tenant_id
    AND role = 'owner';
$function$


CREATE OR REPLACE FUNCTION public.create_password_reset_token(p_user_id uuid, p_email text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$


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
  WHERE  id             = p_user_id
    AND  email_verified = true;

  -- Neuen Token generieren (32 Bytes = 64 Hex-Zeichen, 24 h gültig)
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO auth_tokens (user_id, token, type, expires_at)
  VALUES (p_user_id, v_token, 'email_verification', now() + interval '24 hours');

  RETURN v_token;
END;
$function$


CREATE OR REPLACE FUNCTION public.delete_tenant_complete(p_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND: Kein Tenant mit dieser ID.'
      USING ERRCODE = 'P0002';
  END IF;

  ALTER TABLE public.users DISABLE TRIGGER prevent_last_owner_delete;
  BEGIN
    DELETE FROM public.tenants WHERE id = p_tenant_id;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.users ENABLE TRIGGER prevent_last_owner_delete;
    RAISE;
  END;

  ALTER TABLE public.users ENABLE TRIGGER prevent_last_owner_delete;
END;
$function$


CREATE OR REPLACE FUNCTION public.ensure_public_user(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$


CREATE OR REPLACE FUNCTION public.get_course_participant_counts(p_course_ids uuid[])
 RETURNS TABLE(course_id uuid, registered_count bigint, waitlist_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$


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
    id, email, tenant_id, role,
    first_name, last_name,
    street, house_number, postal_code, city, phone
  )
  VALUES (
    NEW.id,
    NEW.email,
    (NEW.raw_user_meta_data->>'tenant_id')::uuid,
    v_role,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name',  ''),
    COALESCE(NEW.raw_user_meta_data->>'street',       NULL),
    COALESCE(NEW.raw_user_meta_data->>'house_number', NULL),
    COALESCE(NEW.raw_user_meta_data->>'postal_code',  NULL),
    COALESCE(NEW.raw_user_meta_data->>'city',         NULL),
    COALESCE(NEW.raw_user_meta_data->>'phone',        NULL)
  );
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.mark_token_used(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE auth_tokens SET used = true WHERE token = p_token;
END;
$function$


CREATE OR REPLACE FUNCTION public.prevent_last_owner_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner_count integer;
  v_user_count integer;
BEGIN
  IF OLD.role = 'owner' THEN
    v_owner_count := public.count_tenant_owners(OLD.tenant_id);
    IF v_owner_count <= 1 THEN
      SELECT COUNT(*)::integer
      INTO v_user_count
      FROM public.users
      WHERE tenant_id = OLD.tenant_id;

      -- Noch andere Profile im Mandanten (außer der Zeile, die gerade gelöscht wird)?
      IF v_user_count > 1 THEN
        RAISE EXCEPTION 'LAST_OWNER_REQUIRED: at least one owner must remain in this studio';
      END IF;
    END IF;
  END IF;

  RETURN OLD;
END;
$function$


CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_role text;
  v_actor_tenant uuid;
  v_owner_count integer;
BEGIN
  IF OLD.role IS NOT DISTINCT FROM NEW.role THEN
    RETURN NEW;
  END IF;

  SELECT role, tenant_id
  INTO v_actor_role, v_actor_tenant
  FROM public.users
  WHERE id = auth.uid();

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
$function$


CREATE OR REPLACE FUNCTION public.prevent_tenants_slug_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.slug IS DISTINCT FROM NEW.slug THEN
    RAISE EXCEPTION 'tenant slug cannot be changed';
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.promote_from_waitlist(p_course_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_max_participants integer;
  v_current_count integer;
  v_next_user record;
  v_course_title text;
  v_course_date date;
  v_course_time time;
  v_teacher_id uuid;
  v_message_content text;
BEGIN
  SELECT max_participants, title, date, time, teacher_id
  INTO v_max_participants, v_course_title, v_course_date, v_course_time, v_teacher_id
  FROM public.courses
  WHERE id = p_course_id;

  SELECT COUNT(*) INTO v_current_count
  FROM public.registrations
  WHERE course_id = p_course_id
    AND status = 'registered'
    AND is_waitlist = false
    AND cancellation_timestamp IS NULL;

  WHILE v_current_count < v_max_participants LOOP
    SELECT id, user_id, waitlist_position INTO v_next_user
    FROM public.registrations
    WHERE course_id = p_course_id
      AND is_waitlist = true
      AND status = 'waitlist'
      AND cancellation_timestamp IS NULL
    ORDER BY waitlist_position ASC
    LIMIT 1;

    EXIT WHEN v_next_user.id IS NULL;

    UPDATE public.registrations
    SET status = 'registered',
        is_waitlist = false,
        waitlist_position = NULL,
        registered_at = now()
    WHERE id = v_next_user.id;

    v_message_content := format(
      'Du hast Glück und einen Platz im Kurs "%s" am %s um %s bekommen.',
      v_course_title,
      to_char(v_course_date, 'DD.MM.YYYY'),
      to_char(v_course_time, 'HH24:MI')
    );

    INSERT INTO public.messages (
      course_id,
      sender_id,
      recipient_id,
      content,
      is_broadcast,
      read
    ) VALUES (
      p_course_id,
      v_teacher_id,
      v_next_user.user_id,
      v_message_content,
      false,
      false
    );

    v_current_count := v_current_count + 1;
  END LOOP;

  PERFORM public.compact_waitlist_positions(p_course_id);
END;
$function$


CREATE OR REPLACE FUNCTION public.register_for_course(p_course_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_user_role text;
  v_course_tenant uuid;
  v_max_participants integer;
  v_course_date date;
  v_course_status text;
  v_teacher_id uuid;
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

  SELECT tenant_id, role
  INTO v_tenant_id, v_user_role
  FROM public.users
  WHERE id = v_user_id;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Kein Tenant für Benutzer gefunden.'
    );
  END IF;

  IF v_user_role NOT IN ('user', 'teacher') THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Owner und Admins können sich nicht für Kurse anmelden.'
    );
  END IF;

  SELECT tenant_id, max_participants, date, status, teacher_id
  INTO v_course_tenant, v_max_participants, v_course_date, v_course_status, v_teacher_id
  FROM public.courses
  WHERE id = p_course_id;

  IF NOT FOUND OR v_max_participants IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Kurs nicht gefunden.'
    );
  END IF;

  IF v_teacher_id IS NOT DISTINCT FROM v_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Sie können sich nicht für Ihren eigenen Kurs anmelden.'
    );
  END IF;

  IF v_course_tenant IS DISTINCT FROM v_tenant_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Dieser Kurs gehört nicht zu Ihrem Tenant.'
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
    FROM public.registrations
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
  FROM public.registrations
  WHERE course_id = p_course_id
    AND status = 'registered'
    AND is_waitlist = false
    AND cancellation_timestamp IS NULL;

  IF v_current_count >= v_max_participants THEN
    SELECT COUNT(*)::integer + 1 INTO v_next_position
    FROM public.registrations
    WHERE course_id = p_course_id
      AND is_waitlist = true
      AND status = 'waitlist'
      AND cancellation_timestamp IS NULL;

    INSERT INTO public.registrations (
      user_id,
      course_id,
      tenant_id,
      status,
      is_waitlist,
      waitlist_position
    )
    VALUES (
      v_user_id,
      p_course_id,
      v_tenant_id,
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

  INSERT INTO public.registrations (
    user_id,
    course_id,
    tenant_id,
    status,
    is_waitlist,
    waitlist_position
  )
  VALUES (
    v_user_id,
    p_course_id,
    v_tenant_id,
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
$function$


CREATE OR REPLACE FUNCTION public.trg_compact_waitlist()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.compact_waitlist_positions(OLD.course_id);
  RETURN COALESCE(NEW, OLD);
END;
$function$


CREATE OR REPLACE FUNCTION public.trg_promote_waitlist_after_registered_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.promote_from_waitlist(OLD.course_id);
  RETURN OLD;
END;
$function$


CREATE OR REPLACE FUNCTION public.unregister_from_course(p_course_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_registration_status public.registration_status;
  v_waitlist_user_id uuid;
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

  IF v_registration_status = 'registered' THEN
    SELECT user_id
    INTO v_waitlist_user_id
    FROM registrations
    WHERE course_id = p_course_id
      AND status = 'waitlist'
      AND cancellation_timestamp IS NULL
    ORDER BY waitlist_position ASC NULLS LAST, signup_timestamp ASC NULLS LAST, id ASC
    LIMIT 1;
  END IF;

  DELETE FROM registrations
  WHERE course_id = p_course_id
    AND user_id = v_user_id;

  PERFORM public.compact_waitlist_positions(p_course_id);

  IF v_waitlist_user_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'message',
      'Abgemeldet. Ein Wartelisten-Teilnehmer wurde nachgerückt.',
      'promoted_user_id', v_waitlist_user_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Erfolgreich abgemeldet.'
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.verify_token(p_token text, p_type text)
 RETURNS TABLE(valid boolean, user_id uuid, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token_record RECORD;
BEGIN
  SELECT * INTO v_token_record FROM auth_tokens WHERE token = p_token AND type = p_type;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, 'Token ungültig oder nicht gefunden'::text;
    RETURN;
  END IF;

  IF v_token_record.used THEN
    RETURN QUERY SELECT false, NULL::uuid, 'Token wurde bereits verwendet'::text;
    RETURN;
  END IF;

  IF v_token_record.expires_at < now() THEN
    RETURN QUERY SELECT false, NULL::uuid, 'Token ist abgelaufen'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_token_record.user_id, 'Token gültig'::text;
END;
$function$


CREATE OR REPLACE FUNCTION yogaflow_private.get_my_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT tenant_id FROM public.users WHERE id = auth.uid();
$function$


CREATE OR REPLACE FUNCTION yogaflow_private.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'admin'
  );
$function$


CREATE OR REPLACE FUNCTION yogaflow_private.is_owner()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'owner'
  );
$function$


CREATE OR REPLACE FUNCTION yogaflow_private.is_participant()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'user'
  );
$function$


CREATE OR REPLACE FUNCTION yogaflow_private.is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role IN ('owner', 'admin', 'teacher')
  );
$function$


CREATE OR REPLACE FUNCTION yogaflow_private.is_teacher()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'teacher'
  );
$function$


CREATE OR REPLACE FUNCTION yogaflow_private.is_tenant_manager()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role IN ('owner', 'admin')
  );
$function$


-- ===== TRIGGERS public.* + auth.users (nicht intern) =====

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER compact_waitlist_after_delete AFTER DELETE ON registrations FOR EACH ROW WHEN (old.is_waitlist = true AND old.cancellation_timestamp IS NULL) EXECUTE FUNCTION trg_compact_waitlist();

CREATE TRIGGER compact_waitlist_after_leave AFTER UPDATE OF is_waitlist, status, cancellation_timestamp ON registrations FOR EACH ROW WHEN (old.is_waitlist = true AND old.cancellation_timestamp IS NULL AND (new.is_waitlist = false OR new.cancellation_timestamp IS NOT NULL OR new.status IS DISTINCT FROM 'waitlist'::registration_status)) EXECUTE FUNCTION trg_compact_waitlist();

CREATE TRIGGER prevent_past_course_registration BEFORE INSERT ON registrations FOR EACH ROW EXECUTE FUNCTION check_registration_course_not_past();

CREATE TRIGGER promote_waitlist_after_registered_delete AFTER DELETE ON registrations FOR EACH ROW WHEN (old.status = 'registered'::registration_status AND COALESCE(old.is_waitlist, false) = false AND old.cancellation_timestamp IS NULL) EXECUTE FUNCTION trg_promote_waitlist_after_registered_delete();

CREATE TRIGGER update_registrations_updated_at BEFORE UPDATE ON registrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER check_tenant_slug_not_reserved BEFORE INSERT ON tenants FOR EACH ROW EXECUTE FUNCTION check_tenant_slug_not_reserved();

CREATE TRIGGER prevent_tenants_slug_change BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION prevent_tenants_slug_change();

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER check_role_escalation BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION prevent_role_escalation();

CREATE TRIGGER cleanup_future_registrations_on_role_upgrade AFTER UPDATE OF role ON users FOR EACH ROW EXECUTE FUNCTION cleanup_future_registrations_on_role_upgrade();

CREATE TRIGGER prevent_last_owner_delete BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION prevent_last_owner_delete();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===== PRIVILEGES (Kommentar, keine GRANT-Statements) =====
-- relacl public.*
-- public.admin_emails: {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
-- public.auth_tokens: {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
-- public.courses: {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
-- public.email_templates: {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
-- public.global_settings: {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
-- public.messages: {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
-- public.registrations: {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
-- public.reserved_slugs: {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
-- public.system_settings: {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
-- public.tenants: {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
-- public.user_notifications: {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
-- public.users: {postgres=arwdDxtm/postgres,anon=ardDxtm/postgres,authenticated=ardDxtm/postgres,service_role=arwdDxtm/postgres}

-- attacl public.users
-- public.users.id: NULL
-- public.users.email: {authenticated=w/postgres}
-- public.users.first_name: {authenticated=w/postgres}
-- public.users.last_name: {authenticated=w/postgres}
-- public.users.street: {authenticated=w/postgres}
-- public.users.house_number: {authenticated=w/postgres}
-- public.users.postal_code: {authenticated=w/postgres}
-- public.users.city: {authenticated=w/postgres}
-- public.users.phone: {authenticated=w/postgres}
-- public.users.created_at: NULL
-- public.users.updated_at: NULL
-- public.users.gdpr_consent: NULL
-- public.users.gdpr_consent_date: NULL
-- public.users.email_verified: NULL
-- public.users.email_verified_at: NULL
-- public.users.role: {authenticated=w/postgres}
-- public.users.tenant_id: NULL

-- EXECUTE public.* (anon / authenticated / service_role)
-- public.admin_register_user_for_course(p_user_id uuid, p_course_id uuid)
--   anon=true  authenticated=true  service_role=true
-- public.admin_unregister_user_from_course(p_user_id uuid, p_course_id uuid)
--   anon=true  authenticated=true  service_role=true
-- public.begin_tenant_onboarding(p_name text, p_slug text)
--   anon=false  authenticated=false  service_role=true
-- public.cancel_tenant_onboarding(p_tenant_id uuid)
--   anon=false  authenticated=false  service_role=true
-- public.check_course_not_past()
--   anon=false  authenticated=false  service_role=false
-- public.check_registration_course_not_past()
--   anon=false  authenticated=false  service_role=false
-- public.check_slug_available(p_slug text)
--   anon=false  authenticated=false  service_role=true
-- public.check_tenant_slug_not_reserved()
--   anon=true  authenticated=true  service_role=true
-- public.cleanup_expired_tokens()
--   anon=false  authenticated=false  service_role=true
-- public.cleanup_future_registrations_on_role_upgrade()
--   anon=true  authenticated=true  service_role=true
-- public.close_past_course_registrations()
--   anon=true  authenticated=true  service_role=true
-- public.compact_waitlist_positions(p_course_id uuid)
--   anon=false  authenticated=false  service_role=true
-- public.complete_email_verification(p_user_id uuid, p_token text)
--   anon=true  authenticated=true  service_role=true
-- public.count_tenant_owners(p_tenant_id uuid)
--   anon=false  authenticated=false  service_role=false
-- public.create_password_reset_token(p_user_id uuid, p_email text)
--   anon=false  authenticated=false  service_role=true
-- public.create_verification_token(p_user_id uuid, p_email text)
--   anon=false  authenticated=false  service_role=true
-- public.delete_tenant_complete(p_tenant_id uuid)
--   anon=false  authenticated=false  service_role=true
-- public.ensure_public_user(p_user_id uuid)
--   anon=false  authenticated=false  service_role=true
-- public.get_course_participant_counts(p_course_ids uuid[])
--   anon=false  authenticated=true  service_role=false
-- public.handle_new_user()
--   anon=false  authenticated=false  service_role=false
-- public.mark_token_used(p_token text)
--   anon=false  authenticated=false  service_role=true
-- public.prevent_last_owner_delete()
--   anon=false  authenticated=false  service_role=false
-- public.prevent_role_escalation()
--   anon=false  authenticated=false  service_role=false
-- public.prevent_tenants_slug_change()
--   anon=true  authenticated=true  service_role=true
-- public.promote_from_waitlist(p_course_id uuid)
--   anon=false  authenticated=false  service_role=false
-- public.register_for_course(p_course_id uuid, p_user_id uuid)
--   anon=false  authenticated=true  service_role=false
-- public.trg_compact_waitlist()
--   anon=false  authenticated=false  service_role=true
-- public.trg_promote_waitlist_after_registered_delete()
--   anon=false  authenticated=false  service_role=true
-- public.unregister_from_course(p_course_id uuid, p_user_id uuid)
--   anon=false  authenticated=true  service_role=false
-- public.update_updated_at_column()
--   anon=true  authenticated=true  service_role=true
-- public.verify_token(p_token text, p_type text)
--   anon=false  authenticated=false  service_role=true
