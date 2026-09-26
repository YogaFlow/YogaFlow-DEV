-- K1: create_verification_token setzt email_verified nicht mehr zurück.
--
-- Befund 22.09.2026 (PROD): Die RPC invalidierte alle Profile eines Logins
-- (WHERE auth_user_id = p_user_id AND email_verified = true). Wer in Studio A
-- bestätigt war und danach eine Bestätigungsmail anforderte (typisch „Erneut
-- senden"), wurde in A ausgesperrt. join_tenant kopiert den Status bereits
-- (20260911182000) und war nicht der Auslöser.
-- Bezug: docs/EPIC_KONTO_ZUGANG.md Story K1.
--
-- Minimaler Diff gegen 20260911185000: das UPDATE auf email_verified /
-- email_verified_at entfällt. Token-Invalidierung und Insert unverändert.
-- search_path: public, pg_temp (pg_temp zuletzt). Signatur unverändert;
-- p_email bleibt ungenutzt (nur K1-Bericht).
--
-- Rückweg (ausführbar, diese Zeilen sind Kommentar und laufen hier nicht).
-- Körper aus 20260911185000:
--
-- CREATE OR REPLACE FUNCTION public.create_verification_token(p_user_id uuid, p_email text)
--  RETURNS text
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_token text;
-- BEGIN
--   UPDATE auth_tokens
--   SET    used = true
--   WHERE  user_id = p_user_id
--     AND  type    = 'email_verification'
--     AND  NOT used;
--
--   UPDATE users
--   SET    email_verified    = false,
--          email_verified_at = NULL
--   WHERE  auth_user_id   = p_user_id
--     AND  email_verified = true;
--
--   v_token := encode(extensions.gen_random_bytes(32), 'hex');
--   INSERT INTO auth_tokens (user_id, token, type, expires_at)
--   VALUES (p_user_id, v_token, 'email_verification', now() + interval '24 hours');
--
--   RETURN v_token;
-- END;
-- $function$;
--
-- REVOKE ALL ON FUNCTION public.create_verification_token(uuid, text) FROM PUBLIC, anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.create_verification_token(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.create_verification_token(p_user_id uuid, p_email text)
 RETURNS text
 LANGUAGE plpgsql
 VOLATILE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_token text;
BEGIN
  -- Alte, noch nicht verwendete Tokens invalidieren
  UPDATE auth_tokens
  SET    used = true
  WHERE  user_id = p_user_id
    AND  type    = 'email_verification'
    AND  NOT used;

  -- Neuen Token generieren (32 Bytes = 64 Hex-Zeichen, 24 h gültig)
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO auth_tokens (user_id, token, type, expires_at)
  VALUES (p_user_id, v_token, 'email_verification', now() + interval '24 hours');

  RETURN v_token;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_verification_token(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_verification_token(uuid, text) TO service_role;

DO $$
DECLARE
  v_src text;
  v_oid oid;
BEGIN
  SELECT p.oid, p.prosrc
    INTO v_oid, v_src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'create_verification_token'
    AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_email text';

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'public.create_verification_token(uuid, text) fehlt';
  END IF;

  IF v_src ILIKE '%email_verified = false%' THEN
    RAISE EXCEPTION 'create_verification_token setzt email_verified noch zurück';
  END IF;

  IF has_function_privilege('anon', 'public.create_verification_token(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon hat EXECUTE auf create_verification_token';
  END IF;

  IF has_function_privilege('authenticated', 'public.create_verification_token(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated hat EXECUTE auf create_verification_token';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.create_verification_token(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role fehlt EXECUTE auf create_verification_token';
  END IF;
END $$;
