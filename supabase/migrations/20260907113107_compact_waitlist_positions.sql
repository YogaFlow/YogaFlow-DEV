-- Compact waitlist_position after someone leaves the waitlist or is promoted.
-- Positions were assigned as MAX+1 and never renumbered, so remaining users
-- kept stale ranks (e.g. Pos. 2 after Pos. 1 left).

-- =============================================================================
-- Helper: renumber active waitlist rows for a course to 1..n
-- =============================================================================
CREATE OR REPLACE FUNCTION public.compact_waitlist_positions(p_course_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.compact_waitlist_positions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compact_waitlist_positions(uuid) FROM anon, authenticated;

-- =============================================================================
-- Trigger: compact whenever a waitlist seat is vacated (covers role-upgrade
-- deletes and any other path that does not call the helper explicitly)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.trg_compact_waitlist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.compact_waitlist_positions(OLD.course_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.trg_compact_waitlist() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_compact_waitlist() FROM anon, authenticated;

DROP TRIGGER IF EXISTS compact_waitlist_after_delete ON public.registrations;
CREATE TRIGGER compact_waitlist_after_delete
  AFTER DELETE ON public.registrations
  FOR EACH ROW
  WHEN (OLD.is_waitlist = true AND OLD.cancellation_timestamp IS NULL)
  EXECUTE FUNCTION public.trg_compact_waitlist();

DROP TRIGGER IF EXISTS compact_waitlist_after_leave ON public.registrations;
CREATE TRIGGER compact_waitlist_after_leave
  AFTER UPDATE OF is_waitlist, status, cancellation_timestamp ON public.registrations
  FOR EACH ROW
  WHEN (
    OLD.is_waitlist = true
    AND OLD.cancellation_timestamp IS NULL
    AND (
      NEW.is_waitlist = false
      OR NEW.cancellation_timestamp IS NOT NULL
      OR NEW.status IS DISTINCT FROM 'waitlist'
    )
  )
  EXECUTE FUNCTION public.trg_compact_waitlist();

-- =============================================================================
-- unregister_from_course: compact after leave / promotion
-- =============================================================================
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
    END IF;
  END IF;

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
$$;

GRANT EXECUTE ON FUNCTION public.unregister_from_course(uuid, uuid) TO authenticated;

-- =============================================================================
-- admin_unregister_user_from_course: compact after leave / promotion
-- =============================================================================
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
$$;

GRANT EXECUTE ON FUNCTION public.admin_unregister_user_from_course(uuid, uuid) TO authenticated;

-- =============================================================================
-- promote_from_waitlist: compact remaining ranks after promotion
-- =============================================================================
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
$$;

-- =============================================================================
-- Next waitlist seat: COUNT(*)+1 of active waitlist rows (not MAX+1)
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
  v_tenant_id uuid;
  v_user_role text;
  v_course_tenant uuid;
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

  IF v_user_role IS DISTINCT FROM 'user' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Nur Teilnehmer können sich für Kurse anmelden.'
    );
  END IF;

  SELECT tenant_id, max_participants, date, status
  INTO v_course_tenant, v_max_participants, v_course_date, v_course_status
  FROM public.courses
  WHERE id = p_course_id;

  IF NOT FOUND OR v_max_participants IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Kurs nicht gefunden.'
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
$$;

GRANT EXECUTE ON FUNCTION public.register_for_course(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_register_user_for_course(
  p_user_id uuid,
  p_course_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_user_id AND tenant_id = v_actor_tenant AND role = 'user'
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
$$;

GRANT EXECUTE ON FUNCTION public.admin_register_user_for_course(uuid, uuid) TO authenticated;

-- =============================================================================
-- One-time repair of existing waitlist gaps
-- =============================================================================
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT course_id
    FROM public.registrations
    WHERE is_waitlist = true
      AND cancellation_timestamp IS NULL
  LOOP
    PERFORM public.compact_waitlist_positions(r.course_id);
  END LOOP;
END;
$$;
