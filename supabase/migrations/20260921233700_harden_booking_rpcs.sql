-- Zweck: Geldkette Story 0.2, Befunde L1 und L7, Korrekturen K1 und K2 (21.09.2026).
--
-- L1: register_for_course und admin_register_user_for_course sperren die Kurszeile
-- mit FOR UPDATE, bevor sie die belegten Plätze zählen. Beleg Inventur DEV 21.09.2026:
-- scripts/test/overbooking_race.mjs, 20 parallele Doppelbuchungen auf einen Kurs mit
-- Kapazität 1, 2 Runden mit 2 × registered (Runden 15 und 16). Kurs danach gelöscht.
--
-- K2: promote_from_waitlist setzt eine Wartelistenzeile auf registered und sperrt
-- dieselbe Kurszeile vorher. Neueste Definition: 20260907113107. search_path bleibt ''.
--
-- L7: close_past_course_registrations wird entfernt. Sie scheitert bei jedem Aufruf
-- (NULLIF auf einer time-Spalte) und würde mit Zahlungen Stornoregeln verfälschen.
-- Entschieden 14.09.2026. Rechte standen zuletzt in 20260917134259 (authenticated,
-- service_role; anon bereits entzogen).
--
-- K1: unregister_from_course bleibt unverändert (search_path public, pg_temp).
-- admin_register_user_for_course bekommt search_path public, pg_temp (pg_temp zuletzt).
--
-- Rückweg (ausführbar, diese Zeilen sind Kommentar und laufen hier nicht).
-- Körper: 20260915003628 register_for_course, 20260911173000 admin_register_user_for_course,
-- 20260907113107 promote_from_waitlist, 20260505113046 close_past_course_registrations.
-- Rechte close_past: 20260917134259.
--
-- CREATE OR REPLACE FUNCTION public.register_for_course(p_course_id uuid, p_user_id uuid DEFAULT NULL::uuid)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_user_id uuid := yogaflow_private.get_my_member_id();
--   v_tenant_id uuid;
--   v_user_role text;
--   v_course_tenant uuid;
--   v_max_participants integer;
--   v_course_date date;
--   v_course_status text;
--   v_teacher_id uuid;
--   v_current_count integer;
--   v_next_position integer;
-- BEGIN
--   IF v_user_id IS NULL THEN
--     RETURN jsonb_build_object(
--       'success', false,
--       'message', 'Bitte melde dich an.'
--     );
--   END IF;
-- 
--   IF p_user_id IS NOT NULL AND p_user_id <> v_user_id THEN
--     RETURN jsonb_build_object(
--       'success', false,
--       'message', 'Nicht autorisiert.'
--     );
--   END IF;
-- 
--   SELECT tenant_id, role
--   INTO v_tenant_id, v_user_role
--   FROM public.users
--   WHERE id = v_user_id;
-- 
--   IF v_tenant_id IS NULL THEN
--     RETURN jsonb_build_object(
--       'success', false,
--       'message', 'Kein Tenant für Benutzer gefunden.'
--     );
--   END IF;
-- 
--   IF v_user_role NOT IN ('user', 'teacher') THEN
--     RETURN jsonb_build_object(
--       'success', false,
--       'message', 'Owner und Admins können sich nicht für Kurse anmelden.'
--     );
--   END IF;
-- 
--   SELECT tenant_id, max_participants, date, status, teacher_id
--   INTO v_course_tenant, v_max_participants, v_course_date, v_course_status, v_teacher_id
--   FROM public.courses
--   WHERE id = p_course_id;
-- 
--   IF NOT FOUND OR v_max_participants IS NULL THEN
--     RETURN jsonb_build_object(
--       'success', false,
--       'message', 'Kurs nicht gefunden.'
--     );
--   END IF;
-- 
--   IF v_teacher_id IS NOT DISTINCT FROM v_user_id THEN
--     RETURN jsonb_build_object(
--       'success', false,
--       'message', 'Du kannst dich nicht für deinen eigenen Kurs anmelden.'
--     );
--   END IF;
-- 
--   IF v_course_tenant IS DISTINCT FROM v_tenant_id THEN
--     RETURN jsonb_build_object(
--       'success', false,
--       'message', 'Dieser Kurs gehört nicht zu deinem Studio.'
--     );
--   END IF;
-- 
--   IF v_course_date < CURRENT_DATE THEN
--     RETURN jsonb_build_object(
--       'success', false,
--       'message', 'Anmeldung für vergangene Kurse ist nicht möglich.'
--     );
--   END IF;
-- 
--   IF lower(trim(coalesce(v_course_status, 'active'))) IN (
--     'canceled', 'cancelled', 'not_planned'
--   ) THEN
--     RETURN jsonb_build_object(
--       'success', false,
--       'message', 'Dieser Kurs ist nicht zur Anmeldung verfügbar.'
--     );
--   END IF;
-- 
--   IF EXISTS (
--     SELECT 1
--     FROM public.registrations
--     WHERE course_id = p_course_id
--       AND user_id = v_user_id
--       AND cancellation_timestamp IS NULL
--   ) THEN
--     RETURN jsonb_build_object(
--       'success', false,
--       'message', 'Du bist für diesen Kurs bereits angemeldet oder stehst auf der Warteliste.'
--     );
--   END IF;
-- 
--   SELECT COUNT(*) INTO v_current_count
--   FROM public.registrations
--   WHERE course_id = p_course_id
--     AND status = 'registered'
--     AND is_waitlist = false
--     AND cancellation_timestamp IS NULL;
-- 
--   IF v_current_count >= v_max_participants THEN
--     SELECT COUNT(*)::integer + 1 INTO v_next_position
--     FROM public.registrations
--     WHERE course_id = p_course_id
--       AND is_waitlist = true
--       AND status = 'waitlist'
--       AND cancellation_timestamp IS NULL;
-- 
--     INSERT INTO public.registrations (
--       user_id,
--       course_id,
--       tenant_id,
--       status,
--       is_waitlist,
--       waitlist_position
--     )
--     VALUES (
--       v_user_id,
--       p_course_id,
--       v_tenant_id,
--       'waitlist',
--       true,
--       v_next_position
--     );
-- 
--     RETURN jsonb_build_object(
--       'success', true,
--       'message', 'Du wurdest auf die Warteliste gesetzt.',
--       'waitlist_position', v_next_position,
--       'is_waitlist', true
--     );
--   END IF;
-- 
--   INSERT INTO public.registrations (
--     user_id,
--     course_id,
--     tenant_id,
--     status,
--     is_waitlist,
--     waitlist_position
--   )
--   VALUES (
--     v_user_id,
--     p_course_id,
--     v_tenant_id,
--     'registered',
--     false,
--     NULL
--   );
-- 
--   RETURN jsonb_build_object(
--     'success', true,
--     'message', 'Erfolgreich angemeldet.',
--     'is_waitlist', false
--   );
-- END;
-- $function$;
-- REVOKE ALL ON FUNCTION public.register_for_course(uuid, uuid) FROM PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION public.register_for_course(uuid, uuid) TO authenticated;
--
-- CREATE OR REPLACE FUNCTION public.admin_register_user_for_course(p_user_id uuid, p_course_id uuid)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_actor_id           uuid;
--   v_actor_role         text;
--   v_actor_tenant       uuid;
--   v_course_tenant      uuid;
--   v_teacher_id         uuid;
--   v_max_participants   integer;
--   v_course_date        date;
--   v_course_title       text;
--   v_course_time        time;
--   v_current_count      integer;
--   v_next_position      integer;
--   v_notification_body  text;
-- BEGIN
--   v_actor_id := yogaflow_private.get_my_member_id();
--   IF v_actor_id IS NULL THEN
--     RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
--   END IF;
-- 
--   SELECT role, tenant_id INTO v_actor_role, v_actor_tenant
--   FROM public.users WHERE id = v_actor_id;
-- 
--   IF v_actor_role NOT IN ('owner', 'admin', 'teacher') THEN
--     RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions');
--   END IF;
-- 
--   SELECT tenant_id, teacher_id, max_participants, date, title, time
--   INTO v_course_tenant, v_teacher_id, v_max_participants, v_course_date, v_course_title, v_course_time
--   FROM public.courses WHERE id = p_course_id;
-- 
--   IF NOT FOUND THEN
--     RETURN jsonb_build_object('success', false, 'error', 'Course not found');
--   END IF;
-- 
--   IF v_course_tenant IS DISTINCT FROM v_actor_tenant THEN
--     RETURN jsonb_build_object('success', false, 'error', 'Cross-tenant operation not allowed');
--   END IF;
-- 
--   IF v_actor_role = 'teacher' AND v_teacher_id IS DISTINCT FROM v_actor_id THEN
--     RETURN jsonb_build_object('success', false, 'error', 'Teachers can only add participants to their own courses');
--   END IF;
-- 
--   IF p_user_id IS NOT DISTINCT FROM v_teacher_id THEN
--     RETURN jsonb_build_object('success', false, 'error', 'Course teachers cannot be added as participants to their own course');
--   END IF;
-- 
--   IF NOT EXISTS (
--     SELECT 1 FROM public.users
--     WHERE id = p_user_id
--       AND tenant_id = v_actor_tenant
--       AND role IN ('user', 'teacher')
--   ) THEN
--     RETURN jsonb_build_object('success', false, 'error', 'Target user not found or not a participant');
--   END IF;
-- 
--   IF v_course_date < CURRENT_DATE THEN
--     RETURN jsonb_build_object('success', false, 'error', 'Cannot register for past courses');
--   END IF;
-- 
--   IF EXISTS (
--     SELECT 1 FROM public.registrations
--     WHERE course_id = p_course_id
--       AND user_id = p_user_id
--       AND cancellation_timestamp IS NULL
--   ) THEN
--     RETURN jsonb_build_object('success', false, 'error', 'already_registered');
--   END IF;
-- 
--   SELECT COUNT(*) INTO v_current_count
--   FROM public.registrations
--   WHERE course_id = p_course_id
--     AND status = 'registered'
--     AND is_waitlist = false
--     AND cancellation_timestamp IS NULL;
-- 
--   IF v_current_count >= v_max_participants THEN
--     SELECT COUNT(*)::integer + 1 INTO v_next_position
--     FROM public.registrations
--     WHERE course_id = p_course_id
--       AND is_waitlist = true
--       AND status = 'waitlist'
--       AND cancellation_timestamp IS NULL;
-- 
--     INSERT INTO public.registrations (user_id, course_id, tenant_id, status, is_waitlist, waitlist_position)
--     VALUES (p_user_id, p_course_id, v_actor_tenant, 'waitlist', true, v_next_position);
-- 
--     v_notification_body := format(
--       'Du wurdest für den Kurs "%s" auf die Warteliste gesetzt (Platz %s).',
--       v_course_title,
--       v_next_position
--     );
-- 
--     INSERT INTO public.user_notifications (
--       tenant_id, user_id, type, body, course_id, action_path, metadata
--     ) VALUES (
--       v_actor_tenant,
--       p_user_id,
--       'course_waitlisted',
--       v_notification_body,
--       p_course_id,
--       '/my-courses',
--       jsonb_build_object('added_by_user_id', v_actor_id, 'waitlist_position', v_next_position)
--     );
-- 
--     RETURN jsonb_build_object(
--       'success', true,
--       'on_waitlist', true,
--       'waitlist_position', v_next_position
--     );
--   ELSE
--     INSERT INTO public.registrations (user_id, course_id, tenant_id, status, is_waitlist)
--     VALUES (p_user_id, p_course_id, v_actor_tenant, 'registered', false);
-- 
--     v_notification_body := format(
--       'Du wurdest zum Kurs "%s" am %s um %s hinzugefügt.',
--       v_course_title,
--       to_char(v_course_date, 'DD.MM.YYYY'),
--       to_char(v_course_time, 'HH24:MI')
--     );
-- 
--     INSERT INTO public.user_notifications (
--       tenant_id, user_id, type, body, course_id, action_path, metadata
--     ) VALUES (
--       v_actor_tenant,
--       p_user_id,
--       'course_added',
--       v_notification_body,
--       p_course_id,
--       '/my-courses',
--       jsonb_build_object('added_by_user_id', v_actor_id)
--     );
-- 
--     RETURN jsonb_build_object('success', true, 'on_waitlist', false);
--   END IF;
-- END;
-- $function$;
-- REVOKE ALL ON FUNCTION public.admin_register_user_for_course(uuid, uuid) FROM PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION public.admin_register_user_for_course(uuid, uuid) TO authenticated, service_role;
--
-- CREATE OR REPLACE FUNCTION public.promote_from_waitlist(p_course_id uuid)
-- RETURNS void
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path TO ''
-- AS $$
-- DECLARE
--   v_max_participants integer;
--   v_current_count integer;
--   v_next_user record;
--   v_course_title text;
--   v_course_date date;
--   v_course_time time;
--   v_teacher_id uuid;
--   v_message_content text;
-- BEGIN
--   SELECT max_participants, title, date, time, teacher_id
--   INTO v_max_participants, v_course_title, v_course_date, v_course_time, v_teacher_id
--   FROM public.courses
--   WHERE id = p_course_id;
-- 
--   SELECT COUNT(*) INTO v_current_count
--   FROM public.registrations
--   WHERE course_id = p_course_id
--     AND status = 'registered'
--     AND is_waitlist = false
--     AND cancellation_timestamp IS NULL;
-- 
--   WHILE v_current_count < v_max_participants LOOP
--     SELECT id, user_id, waitlist_position INTO v_next_user
--     FROM public.registrations
--     WHERE course_id = p_course_id
--       AND is_waitlist = true
--       AND status = 'waitlist'
--       AND cancellation_timestamp IS NULL
--     ORDER BY waitlist_position ASC
--     LIMIT 1;
-- 
--     EXIT WHEN v_next_user.id IS NULL;
-- 
--     UPDATE public.registrations
--     SET status = 'registered',
--         is_waitlist = false,
--         waitlist_position = NULL,
--         registered_at = now()
--     WHERE id = v_next_user.id;
-- 
--     v_message_content := format(
--       'Du hast Glück und einen Platz im Kurs "%s" am %s um %s bekommen.',
--       v_course_title,
--       to_char(v_course_date, 'DD.MM.YYYY'),
--       to_char(v_course_time, 'HH24:MI')
--     );
-- 
--     INSERT INTO public.messages (
--       course_id,
--       sender_id,
--       recipient_id,
--       content,
--       is_broadcast,
--       read
--     ) VALUES (
--       p_course_id,
--       v_teacher_id,
--       v_next_user.user_id,
--       v_message_content,
--       false,
--       false
--     );
-- 
--     v_current_count := v_current_count + 1;
--   END LOOP;
-- 
--   PERFORM public.compact_waitlist_positions(p_course_id);
-- END;
-- $$;
-- REVOKE ALL ON FUNCTION public.promote_from_waitlist(uuid) FROM PUBLIC, anon, authenticated;
--
-- CREATE OR REPLACE FUNCTION public.close_past_course_registrations()
-- RETURNS integer
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public, pg_temp
-- AS $$
-- DECLARE
--   v_updated_count integer := 0;
-- BEGIN
--   UPDATE public.registrations r
--   SET cancellation_timestamp = NOW()
--   FROM public.courses c
--   WHERE r.course_id = c.id
--     AND r.cancellation_timestamp IS NULL
--     AND r.status IN ('registered', 'waitlist')
--     AND (
--       c.date::timestamp
--       + COALESCE(NULLIF(c.time, '')::time, TIME '00:00')
--     ) < NOW();
-- 
--   GET DIAGNOSTICS v_updated_count = ROW_COUNT;
--   RETURN v_updated_count;
-- END;
-- $$;
-- REVOKE ALL ON FUNCTION public.close_past_course_registrations() FROM PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION public.close_past_course_registrations() TO authenticated, service_role;
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
      'message', 'Bitte melde dich an.'
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
  WHERE id = p_course_id
  FOR UPDATE;

  IF NOT FOUND OR v_max_participants IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Kurs nicht gefunden.'
    );
  END IF;

  IF v_teacher_id IS NOT DISTINCT FROM v_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Du kannst dich nicht für deinen eigenen Kurs anmelden.'
    );
  END IF;

  IF v_course_tenant IS DISTINCT FROM v_tenant_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Dieser Kurs gehört nicht zu deinem Studio.'
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
      'message', 'Du bist für diesen Kurs bereits angemeldet oder stehst auf der Warteliste.'
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
      'message', 'Du wurdest auf die Warteliste gesetzt.',
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

