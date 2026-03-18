-- Die Token-Funktionen nutzen gen_random_bytes(), das in Supabase im Schema "extensions" liegt.
-- Bei SET search_path = public wird es nicht gefunden – daher explizit extensions.gen_random_bytes.

DROP FUNCTION IF EXISTS create_verification_token(uuid, text);
CREATE FUNCTION create_verification_token(
  p_user_id uuid,
  p_email text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO auth_tokens (user_id, email, token, token_type, expires_at)
  VALUES (p_user_id, p_email, v_token, 'email_verification', now() + interval '24 hours');
  RETURN v_token;
END;
$$;

DROP FUNCTION IF EXISTS create_password_reset_token(uuid, text);
CREATE FUNCTION create_password_reset_token(
  p_user_id uuid,
  p_email text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO auth_tokens (user_id, email, token, token_type, expires_at)
  VALUES (p_user_id, p_email, v_token, 'password_reset', now() + interval '1 hour');
  RETURN v_token;
END;
$$;
