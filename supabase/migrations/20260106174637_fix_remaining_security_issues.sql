/*
  # Fix Remaining Security Issues

  1. Performance Improvements
    - Add index for courses.teacher_id foreign key to improve join performance
    - Remove unused idx_admin_emails_created_by index

  2. Policy Consolidation
    - Consolidate multiple permissive policies on users table into single policies
    - This reduces policy evaluation overhead and simplifies access control logic

  3. Function Search Paths
    - Ensure all functions have immutable search paths for security

  Important Notes:
    - Single policies with OR logic are more efficient than multiple permissive policies
    - All functionality remains identical, only performance is improved
*/

-- ============================================================================
-- STEP 1: Fix indexes
-- ============================================================================

-- Add missing index for courses.teacher_id foreign key
CREATE INDEX IF NOT EXISTS idx_courses_teacher_id ON public.courses(teacher_id);

-- Remove unused index
DROP INDEX IF EXISTS public.idx_admin_emails_created_by;

-- ============================================================================
-- STEP 2: Consolidate users table policies
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can read own data" ON public.users;
DROP POLICY IF EXISTS "Admins can read all users" ON public.users;
DROP POLICY IF EXISTS "Users can update own data" ON public.users;
DROP POLICY IF EXISTS "Admins can update all users" ON public.users;

-- Create consolidated SELECT policy
CREATE POLICY "Users can read data"
  ON public.users FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) = id OR
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = (select auth.uid())
      AND 'admin' = ANY(users.roles)
    )
  );

-- Create consolidated UPDATE policy
CREATE POLICY "Users can update data"
  ON public.users FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) = id OR
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = (select auth.uid())
      AND 'admin' = ANY(users.roles)
    )
  )
  WITH CHECK (
    (select auth.uid()) = id OR
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = (select auth.uid())
      AND 'admin' = ANY(users.roles)
    )
  );

-- ============================================================================
-- STEP 3: Ensure functions have proper search paths
-- ============================================================================

-- Recreate register_for_course with explicit search_path
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
  v_result json;
BEGIN
  SELECT max_participants, date INTO v_max_participants, v_course_date
  FROM public.courses
  WHERE id = p_course_id;

  IF v_course_date < CURRENT_DATE THEN
    RETURN json_build_object('success', false, 'message', 'Cannot register for past courses');
  END IF;

  SELECT COUNT(*) INTO v_current_count
  FROM public.registrations
  WHERE course_id = p_course_id AND status = 'registered';

  IF v_current_count >= v_max_participants THEN
    INSERT INTO public.registrations (user_id, course_id, status)
    VALUES (p_user_id, p_course_id, 'waitlist')
    ON CONFLICT (user_id, course_id) DO UPDATE SET status = 'waitlist';
    
    RETURN json_build_object('success', true, 'message', 'Added to waitlist');
  ELSE
    INSERT INTO public.registrations (user_id, course_id, status)
    VALUES (p_user_id, p_course_id, 'registered')
    ON CONFLICT (user_id, course_id) DO UPDATE SET status = 'registered';
    
    RETURN json_build_object('success', true, 'message', 'Registration successful');
  END IF;
END;
$$;

-- Recreate unregister_from_course with explicit search_path
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
  v_result json;
BEGIN
  DELETE FROM public.registrations
  WHERE course_id = p_course_id AND user_id = p_user_id;

  RETURN json_build_object('success', true, 'message', 'Unregistration successful');
END;
$$;