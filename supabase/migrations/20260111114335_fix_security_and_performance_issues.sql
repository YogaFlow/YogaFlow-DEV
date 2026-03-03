/*
  # Fix Security and Performance Issues

  This migration addresses critical security and performance issues identified in the database audit:

  ## 1. Performance Improvements
    - Add missing index on `courses.teacher_id` foreign key
    - Remove unused indexes:
      - `idx_admin_emails_created_by`
      - `idx_auth_tokens_token`
      - `idx_auth_tokens_expires`
      - `idx_auth_tokens_used`

  ## 2. Security Fixes
    - Fix RLS policy initialization plan for `auth_tokens` table
    - Set immutable search_path for all auth token functions:
      - `create_password_reset_token`
      - `cleanup_expired_tokens`
      - `create_verification_token`
      - `verify_token`
      - `mark_token_used`

  ## 3. Notes
    - Leaked Password Protection must be enabled manually in Supabase Dashboard → Authentication → Policies
*/

-- =====================================================
-- 1. ADD MISSING INDEX FOR FOREIGN KEY
-- =====================================================

-- Add index for courses.teacher_id foreign key for optimal join performance
CREATE INDEX IF NOT EXISTS idx_courses_teacher_id ON courses(teacher_id);

-- =====================================================
-- 2. REMOVE UNUSED INDEXES
-- =====================================================

-- These indexes were created but are not being used by any queries
DROP INDEX IF EXISTS idx_admin_emails_created_by;
DROP INDEX IF EXISTS idx_auth_tokens_token;
DROP INDEX IF EXISTS idx_auth_tokens_expires;
DROP INDEX IF EXISTS idx_auth_tokens_used;

-- =====================================================
-- 3. FIX RLS POLICY INITIALIZATION PLAN
-- =====================================================

-- Drop existing policy
DROP POLICY IF EXISTS "Service role can manage all tokens" ON auth_tokens;

-- Recreate with optimized initialization plan using (select auth.jwt())
CREATE POLICY "Service role can manage all tokens"
  ON auth_tokens
  FOR ALL
  TO service_role
  USING (
    (select auth.jwt())->>'role' = 'service_role'
  );

-- =====================================================
-- 4. FIX FUNCTION SEARCH PATH MUTABILITY
-- =====================================================

-- Drop and recreate all auth token functions with immutable search_path

-- Function: create_password_reset_token
DROP FUNCTION IF EXISTS create_password_reset_token(uuid, text);
CREATE OR REPLACE FUNCTION create_password_reset_token(
  p_user_id uuid,
  p_email text
)
RETURNS TABLE (token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token text;
  v_expires_at timestamptz;
BEGIN
  -- Generate secure random token
  v_token := encode(gen_random_bytes(32), 'base64');
  v_expires_at := now() + INTERVAL '1 hour';
  
  -- Insert token
  INSERT INTO auth_tokens (user_id, email, token, token_type, expires_at)
  VALUES (p_user_id, p_email, v_token, 'password_reset', v_expires_at);
  
  RETURN QUERY SELECT v_token, v_expires_at;
END;
$$;

-- Function: cleanup_expired_tokens
DROP FUNCTION IF EXISTS cleanup_expired_tokens();
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM auth_tokens
  WHERE expires_at < now()
    OR (used_at IS NOT NULL AND used_at < now() - INTERVAL '7 days');
END;
$$;

-- Function: create_verification_token
DROP FUNCTION IF EXISTS create_verification_token(uuid, text);
CREATE OR REPLACE FUNCTION create_verification_token(
  p_user_id uuid,
  p_email text
)
RETURNS TABLE (token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token text;
  v_expires_at timestamptz;
BEGIN
  -- Generate secure random token
  v_token := encode(gen_random_bytes(32), 'base64');
  v_expires_at := now() + INTERVAL '24 hours';
  
  -- Insert token
  INSERT INTO auth_tokens (user_id, email, token, token_type, expires_at)
  VALUES (p_user_id, p_email, v_token, 'email_verification', v_expires_at);
  
  RETURN QUERY SELECT v_token, v_expires_at;
END;
$$;

-- Function: verify_token
DROP FUNCTION IF EXISTS verify_token(text);
CREATE OR REPLACE FUNCTION verify_token(p_token text)
RETURNS TABLE (
  user_id uuid,
  email text,
  token_type text,
  is_valid boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    at.user_id,
    at.email,
    at.token_type,
    (at.expires_at > now() AND at.used_at IS NULL)::boolean as is_valid
  FROM auth_tokens at
  WHERE at.token = p_token;
END;
$$;

-- Function: mark_token_used
DROP FUNCTION IF EXISTS mark_token_used(text);
CREATE OR REPLACE FUNCTION mark_token_used(p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated boolean;
BEGIN
  UPDATE auth_tokens
  SET used_at = now()
  WHERE token = p_token
    AND expires_at > now()
    AND used_at IS NULL;
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- =====================================================
-- 5. GRANT NECESSARY PERMISSIONS
-- =====================================================

-- Ensure service_role can execute these functions
GRANT EXECUTE ON FUNCTION create_password_reset_token(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_expired_tokens() TO service_role;
GRANT EXECUTE ON FUNCTION create_verification_token(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION verify_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION mark_token_used(text) TO service_role;