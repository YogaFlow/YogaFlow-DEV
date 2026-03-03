/*
  # Create atomic registration function
  
  1. New Functions
    - `register_for_course`: Atomically checks available spots and registers user
    - Prevents race conditions and overbooking
    - Returns status: 'registered', 'waitlist', or error message
    
  2. Security
    - Function runs with SECURITY DEFINER but checks permissions
    - Only authenticated users with participant role can register
    - Uses row-level locking to prevent concurrent registrations
*/

-- Function to atomically register for a course
CREATE OR REPLACE FUNCTION register_for_course(
  p_course_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_participants integer;
  v_current_count integer;
  v_status registration_status;
  v_registration_id uuid;
  v_has_participant_role boolean;
BEGIN
  -- Check if user has participant role
  SELECT 'participant' = ANY(roles) INTO v_has_participant_role
  FROM users
  WHERE id = p_user_id;
  
  IF NOT v_has_participant_role THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User does not have participant role'
    );
  END IF;

  -- Check if user is already registered
  IF EXISTS (
    SELECT 1 FROM registrations 
    WHERE course_id = p_course_id 
    AND user_id = p_user_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Already registered for this course'
    );
  END IF;

  -- Lock the course row to prevent concurrent modifications
  SELECT max_participants INTO v_max_participants
  FROM courses
  WHERE id = p_course_id
  FOR UPDATE;

  IF v_max_participants IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Course not found'
    );
  END IF;

  -- Count current registrations (excluding cancelled and waitlist)
  SELECT COUNT(*) INTO v_current_count
  FROM registrations
  WHERE course_id = p_course_id
  AND status = 'registered'
  AND cancellation_timestamp IS NULL;

  -- Determine status based on available spots
  IF v_current_count < v_max_participants THEN
    v_status := 'registered';
  ELSE
    v_status := 'waitlist';
  END IF;

  -- Insert the registration
  INSERT INTO registrations (
    course_id,
    user_id,
    status,
    signup_timestamp
  ) VALUES (
    p_course_id,
    p_user_id,
    v_status,
    now()
  )
  RETURNING id INTO v_registration_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', v_status,
    'registration_id', v_registration_id,
    'message', CASE 
      WHEN v_status = 'registered' THEN 'Successfully registered for course'
      ELSE 'Added to waitlist'
    END
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Already registered for this course'
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Function to atomically unregister and promote waitlist
CREATE OR REPLACE FUNCTION unregister_from_course(
  p_course_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_registration_status registration_status;
  v_waitlist_user_id uuid;
  v_waitlist_registration_id uuid;
BEGIN
  -- Get the current registration status
  SELECT status INTO v_registration_status
  FROM registrations
  WHERE course_id = p_course_id
  AND user_id = p_user_id
  AND cancellation_timestamp IS NULL;

  IF v_registration_status IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Registration not found'
    );
  END IF;

  -- Delete the registration
  DELETE FROM registrations
  WHERE course_id = p_course_id
  AND user_id = p_user_id;

  -- If user was registered (not on waitlist), promote first waitlist user
  IF v_registration_status = 'registered' THEN
    -- Lock and get first person from waitlist
    SELECT user_id, id INTO v_waitlist_user_id, v_waitlist_registration_id
    FROM registrations
    WHERE course_id = p_course_id
    AND status = 'waitlist'
    AND cancellation_timestamp IS NULL
    ORDER BY signup_timestamp ASC
    LIMIT 1
    FOR UPDATE;

    -- Promote them if found
    IF v_waitlist_user_id IS NOT NULL THEN
      UPDATE registrations
      SET status = 'registered'
      WHERE id = v_waitlist_registration_id;

      RETURN jsonb_build_object(
        'success', true,
        'message', 'Successfully unregistered and promoted waitlist user',
        'promoted_user_id', v_waitlist_user_id
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Successfully unregistered'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION register_for_course(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION unregister_from_course(uuid, uuid) TO authenticated;