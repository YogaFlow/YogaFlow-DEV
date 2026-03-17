/*
  # Allow admins to create courses for any course leader

  1. Problem
    - Policy "Course leaders can create courses" (from 20260122181223) only allows
      teacher_id = auth.uid(), so admins cannot create courses for other teachers.
    - Results in: "new row violates row-level security policy for table courses"

  2. Solution
    - Admins may INSERT when teacher_id is any user with role course_leader or admin.
    - Course leaders may INSERT only for themselves (teacher_id = auth.uid()).
*/

DROP POLICY IF EXISTS "Course leaders can create courses" ON courses;

CREATE POLICY "Course leaders can create courses"
  ON courses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      is_admin()
      AND EXISTS (
        SELECT 1 FROM users
        WHERE users.id = teacher_id
        AND ('course_leader' = ANY(users.roles) OR 'admin' = ANY(users.roles))
      )
    )
    OR
    (
      teacher_id = (select auth.uid())
      AND EXISTS (
        SELECT 1 FROM users
        WHERE users.id = (select auth.uid())
        AND 'course_leader' = ANY(users.roles)
      )
    )
  );
