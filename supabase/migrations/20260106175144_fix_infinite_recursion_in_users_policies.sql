/*
  # Fix Infinite Recursion in Users Table Policies

  1. Problem
    - Consolidated policies check the users table to determine if a user is admin
    - This creates infinite recursion as the policy queries the same table it protects

  2. Solution
    - Create a SECURITY DEFINER function that bypasses RLS to check admin status
    - Use this function in policies to break the recursion cycle
    - Separate policies back to avoid recursion while maintaining security

  3. Security
    - Function uses SECURITY DEFINER to bypass RLS safely
    - Function only returns boolean, no sensitive data exposed
    - Policies remain secure and properly restrict access
*/

-- ============================================================================
-- STEP 1: Create helper function to check admin status without RLS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = user_id
    AND 'admin' = ANY(roles)
  );
END;
$$;

-- ============================================================================
-- STEP 2: Drop problematic consolidated policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can read data" ON public.users;
DROP POLICY IF EXISTS "Users can update data" ON public.users;

-- ============================================================================
-- STEP 3: Create new policies using the helper function
-- ============================================================================

-- SELECT policy for own data
CREATE POLICY "Users can read own data"
  ON public.users FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = id);

-- SELECT policy for admins
CREATE POLICY "Admins can read all users"
  ON public.users FOR SELECT
  TO authenticated
  USING (public.is_admin((select auth.uid())));

-- UPDATE policy for own data
CREATE POLICY "Users can update own data"
  ON public.users FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- UPDATE policy for admins
CREATE POLICY "Admins can update all users"
  ON public.users FOR UPDATE
  TO authenticated
  USING (public.is_admin((select auth.uid())))
  WITH CHECK (public.is_admin((select auth.uid())));