/*
  # Fix auth token functions to use correct column names

  ## Problem
  - Table `auth_tokens` has columns: `type`, `used`
  - Some functions incorrectly reference: `token_type`, `used_at`
  - This causes "column does not exist" errors

  ## Solution
  - Drop all existing token functions
  - Recreate them with correct column names matching the table schema
*/

-- Drop existing functions first
DROP FUNCTION IF EXISTS create_verification_token(uuid, text);
DROP FUNCTION IF EXISTS create_verification_token(uuid);
DROP FUNCTION IF EXISTS create_password_reset_token(uuid);
DROP FUNCTION IF EXISTS verify_token(text, text);
DROP FUNCTION IF EXISTS verify_token(text);
DROP FUNCTION IF EXISTS mark_token_used(text);

-- Recreate create_verification_token function
CREATE OR REPLACE FUNCTION create_verification_token(p_user_id uuid, p_email text)
RETURNS TABLE(token text) AS $$
DECLARE
  v_token text;
BEGIN
  UPDATE auth_tokens
  SET used = true
  WHERE user_id = p_user_id
  AND type = 'email_verification'
  AND NOT used;

  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO auth_tokens (user_id, token, type, expires_at)
  VALUES (p_user_id, v_token, 'email_verification', now() + INTERVAL '24 hours');

  RETURN QUERY SELECT v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate create_password_reset_token function
CREATE OR REPLACE FUNCTION create_password_reset_token(p_user_id uuid)
RETURNS text AS $$
DECLARE
  v_token text;
BEGIN
  UPDATE auth_tokens
  SET used = true
  WHERE user_id = p_user_id
  AND type = 'password_reset'
  AND NOT used;

  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO auth_tokens (user_id, token, type, expires_at)
  VALUES (p_user_id, v_token, 'password_reset', now() + INTERVAL '1 hour');

  RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate verify_token function
CREATE OR REPLACE FUNCTION verify_token(p_token text, p_type text)
RETURNS TABLE(valid boolean, user_id uuid, message text) AS $$
DECLARE
  v_token_record RECORD;
BEGIN
  SELECT * INTO v_token_record
  FROM auth_tokens
  WHERE token = p_token
  AND type = p_type;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, 'Token ungültig oder nicht gefunden'::text;
    RETURN;
  END IF;

  IF v_token_record.used THEN
    RETURN QUERY SELECT false, NULL::uuid, 'Token wurde bereits verwendet'::text;
    RETURN;
  END IF;

  IF v_token_record.expires_at < now() THEN
    RETURN QUERY SELECT false, NULL::uuid, 'Token ist abgelaufen'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_token_record.user_id, 'Token gültig'::text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate mark_token_used function
CREATE OR REPLACE FUNCTION mark_token_used(p_token text)
RETURNS void AS $$
BEGIN
  UPDATE auth_tokens
  SET used = true
  WHERE token = p_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;