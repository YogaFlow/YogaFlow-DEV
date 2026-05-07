-- User-Management: Manuelle Kurs-Zuweisung durch Admin/Lehrer
-- Lehrer darf nur zu eigenen Kursen hinzufügen.
-- Admin/Owner dürfen zu allen Kursen im Tenant hinzufügen.
-- Bei Überbelegung → Warteliste (wie bei Selbst-Registrierung).

CREATE OR REPLACE FUNCTION public.admin_register_user_for_course(
  p_user_id  uuid,
  p_course_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id         uuid;
  v_actor_role       text;
  v_actor_tenant     uuid;
  v_course_tenant    uuid;
  v_teacher_id       uuid;
  v_max_participants integer;
  v_course_date      date;
  v_current_count    integer;
  v_next_position    integer;
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

  -- Load course data
  SELECT tenant_id, teacher_id, max_participants, date
  INTO v_course_tenant, v_teacher_id, v_max_participants, v_course_date
  FROM public.courses WHERE id = p_course_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Course not found');
  END IF;

  IF v_course_tenant IS DISTINCT FROM v_actor_tenant THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cross-tenant operation not allowed');
  END IF;

  -- Teacher: only own courses
  IF v_actor_role = 'teacher' AND v_teacher_id IS DISTINCT FROM v_actor_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Teachers can only add participants to their own courses');
  END IF;

  -- Target user must exist in same tenant with role 'user'
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_user_id AND tenant_id = v_actor_tenant AND role = 'user'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user not found or not a participant');
  END IF;

  IF v_course_date < CURRENT_DATE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot register for past courses');
  END IF;

  -- Check for existing active registration
  IF EXISTS (
    SELECT 1 FROM public.registrations
    WHERE course_id = p_course_id
      AND user_id = p_user_id
      AND cancellation_timestamp IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_registered');
  END IF;

  -- Count current registered participants (not waitlisted, not cancelled)
  SELECT COUNT(*) INTO v_current_count
  FROM public.registrations
  WHERE course_id = p_course_id
    AND status = 'registered'
    AND is_waitlist = false
    AND cancellation_timestamp IS NULL;

  IF v_current_count >= v_max_participants THEN
    -- Kurs voll → Warteliste
    SELECT COALESCE(MAX(waitlist_position), 0) + 1 INTO v_next_position
    FROM public.registrations
    WHERE course_id = p_course_id AND is_waitlist = true;

    INSERT INTO public.registrations (user_id, course_id, tenant_id, status, is_waitlist, waitlist_position)
    VALUES (p_user_id, p_course_id, v_actor_tenant, 'waitlist', true, v_next_position);

    RETURN jsonb_build_object(
      'success', true,
      'on_waitlist', true,
      'waitlist_position', v_next_position
    );
  ELSE
    INSERT INTO public.registrations (user_id, course_id, tenant_id, status, is_waitlist)
    VALUES (p_user_id, p_course_id, v_actor_tenant, 'registered', false);

    RETURN jsonb_build_object('success', true, 'on_waitlist', false);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_register_user_for_course(uuid, uuid) TO authenticated;
