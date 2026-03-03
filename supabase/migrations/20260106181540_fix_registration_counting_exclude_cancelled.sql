/*
  # Fix Registration Counting to Exclude Cancelled Registrations

  1. Problem
    - The register_for_course function counts cancelled registrations (cancellation_timestamp IS NOT NULL) as active participants
    - This causes the course to appear full even when cancelled spots are available
    - Users are incorrectly placed on waitlist when spots are actually available

  2. Solution
    - Update register_for_course to exclude cancelled registrations when counting participants
    - Update promote_from_waitlist to exclude cancelled registrations when counting participants
    - Ensure only active registrations (cancellation_timestamp IS NULL) are counted

  3. Changes
    - Modify register_for_course: Add AND cancellation_timestamp IS NULL to participant count
    - Modify promote_from_waitlist: Add AND cancellation_timestamp IS NULL to participant count
*/

-- ============================================================================
-- Update register_for_course to exclude cancelled registrations
-- ============================================================================

CREATE OR REPLACE FUNCTION public.register_for_course(
  p_course_id uuid,
  p_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_max_participants integer;
  v_current_count integer;
  v_course_date date;
  v_next_position integer;
  v_result json;
BEGIN
  -- Get course details
  SELECT max_participants, date INTO v_max_participants, v_course_date
  FROM public.courses
  WHERE id = p_course_id;

  -- Check if course date is in the past
  IF v_course_date < CURRENT_DATE THEN
    RETURN json_build_object('success', false, 'message', 'Cannot register for past courses');
  END IF;

  -- Check if user is already registered or on waitlist
  IF EXISTS (
    SELECT 1 FROM public.registrations
    WHERE course_id = p_course_id AND user_id = p_user_id AND cancellation_timestamp IS NULL
  ) THEN
    RETURN json_build_object('success', false, 'message', 'Already registered or on waitlist');
  END IF;

  -- Count current registered participants (not waitlist, not cancelled)
  SELECT COUNT(*) INTO v_current_count
  FROM public.registrations
  WHERE course_id = p_course_id 
    AND status = 'registered' 
    AND is_waitlist = false 
    AND cancellation_timestamp IS NULL;

  -- Check if course is full
  IF v_current_count >= v_max_participants THEN
    -- Add to waitlist with position
    SELECT COALESCE(MAX(waitlist_position), 0) + 1 INTO v_next_position
    FROM public.registrations
    WHERE course_id = p_course_id AND is_waitlist = true AND cancellation_timestamp IS NULL;

    INSERT INTO public.registrations (user_id, course_id, status, is_waitlist, waitlist_position)
    VALUES (p_user_id, p_course_id, 'waitlist', true, v_next_position);
    
    RETURN json_build_object(
      'success', true, 
      'message', 'Added to waitlist', 
      'waitlist_position', v_next_position
    );
  ELSE
    -- Register normally
    INSERT INTO public.registrations (user_id, course_id, status, is_waitlist, waitlist_position)
    VALUES (p_user_id, p_course_id, 'registered', false, NULL);
    
    RETURN json_build_object('success', true, 'message', 'Registration successful');
  END IF;
END;
$$;

-- ============================================================================
-- Update promote_from_waitlist to exclude cancelled registrations
-- ============================================================================

CREATE OR REPLACE FUNCTION public.promote_from_waitlist(p_course_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
  -- Get course details
  SELECT max_participants, title, date, time, teacher_id 
  INTO v_max_participants, v_course_title, v_course_date, v_course_time, v_teacher_id
  FROM public.courses
  WHERE id = p_course_id;

  -- Count current registered participants (not waitlist, not cancelled)
  SELECT COUNT(*) INTO v_current_count
  FROM public.registrations
  WHERE course_id = p_course_id 
    AND status = 'registered' 
    AND is_waitlist = false 
    AND cancellation_timestamp IS NULL;

  -- While there are available spots and people on the waitlist
  WHILE v_current_count < v_max_participants LOOP
    -- Get next person from waitlist (lowest position number)
    SELECT id, user_id, waitlist_position INTO v_next_user
    FROM public.registrations
    WHERE course_id = p_course_id 
      AND is_waitlist = true 
      AND status = 'waitlist'
      AND cancellation_timestamp IS NULL
    ORDER BY waitlist_position ASC
    LIMIT 1;

    -- Exit if no one is on waitlist
    EXIT WHEN v_next_user.id IS NULL;

    -- Promote user from waitlist
    UPDATE public.registrations
    SET status = 'registered',
        is_waitlist = false,
        waitlist_position = NULL,
        registered_at = now()
    WHERE id = v_next_user.id;

    -- Format the message
    v_message_content := format(
      'Du hast Glück und einen Platz im Kurs "%s" am %s um %s bekommen.',
      v_course_title,
      to_char(v_course_date, 'DD.MM.YYYY'),
      to_char(v_course_time, 'HH24:MI')
    );

    -- Send notification message to promoted user
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

    -- Update count for next iteration
    v_current_count := v_current_count + 1;
  END LOOP;
END;
$$;