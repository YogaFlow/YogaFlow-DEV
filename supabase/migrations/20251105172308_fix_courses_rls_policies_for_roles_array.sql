/*
  # Fix RLS policies for courses table to use roles array
  
  1. Changes
    - Drop old policies that check user_role enum
    - Create new policies that check roles array
    - Support admin and course_leader roles
    
  2. Security
    - Authenticated users can read all courses
    - Admins can manage all courses
    - Course leaders can create, update, and delete their own courses
*/

-- Drop all existing policies for courses table
DROP POLICY IF EXISTS "Admins can manage all courses" ON courses;
DROP POLICY IF EXISTS "Anyone can read courses" ON courses;
DROP POLICY IF EXISTS "Teachers can create courses" ON courses;
DROP POLICY IF EXISTS "Teachers can delete own courses" ON courses;
DROP POLICY IF EXISTS "Teachers can update own courses" ON courses;

-- SELECT: Anyone authenticated can read courses
CREATE POLICY "Anyone can read courses"
  ON courses
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: Course leaders and admins can create courses
CREATE POLICY "Course leaders can create courses"
  ON courses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = teacher_id 
    AND EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND ('course_leader' = ANY(users.roles) OR 'admin' = ANY(users.roles))
    )
  );

-- UPDATE: Course leaders can update their own courses, admins can update all
CREATE POLICY "Course leaders can update own courses"
  ON courses
  FOR UPDATE
  TO authenticated
  USING (
    (auth.uid() = teacher_id AND EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND 'course_leader' = ANY(users.roles)
    ))
    OR EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND 'admin' = ANY(users.roles)
    )
  )
  WITH CHECK (
    (auth.uid() = teacher_id AND EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND 'course_leader' = ANY(users.roles)
    ))
    OR EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND 'admin' = ANY(users.roles)
    )
  );

-- DELETE: Course leaders can delete their own courses, admins can delete all
CREATE POLICY "Course leaders can delete own courses"
  ON courses
  FOR DELETE
  TO authenticated
  USING (
    (auth.uid() = teacher_id AND EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND 'course_leader' = ANY(users.roles)
    ))
    OR EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND 'admin' = ANY(users.roles)
    )
  );
