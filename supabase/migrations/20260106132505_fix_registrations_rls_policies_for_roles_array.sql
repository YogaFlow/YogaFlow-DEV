/*
  # Fix RLS policies for registrations table to use roles array
  
  1. Changes
    - Drop old policies that check role enum
    - Create new policies that check roles array
    - Ensure participants can register for courses
    - Support admin and course_leader roles
    
  2. Security
    - Authenticated users with participant role can create registrations
    - Users can read and delete their own registrations
    - Course leaders can manage registrations for their courses
    - Admins can manage all registrations
*/

-- Drop existing policies for registrations table
DROP POLICY IF EXISTS "Users can read own registrations" ON registrations;
DROP POLICY IF EXISTS "Users can create registrations" ON registrations;
DROP POLICY IF EXISTS "Users can delete own registrations" ON registrations;
DROP POLICY IF EXISTS "Teachers can read course registrations" ON registrations;
DROP POLICY IF EXISTS "Teachers can manage course registrations" ON registrations;
DROP POLICY IF EXISTS "Admins can manage all registrations" ON registrations;

-- SELECT: Users can read their own registrations
CREATE POLICY "Users can read own registrations"
  ON registrations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- SELECT: Course leaders can read registrations for their courses
CREATE POLICY "Course leaders can read course registrations"
  ON registrations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses 
      WHERE courses.id = registrations.course_id 
      AND courses.teacher_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
        AND ('course_leader' = ANY(users.roles) OR 'admin' = ANY(users.roles))
      )
    )
  );

-- SELECT: Admins can read all registrations
CREATE POLICY "Admins can read all registrations"
  ON registrations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND 'admin' = ANY(users.roles)
    )
  );

-- INSERT: Participants can create registrations
CREATE POLICY "Participants can create registrations"
  ON registrations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND 'participant' = ANY(users.roles)
    )
  );

-- DELETE: Users can delete their own registrations
CREATE POLICY "Users can delete own registrations"
  ON registrations
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- UPDATE: Course leaders can update registrations for their courses (e.g., status changes)
CREATE POLICY "Course leaders can update course registrations"
  ON registrations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses 
      WHERE courses.id = registrations.course_id 
      AND courses.teacher_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
        AND ('course_leader' = ANY(users.roles) OR 'admin' = ANY(users.roles))
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses 
      WHERE courses.id = registrations.course_id 
      AND courses.teacher_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
        AND ('course_leader' = ANY(users.roles) OR 'admin' = ANY(users.roles))
      )
    )
  );

-- UPDATE: Admins can update all registrations
CREATE POLICY "Admins can update all registrations"
  ON registrations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND 'admin' = ANY(users.roles)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND 'admin' = ANY(users.roles)
    )
  );

-- DELETE: Admins can delete all registrations
CREATE POLICY "Admins can delete all registrations"
  ON registrations
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND 'admin' = ANY(users.roles)
    )
  );