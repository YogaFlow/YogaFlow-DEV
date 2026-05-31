-- Admin/Lehrer: Teilnehmer vom Kurs abmelden (mit Wartelisten-Nachrücken).
-- Lehrer dürfen nur aktive Teilnehmer (nicht Warteliste) bei eigenen Kursen abmelden.
-- Owner/Admin dürfen alle aktiven Anmeldungen im Tenant abmelden.

CREATE OR REPLACE FUNCTION public.admin_unregister_user_from_course(
  p_user_id   uuid,
  p_course_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
  v_waitlist_registration_id uuid;
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
    WHERE id = p_user_id AND tenant_id = v_actor_tenant AND role = 'user'
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

  DELETE FROM public.registrations
  WHERE course_id = p_course_id
    AND user_id = p_user_id;

  IF v_was_registered THEN
    SELECT user_id, id
    INTO v_waitlist_user_id, v_waitlist_registration_id
    FROM public.registrations
    WHERE course_id = p_course_id
      AND status = 'waitlist'
      AND is_waitlist = true
      AND cancellation_timestamp IS NULL
    ORDER BY waitlist_position ASC NULLS LAST, signup_timestamp ASC NULLS LAST, id ASC
    LIMIT 1
    FOR UPDATE;

    IF v_waitlist_user_id IS NOT NULL THEN
      UPDATE public.registrations
      SET
        status = 'registered',
        is_waitlist = false,
        waitlist_position = NULL
      WHERE id = v_waitlist_registration_id;
    END IF;
  END IF;

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
$$;

GRANT EXECUTE ON FUNCTION public.admin_unregister_user_from_course(uuid, uuid) TO authenticated;
