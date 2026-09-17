-- Zweck Stufe 2 „Umschalten": „wer bin ich" läuft über
-- yogaflow_private.get_my_member_id() statt auth.uid() in Policies und
-- Helfern. Bei heutigem 1:1 (id = auth_user_id, ein Profil pro Login)
-- ist das Ergebnis gleich. Nur fremder oder ungültiger Header x-omlify-tenant
-- wird strenger (kein Treffer → NULL).
--
-- Übergangsregel in get_my_member_id: fehlt der Header, gilt das Profil
-- des Logins, wenn es GENAU EINES gibt, sonst NULL. Diese Regel wird
-- entfernt, wenn PROD stabil mit Header läuft.
--
-- Rückweg: Helfer und Policies aus
--   supabase/snapshots/2026-09-11_pre_membership_dev.sql
-- zuzüglich der Stufe-1-Spalte auth_user_id (nicht dieser Snapshot).
-- Konkret: CREATE OR REPLACE der sieben yogaflow_private-Helfer und der
-- fünf public-Funktionen sowie DROP/CREATE der 14 Policies wie in 1a.

CREATE OR REPLACE FUNCTION yogaflow_private.request_tenant_slug()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN v IS NULL OR btrim(v) = '' THEN NULL
    WHEN lower(btrim(v)) ~ '^[a-z0-9]{3,30}$' THEN lower(btrim(v))
    ELSE '#invalid'
  END
  FROM (
    SELECT nullif(current_setting('request.headers', true), '')::json
             ->> 'x-omlify-tenant' AS v
  ) s;
$function$;

CREATE OR REPLACE FUNCTION yogaflow_private.get_my_member_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN NULL
    WHEN yogaflow_private.request_tenant_slug() IS NOT NULL THEN (
      SELECT u.id
      FROM public.users u
      JOIN public.tenants t ON t.id = u.tenant_id
      WHERE u.auth_user_id = auth.uid()
        AND t.slug = yogaflow_private.request_tenant_slug()
    )
    ELSE (
      SELECT u.id
      FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND (
          SELECT count(*) FROM public.users u2
          WHERE u2.auth_user_id = auth.uid()
        ) = 1
    )
  END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.request_tenant_slug() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION yogaflow_private.request_tenant_slug() TO authenticated;

REVOKE ALL ON FUNCTION yogaflow_private.get_my_member_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION yogaflow_private.get_my_member_id() TO authenticated;

CREATE OR REPLACE FUNCTION yogaflow_private.get_my_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT tenant_id FROM public.users WHERE id = yogaflow_private.get_my_member_id();
$function$;

CREATE OR REPLACE FUNCTION yogaflow_private.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = yogaflow_private.get_my_member_id()
      AND u.role = 'admin'
  );
$function$;

CREATE OR REPLACE FUNCTION yogaflow_private.is_owner()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = yogaflow_private.get_my_member_id() AND role = 'owner'
  );
$function$;

CREATE OR REPLACE FUNCTION yogaflow_private.is_participant()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = yogaflow_private.get_my_member_id() AND role = 'user'
  );
$function$;

CREATE OR REPLACE FUNCTION yogaflow_private.is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = yogaflow_private.get_my_member_id() AND role IN ('owner', 'admin', 'teacher')
  );
$function$;

CREATE OR REPLACE FUNCTION yogaflow_private.is_teacher()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = yogaflow_private.get_my_member_id() AND role = 'teacher'
  );
$function$;

CREATE OR REPLACE FUNCTION yogaflow_private.is_tenant_manager()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = yogaflow_private.get_my_member_id() AND role IN ('owner', 'admin')
  );
$function$;

DROP POLICY IF EXISTS "courses_update_own_or_manager" ON public.courses;
CREATE POLICY "courses_update_own_or_manager"
  ON public.courses FOR UPDATE
  TO authenticated
  USING (
    (tenant_id = yogaflow_private.get_my_tenant_id())
    AND ((teacher_id = (SELECT yogaflow_private.get_my_member_id()))
         OR yogaflow_private.is_tenant_manager())
  )
  WITH CHECK (tenant_id = yogaflow_private.get_my_tenant_id());

DROP POLICY IF EXISTS "messages_delete_own" ON public.messages;
CREATE POLICY "messages_delete_own"
  ON public.messages FOR DELETE
  TO authenticated
  USING (
    (tenant_id = yogaflow_private.get_my_tenant_id())
    AND ((sender_id = (SELECT yogaflow_private.get_my_member_id()))
         OR (recipient_id = (SELECT yogaflow_private.get_my_member_id())))
  );

DROP POLICY IF EXISTS "messages_insert_own_tenant" ON public.messages;
CREATE POLICY "messages_insert_own_tenant"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    (tenant_id = yogaflow_private.get_my_tenant_id())
    AND (sender_id = (SELECT yogaflow_private.get_my_member_id()))
  );

DROP POLICY IF EXISTS "messages_select_own_tenant" ON public.messages;
CREATE POLICY "messages_select_own_tenant"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    (tenant_id = yogaflow_private.get_my_tenant_id())
    AND ((recipient_id = (SELECT yogaflow_private.get_my_member_id()))
         OR (sender_id = (SELECT yogaflow_private.get_my_member_id()))
         OR is_broadcast)
  );

DROP POLICY IF EXISTS "messages_update_own" ON public.messages;
CREATE POLICY "messages_update_own"
  ON public.messages FOR UPDATE
  TO authenticated
  USING (
    (tenant_id = yogaflow_private.get_my_tenant_id())
    AND (recipient_id = (SELECT yogaflow_private.get_my_member_id()))
  )
  WITH CHECK (tenant_id = yogaflow_private.get_my_tenant_id());

