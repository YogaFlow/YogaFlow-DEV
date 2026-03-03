/*
  # Fix Security and Performance Issues

  ## Changes
  
  1. **Indexes**
     - Add covering index for `admin_emails.created_by` foreign key
     - Remove unused index `idx_courses_teacher_id`
  
  2. **Function Security**
     - Add immutable search_path to `create_password_reset_token`
     - Add immutable search_path to `create_verification_token`
     - Add immutable search_path to `verify_token`
  
  3. **Notes**
     - Leaked password protection must be enabled in Supabase Dashboard
     - This enhances security by preventing use of compromised passwords
*/

-- Add covering index for admin_emails.created_by foreign key
CREATE INDEX IF NOT EXISTS idx_admin_emails_created_by 
ON admin_emails(created_by);

-- Remove unused index on courses.teacher_id
DROP INDEX IF EXISTS idx_courses_teacher_id;

-- Fix create_password_reset_token function with immutable search_path
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
  UPDATE auth_tokens
  SET used_at = now()
  WHERE user_id = p_user_id
    AND token_type = 'password_reset'
    AND used_at IS NULL;

  v_token := encode(gen_random_bytes(32), 'base64');
  v_token := replace(v_token, '/', '_');
  v_token := replace(v_token, '+', '-');
  v_token := replace(v_token, '=', '');
  
  v_expires_at := now() + INTERVAL '1 hour';

  INSERT INTO auth_tokens (user_id, token, token_type, expires_at)
  VALUES (p_user_id, v_token, 'password_reset', v_expires_at);

  RETURN QUERY SELECT v_token, v_expires_at;
END;
$$;

-- Fix create_verification_token function with immutable search_path
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
  UPDATE auth_tokens
  SET used_at = now()
  WHERE user_id = p_user_id
    AND token_type = 'email_verification'
    AND used_at IS NULL;

  v_token := encode(gen_random_bytes(32), 'base64');
  v_token := replace(v_token, '/', '_');
  v_token := replace(v_token, '+', '-');
  v_token := replace(v_token, '=', '');
  
  v_expires_at := now() + INTERVAL '24 hours';

  INSERT INTO auth_tokens (user_id, token, token_type, expires_at)
  VALUES (p_user_id, v_token, 'email_verification', v_expires_at);

  RETURN QUERY SELECT v_token, v_expires_at;
END;
$$;

-- Fix verify_token function with immutable search_path
DROP FUNCTION IF EXISTS verify_token(text);
CREATE OR REPLACE FUNCTION verify_token(p_token text)
RETURNS TABLE (
  user_id uuid,
  token_type text,
  is_valid boolean,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token_record RECORD;
BEGIN
  SELECT t.id, t.user_id, t.token_type, t.expires_at, t.used_at
  INTO v_token_record
  FROM auth_tokens t
  WHERE t.token = p_token;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      NULL::uuid,
      NULL::text,
      false,
      'Invalid token'::text;
    RETURN;
  END IF;

  IF v_token_record.used_at IS NOT NULL THEN
    RETURN QUERY SELECT 
      v_token_record.user_id,
      v_token_record.token_type,
      false,
      'Token already used'::text;
    RETURN;
  END IF;

  IF v_token_record.expires_at < now() THEN
    RETURN QUERY SELECT 
      v_token_record.user_id,
      v_token_record.token_type,
      false,
      'Token expired'::text;
    RETURN;
  END IF;

  UPDATE auth_tokens
  SET used_at = now()
  WHERE id = v_token_record.id;

  IF v_token_record.token_type = 'email_verification' THEN
    UPDATE users
    SET email_verified = true
    WHERE id = v_token_record.user_id;
  END IF;

  RETURN QUERY SELECT 
    v_token_record.user_id,
    v_token_record.token_type,
    true,
    'Token verified successfully'::text;
END;
$$;