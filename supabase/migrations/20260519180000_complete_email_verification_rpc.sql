-- Atomically set app email_verified and mark token used (SECURITY DEFINER, bypasses RLS).

CREATE OR REPLACE FUNCTION public.complete_email_verification(p_user_id uuid, p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM auth_tokens
    WHERE token = p_token
      AND user_id = p_user_id
      AND type = 'email_verification'
      AND NOT used
      AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'invalid_or_expired_token';
  END IF;

  UPDATE users
  SET email_verified = true,
      email_verified_at = COALESCE(email_verified_at, now())
  WHERE id = p_user_id;

  UPDATE auth_tokens
  SET used = true
  WHERE token = p_token;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_email_verification(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_email_verification(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_email_verification(uuid, text) TO postgres;