DROP POLICY IF EXISTS "registrations_delete" ON public.registrations;
CREATE POLICY "registrations_delete"
  ON public.registrations FOR DELETE
  TO authenticated
  USING (
    (tenant_id = yogaflow_private.get_my_tenant_id())
    AND ((user_id = (SELECT yogaflow_private.get_my_member_id()))
         OR yogaflow_private.is_tenant_manager())
  );

DROP POLICY IF EXISTS "registrations_insert_own" ON public.registrations;
CREATE POLICY "registrations_insert_own"
  ON public.registrations FOR INSERT
  TO authenticated
  WITH CHECK (
    (tenant_id = yogaflow_private.get_my_tenant_id())
    AND (user_id = (SELECT yogaflow_private.get_my_member_id()))
  );

DROP POLICY IF EXISTS "registrations_select" ON public.registrations;
CREATE POLICY "registrations_select"
  ON public.registrations FOR SELECT
  TO authenticated
  USING (
    (tenant_id = yogaflow_private.get_my_tenant_id())
    AND ((user_id = (SELECT yogaflow_private.get_my_member_id()))
         OR yogaflow_private.is_staff())
  );

DROP POLICY IF EXISTS "Users can mark own notifications read" ON public.user_notifications;
CREATE POLICY "Users can mark own notifications read"
  ON public.user_notifications FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT yogaflow_private.get_my_member_id()))
  WITH CHECK (user_id = (SELECT yogaflow_private.get_my_member_id()));

DROP POLICY IF EXISTS "Users can view own notifications" ON public.user_notifications;
CREATE POLICY "Users can view own notifications"
  ON public.user_notifications FOR SELECT
  TO authenticated
  USING (user_id = (SELECT yogaflow_private.get_my_member_id()));

DROP POLICY IF EXISTS "managers_delete_tenant_users" ON public.users;
CREATE POLICY "managers_delete_tenant_users"
  ON public.users FOR DELETE
  TO authenticated
  USING (
    (tenant_id = yogaflow_private.get_my_tenant_id())
    AND yogaflow_private.is_tenant_manager()
    AND (id <> (SELECT yogaflow_private.get_my_member_id()))
    AND (role <> 'owner'::text)
  );

DROP POLICY IF EXISTS "managers_update_tenant_users" ON public.users;
CREATE POLICY "managers_update_tenant_users"
  ON public.users FOR UPDATE
  TO authenticated
  USING (
    (tenant_id = yogaflow_private.get_my_tenant_id())
    AND yogaflow_private.is_tenant_manager()
    AND (id <> (SELECT yogaflow_private.get_my_member_id()))
  )
  WITH CHECK (tenant_id = yogaflow_private.get_my_tenant_id());

DROP POLICY IF EXISTS "users_select_own" ON public.users;
CREATE POLICY "users_select_own"
  ON public.users FOR SELECT
  TO authenticated
  USING (auth_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "users_update_own_profile" ON public.users;
CREATE POLICY "users_update_own_profile"
  ON public.users FOR UPDATE
  TO authenticated
  USING (id = (SELECT yogaflow_private.get_my_member_id()))
  WITH CHECK (id = (SELECT yogaflow_private.get_my_member_id()));

CREATE OR REPLACE FUNCTION public.register_for_course(p_course_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := yogaflow_private.get_my_member_id();
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
$function$;

CREATE OR REPLACE FUNCTION public.unregister_from_course(p_course_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := yogaflow_private.get_my_member_id();
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
$function$;

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
  v_actor_id := yogaflow_private.get_my_member_id();
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
$function$;

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
  v_actor_id := yogaflow_private.get_my_member_id();
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
$function$;

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

DO $$
DECLARE
  v_pol record;
  v_fn record;
  v_allowed text[] := ARRAY['first_name','last_name','email','phone',
                            'street','house_number','postal_code','city','role'];
  v_col text;
  v_has boolean;
  v_mismatch integer;
BEGIN
  FOR v_pol IN
    SELECT pol.polname, c.relname,
           pg_get_expr(pol.polqual, pol.polrelid) AS q,
           pg_get_expr(pol.polwithcheck, pol.polrelid) AS w
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND (
        COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') ILIKE '%auth.uid()%'
        OR COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ILIKE '%auth.uid()%'
      )
      AND pol.polname <> 'users_select_own'
  LOOP
    RAISE EXCEPTION 'Policy %.% enthält noch auth.uid()', v_pol.relname, v_pol.polname;
  END LOOP;

  FOR v_fn IN
    SELECT n.nspname, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'yogaflow_private')
      AND p.prosrc ILIKE '%auth.uid()%'
      AND p.proname <> 'get_my_member_id'
  LOOP
    RAISE EXCEPTION 'Funktion %.% enthält noch auth.uid()', v_fn.nspname, v_fn.proname;
  END LOOP;

  IF has_function_privilege('anon', 'yogaflow_private.request_tenant_slug()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon hat EXECUTE auf request_tenant_slug()';
  END IF;

  IF has_function_privilege('anon', 'yogaflow_private.get_my_member_id()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon hat EXECUTE auf get_my_member_id()';
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
    RAISE EXCEPTION 'Stufe 1: % Zeilen mit auth_user_id IS DISTINCT FROM id', v_mismatch;
  END IF;
END $$;
