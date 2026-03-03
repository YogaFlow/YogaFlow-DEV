/*
  # Prevent Self-Role Escalation Security Fix
  
  1. Security Issue
    - Users could potentially modify their own roles array
    - This would allow privilege escalation (participant -> admin)
  
  2. Solution
    - Add trigger function that prevents non-admins from changing roles
    - Trigger fires BEFORE UPDATE on users table
    - Only admins can modify the roles field
    
  3. How It Works
    - When a user updates their profile, the trigger checks:
      a) If the roles field is being changed
      b) If the current user is NOT an admin
    - If both conditions are true, the roles change is rejected
    - The update continues with the original roles value
*/

-- Create function to prevent role escalation
CREATE OR REPLACE FUNCTION prevent_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_current_user_admin boolean;
BEGIN
  -- Check if roles field is being changed
  IF OLD.roles IS DISTINCT FROM NEW.roles THEN
    -- Check if the current user is an admin
    SELECT EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND 'admin' = ANY(roles)
    ) INTO is_current_user_admin;
    
    -- If not admin, prevent role change by keeping old roles
    IF NOT is_current_user_admin THEN
      NEW.roles := OLD.roles;
      RAISE NOTICE 'Role change blocked: Only admins can modify user roles';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on users table
DROP TRIGGER IF EXISTS check_role_escalation ON users;
CREATE TRIGGER check_role_escalation
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION prevent_role_escalation();

-- Also add index for faster admin checks
CREATE INDEX IF NOT EXISTS idx_users_admin_role ON users USING GIN(roles) WHERE 'admin' = ANY(roles);