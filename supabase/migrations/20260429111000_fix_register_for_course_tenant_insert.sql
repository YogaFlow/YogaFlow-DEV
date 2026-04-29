/*
  Fix tenant-aware registration insert.

  After introducing multi-tenant schema, registrations.tenant_id is NOT NULL.
  The later register_for_course(uuid, uuid default null) implementation inserted
  rows without tenant_id, causing runtime failures on course signup.
*/

CREATE OR REPLACE FUNCTION public.register_for_course(
  p_course_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
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

  SELECT tenant_id
  INTO v_tenant_id
  FROM public.users
  WHERE id = v_user_id;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Kein Tenant für Benutzer gefunden.'
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
      'message', 'Dieser Kurs gehoert nicht zu Ihrem Tenant.'
    );
  END IF;

  IF v_course_date < CURRENT_DATE THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Anmeldung fuer vergangene Kurse ist nicht moeglich.'
    );
  END IF;

  IF lower(trim(coalesce(v_course_status, 'active'))) IN (
    'canceled', 'cancelled', 'not_planned'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Dieser Kurs ist nicht zur Anmeldung verfuegbar.'
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
      'message', 'Sie sind fuer diesen Kurs bereits angemeldet oder stehen auf der Warteliste.'
    );
  END IF;

  SELECT COUNT(*) INTO v_current_count
  FROM public.registrations
  WHERE course_id = p_course_id
    AND status = 'registered'
    AND is_waitlist = false
    AND cancellation_timestamp IS NULL;

  IF v_current_count >= v_max_participants THEN
    SELECT COALESCE(MAX(waitlist_position), 0) + 1 INTO v_next_position
    FROM public.registrations
    WHERE course_id = p_course_id
      AND is_waitlist = true
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
