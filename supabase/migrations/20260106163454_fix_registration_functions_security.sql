/*
  # Fix Registration Functions Security Vulnerability

  1. Security Changes
    - Remove p_user_id parameter from register_for_course function
    - Remove p_user_id parameter from unregister_from_course function
    - Use auth.uid() server-side instead of client-provided user ID
    - This prevents users from registering/unregistering as other users

  2. Changes
    - Drop old function signatures
    - Create new functions with only course_id parameter
    - All user identification done via auth.uid()
    - Fix SQLERRM information disclosure with generic error messages
*/

DROP FUNCTION IF EXISTS register_for_course(uuid, uuid);
DROP FUNCTION IF EXISTS unregister_from_course(uuid, uuid);

CREATE OR REPLACE FUNCTION register_for_course(
  p_course_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_max_participants integer;
  v_current_count integer;
  v_status registration_status;
  v_registration_id uuid;
  v_has_participant_role boolean;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not authenticated'
    );
  END IF;

  SELECT 'participant' = ANY(roles) INTO v_has_participant_role
  FROM users
  WHERE id = v_user_id;
  
  IF NOT v_has_participant_role THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User does not have participant role'
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM registrations 
    WHERE course_id = p_course_id 
    AND user_id = v_user_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Already registered for this course'
    );
  END IF;

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

  SELECT COUNT(*) INTO v_current_count
  FROM registrations
  WHERE course_id = p_course_id
  AND status = 'registered'
  AND cancellation_timestamp IS NULL;

  IF v_current_count < v_max_participants THEN
    v_status := 'registered';
  ELSE
    v_status := 'waitlist';
  END IF;

  INSERT INTO registrations (
    course_id,
    user_id,
    status,
    signup_timestamp
  ) VALUES (
    p_course_id,
    v_user_id,
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
    RAISE WARNING 'Registration error: %', SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'An error occurred during registration. Please try again.'
    );
END;
$$;

CREATE OR REPLACE FUNCTION unregister_from_course(
  p_course_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_registration_status registration_status;
  v_waitlist_user_id uuid;
  v_waitlist_registration_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not authenticated'
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
      'error', 'Registration not found'
    );
  END IF;

  DELETE FROM registrations
  WHERE course_id = p_course_id
  AND user_id = v_user_id;

  IF v_registration_status = 'registered' THEN
    SELECT user_id, id INTO v_waitlist_user_id, v_waitlist_registration_id
    FROM registrations
    WHERE course_id = p_course_id
    AND status = 'waitlist'
    AND cancellation_timestamp IS NULL
    ORDER BY signup_timestamp ASC
    LIMIT 1
    FOR UPDATE;

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
    RAISE WARNING 'Unregistration error: %', SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'An error occurred during unregistration. Please try again.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION register_for_course(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION unregister_from_course(uuid) TO authenticated;