/*
  # Fix is_admin function for roles array
  
  1. Changes
    - Drop and recreate is_admin() function to check roles array in users table
    - Recreate policy that depends on this function
    - Ensure function works with new multi-role system
    
  2. Security
    - Function checks authenticated user's roles
    - Admin policy reinstated
*/

-- Drop old function with cascade
DROP FUNCTION IF EXISTS is_admin() CASCADE;

-- Create updated function that checks roles array
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND 'admin' = ANY(users.roles)
  );
$$;

-- Recreate the admin policy
CREATE POLICY "Admins can manage all users"
  ON users
  FOR ALL
  TO authenticated
  USING (is_admin());