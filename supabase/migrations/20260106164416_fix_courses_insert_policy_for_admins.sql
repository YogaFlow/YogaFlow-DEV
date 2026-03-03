/*
  # Fix courses INSERT policy to allow admins to create courses for any teacher

  1. Problem
    - Current policy requires auth.uid() = teacher_id AND admin/course_leader role
    - This prevents admins from creating courses for other course leaders
    - When admin creates course for teacher, auth.uid() (admin) != teacher_id (teacher)

  2. Solution
    - Admins can create courses for any valid course leader
    - Course leaders can only create courses for themselves (auth.uid() = teacher_id)
    - Validates that the selected teacher_id has course_leader or admin role

  3. Changes
    - Drop old "Course leaders can create courses" policy
    - Create new policy with separate logic for admins and course leaders
*/

DROP POLICY IF EXISTS "Course leaders can create courses" ON courses;

CREATE POLICY "Course leaders can create courses"
  ON courses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM users 
        WHERE users.id = auth.uid() 
        AND 'admin' = ANY(users.roles)
      )
      AND EXISTS (
        SELECT 1 FROM users 
        WHERE users.id = teacher_id 
        AND ('course_leader' = ANY(users.roles) OR 'admin' = ANY(users.roles))
      )
    )
    OR
    (
      auth.uid() = teacher_id 
      AND EXISTS (
        SELECT 1 FROM users 
        WHERE users.id = auth.uid() 
        AND 'course_leader' = ANY(users.roles)
      )
    )
  );