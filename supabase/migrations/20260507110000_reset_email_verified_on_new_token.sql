-- Wenn ein neuer Verifizierungstoken erzeugt wird (Neu-Registrierung oder
-- erneutes Anfordern), muss email_verified zurückgesetzt werden.
-- Sonst können bereits-verifizierte Nutzer (gleiches E-Mail-Konto, selber Tenant)
-- das Dashboard ohne neuen Link-Klick erreichen.

CREATE OR REPLACE FUNCTION public.create_verification_token(
  p_user_id uuid,
  p_email    text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  -- Alte, noch nicht verwendete Tokens invalidieren
  UPDATE auth_tokens
  SET    used = true
  WHERE  user_id = p_user_id
    AND  type    = 'email_verification'
    AND  NOT used;

  -- Verifikationsstatus zurücksetzen, damit neuer Klick erforderlich ist
  UPDATE users
  SET    email_verified    = false,
         email_verified_at = NULL
  WHERE  id             = p_user_id
    AND  email_verified = true;

  -- Neuen Token generieren (32 Bytes = 64 Hex-Zeichen, 24 h gültig)
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO auth_tokens (user_id, token, type, expires_at)
  VALUES (p_user_id, v_token, 'email_verification', now() + interval '24 hours');

  RETURN v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_verification_token(uuid, text) TO service_role;