REVOKE ALL ON FUNCTION public.register_for_course(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_for_course(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_register_user_for_course(p_user_id uuid, p_course_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
  FROM public.courses WHERE id = p_course_id
  FOR UPDATE;

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

REVOKE ALL ON FUNCTION public.admin_register_user_for_course(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_register_user_for_course(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.promote_from_waitlist(p_course_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
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
  WHERE id = p_course_id
  FOR UPDATE;

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
$$;

REVOKE ALL ON FUNCTION public.promote_from_waitlist(uuid) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.close_past_course_registrations();

DO $$
DECLARE
  v_def text;
  v_admin_path text;
  v_unreg_path text;
BEGIN
  IF to_regprocedure('public.close_past_course_registrations()') IS NOT NULL THEN
    RAISE EXCEPTION 'close_past_course_registrations existiert noch';
  END IF;

  IF has_function_privilege('anon', 'public.register_for_course(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon darf register_for_course nicht ausführen';
  END IF;
  IF has_function_privilege('anon', 'public.admin_register_user_for_course(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon darf admin_register_user_for_course nicht ausführen';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.register_for_course(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated braucht EXECUTE auf register_for_course';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.admin_register_user_for_course(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated braucht EXECUTE auf admin_register_user_for_course';
  END IF;

  SELECT pg_get_functiondef('public.register_for_course(uuid, uuid)'::regprocedure) INTO v_def;
  IF v_def NOT LIKE '%FOR UPDATE%' THEN
    RAISE EXCEPTION 'register_for_course ohne FOR UPDATE';
  END IF;

  SELECT pg_get_functiondef('public.admin_register_user_for_course(uuid, uuid)'::regprocedure) INTO v_def;
  IF v_def NOT LIKE '%FOR UPDATE%' THEN
    RAISE EXCEPTION 'admin_register_user_for_course ohne FOR UPDATE';
  END IF;

  SELECT pg_get_functiondef('public.promote_from_waitlist(uuid)'::regprocedure) INTO v_def;
  IF v_def NOT LIKE '%FOR UPDATE%' THEN
    RAISE EXCEPTION 'promote_from_waitlist ohne FOR UPDATE';
  END IF;

  SELECT array_to_string(p.proconfig, ',')
    INTO v_admin_path
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'admin_register_user_for_course';
  IF v_admin_path IS NULL OR v_admin_path NOT LIKE '%search_path=public, pg_temp%' THEN
    RAISE EXCEPTION 'admin_register_user_for_course search_path ist nicht public, pg_temp';
  END IF;

  SELECT array_to_string(p.proconfig, ',')
    INTO v_unreg_path
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'unregister_from_course';
  IF v_unreg_path IS NULL OR v_unreg_path NOT LIKE '%pg_temp%' THEN
    RAISE EXCEPTION 'unregister_from_course muss pg_temp im search_path behalten';
  END IF;

  -- VOLATILE: erst dann sieht COUNT nach dem Warten auf FOR UPDATE einen neuen Snapshot.
  IF (
    SELECT count(*)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'register_for_course',
        'admin_register_user_for_course',
        'promote_from_waitlist'
      )
      AND p.provolatile = 'v'
  ) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'register_for_course, admin_register_user_for_course oder promote_from_waitlist ist nicht VOLATILE';
  END IF;
END $$;
