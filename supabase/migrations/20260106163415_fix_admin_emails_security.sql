/*
  # Fix Admin Emails Security Vulnerability

  1. Security Changes
    - Drop the insecure "Anyone authenticated can read admin emails" policy
    - Create restrictive policy that only allows admins to read admin emails
    - This prevents information disclosure of admin email addresses

  2. Changes
    - Remove USING (true) policy
    - Add admin-only read policy with proper role check
*/

DROP POLICY IF EXISTS "Anyone authenticated can read admin emails" ON admin_emails;

CREATE POLICY "Only admins can read admin emails"
  ON admin_emails FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND 'admin' = ANY(users.roles)
    )
  );