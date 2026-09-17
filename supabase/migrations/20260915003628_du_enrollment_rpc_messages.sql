-- Zweck: Anrede „du" in Nutzermeldungen von register_for_course und
-- unregister_from_course (Entscheidung 15.09.2026). Nur Texte.
--
-- Rückweg: Definitionen aus
--   supabase/snapshots/2026-09-15_pre_du_enrollment_rpcs_dev.sql
-- erneut ausführen.

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
      'message', 'Bitte melde dich an.'
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

DO $$
DECLARE
  v_reg text;
  v_unreg text;
BEGIN
  SELECT pg_get_functiondef('public.register_for_course(uuid, uuid)'::regprocedure)
    INTO v_reg;
  SELECT pg_get_functiondef('public.unregister_from_course(uuid, uuid)'::regprocedure)
    INTO v_unreg;

  IF v_reg IS NULL OR v_reg NOT LIKE '%Bitte melde dich an.%' THEN
    RAISE EXCEPTION 'register_for_course: Text „Bitte melde dich an." fehlt';
  END IF;
  IF v_reg NOT LIKE '%Du kannst dich nicht für deinen eigenen Kurs anmelden.%' THEN
    RAISE EXCEPTION 'register_for_course: Text zum eigenen Kurs fehlt';
  END IF;
  IF v_reg NOT LIKE '%Dieser Kurs gehört nicht zu deinem Studio.%' THEN
    RAISE EXCEPTION 'register_for_course: Text „deinem Studio" fehlt';
  END IF;
  IF v_reg NOT LIKE '%Du bist für diesen Kurs bereits angemeldet oder stehst auf der Warteliste.%' THEN
    RAISE EXCEPTION 'register_for_course: Text zur Doppelanmeldung fehlt';
  END IF;
  IF v_reg NOT LIKE '%Du wurdest auf die Warteliste gesetzt.%' THEN
    RAISE EXCEPTION 'register_for_course: Text zur Warteliste fehlt';
  END IF;

  IF v_unreg IS NULL OR v_unreg NOT LIKE '%Bitte melde dich an.%' THEN
    RAISE EXCEPTION 'unregister_from_course: Text „Bitte melde dich an." fehlt';
  END IF;

  IF v_reg LIKE '% Sie %' OR v_reg LIKE '%Ihr%' OR v_reg LIKE '%Ihrem%' OR v_reg LIKE '%Ihren%' THEN
    RAISE EXCEPTION 'register_for_course enthält noch Sie/Ihr';
  END IF;
  IF v_unreg LIKE '% Sie %' OR v_unreg LIKE '%Ihr%' OR v_unreg LIKE '%Ihrem%' OR v_unreg LIKE '%Ihren%' THEN
    RAISE EXCEPTION 'unregister_from_course enthält noch Sie/Ihr';
  END IF;
END;
$$;
