/*
  # Fix Registrations DELETE Policy for Course Leaders

  1. Problem
    - Course leaders cannot delete their series courses because CASCADE delete
      tries to delete registrations from other users
    - Current RLS policy only allows users to delete their own registrations

  2. Solution
    - Add policy allowing course leaders to delete registrations for courses they teach
    - This enables CASCADE delete to work when course leaders delete their courses

  3. Security
    - Course leaders can only delete registrations for their own courses (teacher_id check)
    - Admins retain full delete access
    - Users can still delete their own registrations
*/

-- Drop existing policy
DROP POLICY IF EXISTS "Users can delete own registrations" ON public.registrations;

-- Create new consolidated policy that allows:
-- 1. Users to delete their own registrations
-- 2. Course leaders to delete registrations for their courses
-- 3. Admins to delete any registrations
CREATE POLICY "Users or course leaders can delete registrations"
  ON public.registrations
  FOR DELETE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR 
    EXISTS (
      SELECT 1 FROM public.courses
      WHERE courses.id = registrations.course_id
      AND courses.teacher_id = (SELECT auth.uid())
    )
    OR
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
      AND 'admin' = ANY(users.roles)
    )
  );
