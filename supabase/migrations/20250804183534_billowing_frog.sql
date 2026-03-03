/*
  # Fix infinite recursion in users table policies

  1. Security Changes
    - Drop existing problematic policies that cause recursion
    - Create simplified policies that don't reference the users table recursively
    - Use auth.uid() directly instead of querying users table for role checks

  2. Policy Changes
    - Users can read their own data using auth.uid()
    - Users can update their own data using auth.uid()
    - Admins can manage all users (checked via separate admin function)
*/

-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Admins can manage all users" ON users;

-- Create a function to check if user is admin without recursion
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.users.id = auth.uid() 
    AND auth.users.raw_user_meta_data->>'role' = 'admin'
  );
$$;

-- Simple policy for users to read their own data
CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Simple policy for users to update their own data
CREATE POLICY "Users can update own data"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- Policy for admins to manage all users (using the non-recursive function)
CREATE POLICY "Admins can manage all users"
  ON users
  FOR ALL
  TO authenticated
  USING (is_admin());