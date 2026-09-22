-- Zweck: Nachrücken benachrichtigt über die Glocke (user_notifications),
-- nicht mehr über messages.
--
-- Expand (20260922154500) und diese Migration vor dem Contract
-- (20260922154700). Frontend braucht staff_names schon für E4;
-- die Glocke ist davon unabhängig.
--
-- Rückweg: Körper aus 20260922093812 (Chat-Nachricht mit tenant_id).

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
  v_tenant_id uuid;
  v_notification_body text;
BEGIN
  SELECT max_participants, title, date, time, tenant_id
  INTO v_max_participants, v_course_title, v_course_date, v_course_time, v_tenant_id
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

    v_notification_body := format(
      'Du hast einen Platz im Kurs „%s“ am %s um %s bekommen.',
      v_course_title,
      to_char(v_course_date, 'DD.MM.YYYY'),
      to_char(v_course_time, 'HH24:MI')
    );

    INSERT INTO public.user_notifications (
      tenant_id,
      user_id,
      type,
      body,
      course_id,
      action_path,
      metadata
    ) VALUES (
      v_tenant_id,
      v_next_user.user_id,
      'waitlist_promoted',
      v_notification_body,
      p_course_id,
      '/my-courses',
      jsonb_build_object('promoted_from_waitlist', true)
    );

    v_current_count := v_current_count + 1;
  END LOOP;

  PERFORM public.compact_waitlist_positions(p_course_id);
END;
$$;

REVOKE ALL ON FUNCTION public.promote_from_waitlist(uuid) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_def text;
  v_volatile "char";
BEGIN
  SELECT pg_get_functiondef('public.promote_from_waitlist(uuid)'::regprocedure) INTO v_def;
  IF v_def NOT LIKE '%FOR UPDATE%' THEN
    RAISE EXCEPTION 'promote_from_waitlist ohne FOR UPDATE';
  END IF;
  IF v_def NOT LIKE '%user_notifications%' THEN
    RAISE EXCEPTION 'promote_from_waitlist ohne user_notifications';
  END IF;
  IF v_def LIKE '%INSERT INTO public.messages%' THEN
    RAISE EXCEPTION 'promote_from_waitlist enthält noch INSERT INTO public.messages';
  END IF;

  SELECT p.provolatile
    INTO v_volatile
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'promote_from_waitlist';
  IF v_volatile IS DISTINCT FROM 'v' THEN
    RAISE EXCEPTION 'promote_from_waitlist ist nicht VOLATILE';
  END IF;

  IF has_function_privilege('anon', 'public.promote_from_waitlist(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon darf promote_from_waitlist nicht ausführen';
  END IF;
  IF has_function_privilege('authenticated', 'public.promote_from_waitlist(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated darf promote_from_waitlist nicht ausführen';
  END IF;
END $$;
