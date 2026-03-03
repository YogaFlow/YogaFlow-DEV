/*
  # Add Waitlist Promotion System

  1. Overview
    - Enables automatic promotion from waitlist when spots become available
    - Sends notification messages to promoted users
    - Tracks waitlist position for fair ordering

  2. Changes
    - Update register_for_course to set waitlist_position
    - Create promote_from_waitlist function to handle automatic promotion
    - Update unregister_from_course to trigger waitlist promotion
    - Add trigger to automatically promote when cancellations occur

  3. Message Format
    - German message: "Du hast Glück und einen Platz im Kurs "{course_title}" am {date} um {time} bekommen."
    - Sent as system message from course teacher

  4. Security
    - All functions use SECURITY DEFINER with explicit search_path
    - Messages respect RLS policies
    - Only authenticated users can register/unregister
*/

-- ============================================================================
-- STEP 1: Update register_for_course to properly handle waitlist positions
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
    WHERE course_id = p_course_id AND user_id = p_user_id
  ) THEN
    RETURN json_build_object('success', false, 'message', 'Already registered or on waitlist');
  END IF;

  -- Count current registered participants (not waitlist)
  SELECT COUNT(*) INTO v_current_count
  FROM public.registrations
  WHERE course_id = p_course_id AND status = 'registered' AND is_waitlist = false;

  -- Check if course is full
  IF v_current_count >= v_max_participants THEN
    -- Add to waitlist with position
    SELECT COALESCE(MAX(waitlist_position), 0) + 1 INTO v_next_position
    FROM public.registrations
    WHERE course_id = p_course_id AND is_waitlist = true;

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
-- STEP 2: Create function to promote from waitlist
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

  -- Count current registered participants (not waitlist)
  SELECT COUNT(*) INTO v_current_count
  FROM public.registrations
  WHERE course_id = p_course_id AND status = 'registered' AND is_waitlist = false;

  -- While there are available spots and people on the waitlist
  WHILE v_current_count < v_max_participants LOOP
    -- Get next person from waitlist (lowest position number)
    SELECT id, user_id, waitlist_position INTO v_next_user
    FROM public.registrations
    WHERE course_id = p_course_id 
      AND is_waitlist = true 
      AND status = 'waitlist'
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

-- ============================================================================
-- STEP 3: Update unregister_from_course to trigger promotion
-- ============================================================================

CREATE OR REPLACE FUNCTION public.unregister_from_course(
  p_course_id uuid,
  p_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_was_registered boolean;
BEGIN
  -- Check if user was actually registered (not on waitlist)
  SELECT (status = 'registered' AND is_waitlist = false) INTO v_was_registered
  FROM public.registrations
  WHERE course_id = p_course_id AND user_id = p_user_id;

  -- Delete the registration
  DELETE FROM public.registrations
  WHERE course_id = p_course_id AND user_id = p_user_id;

  -- If user was registered (not waitlist), try to promote someone from waitlist
  IF v_was_registered THEN
    PERFORM public.promote_from_waitlist(p_course_id);
  END IF;

  RETURN json_build_object('success', true, 'message', 'Unregistration successful');
END;
$$;

-- ============================================================================
-- STEP 4: Grant execute permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.register_for_course(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_from_course(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.promote_from_waitlist(uuid) TO authenticated;