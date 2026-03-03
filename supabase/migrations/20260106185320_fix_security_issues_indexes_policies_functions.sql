/*
  # Fix Security Issues - Indexes, Policies, and Functions

  1. Indexes
    - Add missing index on admin_emails.created_by for foreign key performance
    - Drop unused idx_courses_teacher_id index

  2. Policies
    - Consolidate multiple permissive SELECT policies on users table into one
    - Consolidate multiple permissive UPDATE policies on users table into one

  3. Functions
    - Fix search_path for register_for_course(uuid) to prevent search path injection
    - Fix search_path for unregister_from_course(uuid) to prevent search path injection

  4. Security Notes
    - Mutable search_path in SECURITY DEFINER functions is a security risk
    - Multiple permissive policies can be confusing and lead to unintended access
*/

-- 1. Add index on admin_emails.created_by for foreign key performance
CREATE INDEX IF NOT EXISTS idx_admin_emails_created_by ON public.admin_emails(created_by);

-- 2. Drop unused index on courses.teacher_id
DROP INDEX IF EXISTS idx_courses_teacher_id;

-- 3. Consolidate users SELECT policies
DROP POLICY IF EXISTS "Admins can read all users" ON public.users;
DROP POLICY IF EXISTS "Users can read own data" ON public.users;

CREATE POLICY "Users can read own data or admins can read all"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = id 
    OR 
    is_admin((SELECT auth.uid()))
  );

-- 4. Consolidate users UPDATE policies
DROP POLICY IF EXISTS "Admins can update all users" ON public.users;
DROP POLICY IF EXISTS "Users can update own data" ON public.users;

CREATE POLICY "Users can update own data or admins can update all"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) = id 
    OR 
    is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    (SELECT auth.uid()) = id 
    OR 
    is_admin((SELECT auth.uid()))
  );

-- 5. Fix search_path for register_for_course(uuid)
CREATE OR REPLACE FUNCTION public.register_for_course(p_course_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid;
  v_max_participants integer;
  v_current_count integer;
  v_status public.registration_status;
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
  FROM public.users
  WHERE id = v_user_id;

  IF NOT v_has_participant_role THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User does not have participant role'
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.registrations 
    WHERE course_id = p_course_id 
    AND user_id = v_user_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Already registered for this course'
    );
  END IF;

  SELECT max_participants INTO v_max_participants
  FROM public.courses
  WHERE id = p_course_id
  FOR UPDATE;

  IF v_max_participants IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Course not found'
    );
  END IF;

  SELECT COUNT(*) INTO v_current_count
  FROM public.registrations
  WHERE course_id = p_course_id
  AND status = 'registered'
  AND cancellation_timestamp IS NULL;

  IF v_current_count < v_max_participants THEN
    v_status := 'registered';
  ELSE
    v_status := 'waitlist';
  END IF;

  INSERT INTO public.registrations (
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
$function$;

-- 6. Fix search_path for unregister_from_course(uuid)
CREATE OR REPLACE FUNCTION public.unregister_from_course(p_course_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid;
  v_registration_status public.registration_status;
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
  FROM public.registrations
  WHERE course_id = p_course_id
  AND user_id = v_user_id
  AND cancellation_timestamp IS NULL;

  IF v_registration_status IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Registration not found'
    );
  END IF;

  DELETE FROM public.registrations
  WHERE course_id = p_course_id
  AND user_id = v_user_id;

  IF v_registration_status = 'registered' THEN
    SELECT user_id, id INTO v_waitlist_user_id, v_waitlist_registration_id
    FROM public.registrations
    WHERE course_id = p_course_id
    AND status = 'waitlist'
    AND cancellation_timestamp IS NULL
    ORDER BY signup_timestamp ASC
    LIMIT 1
    FOR UPDATE;

    IF v_waitlist_user_id IS NOT NULL THEN
      UPDATE public.registrations
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
$function$;
