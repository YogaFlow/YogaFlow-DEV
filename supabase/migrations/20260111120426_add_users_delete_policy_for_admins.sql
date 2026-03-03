/*
  # Add DELETE policy for users table

  1. Security Changes
    - Add DELETE policy allowing admins to delete users from the users table
    - Only authenticated admins can delete user profiles
*/

CREATE POLICY "Admins can delete users"
  ON users
  FOR DELETE
  TO authenticated
  USING (is_admin((SELECT auth.uid())));
