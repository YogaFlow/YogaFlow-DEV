/*
  # Add WITH CHECK to users UPDATE policy

  1. Security Changes
    - Drop old "Users can update own data" policy
    - Create new policy with both USING and WITH CHECK
    - Prevents users from changing their own ID during update
    - Ensures updated data still belongs to the authenticated user

  2. Changes
    - Add WITH CHECK clause to prevent privilege escalation
*/

DROP POLICY IF EXISTS "Users can update own data" ON users;

CREATE POLICY "Users can update own data"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);