-- auth_tokens hat laut ursprünglicher Migration (20260106211306) nur:
-- user_id, token, type, used, expires_at, created_at
-- Keine Spalten: email, token_type, used_at
-- Wir passen die Token-Funktionen an dieses Schema an.

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
  UPDATE auth_tokens SET used = true
  WHERE user_id = p_user_id AND type = 'email_verification' AND NOT used;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO auth_tokens (user_id, token, type, expires_at)
  VALUES (p_user_id, v_token, 'email_verification', now() + interval '24 hours');
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
  UPDATE auth_tokens SET used = true
  WHERE user_id = p_user_id AND type = 'password_reset' AND NOT used;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO auth_tokens (user_id, token, type, expires_at)
  VALUES (p_user_id, v_token, 'password_reset', now() + interval '1 hour');
  RETURN v_token;
END;
$$;

-- verify_token: Tabelle hat "type" und "used", Rückgabe für reset-password/verify-email (valid, user_id, message)
DROP FUNCTION IF EXISTS verify_token(text, text);
CREATE FUNCTION verify_token(p_token text, p_type text)
RETURNS TABLE(valid boolean, user_id uuid, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_record RECORD;
BEGIN
  SELECT * INTO v_token_record FROM auth_tokens WHERE token = p_token AND type = p_type;

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
$$;

-- mark_token_used: Tabelle hat "used", kein "used_at"
DROP FUNCTION IF EXISTS mark_token_used(text);
CREATE FUNCTION mark_token_used(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE auth_tokens SET used = true WHERE token = p_token;
END;
$$;
