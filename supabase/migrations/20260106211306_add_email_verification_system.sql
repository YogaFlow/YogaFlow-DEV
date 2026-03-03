/*
  # E-Mail-Verifizierungs- und Passwort-Reset-System

  1. Änderungen an bestehenden Tabellen
    - Füge `email_verified` Flag zur users-Tabelle hinzu (Standard: false)
    - Füge `email_verified_at` Timestamp zur users-Tabelle hinzu

  2. Neue Tabelle: auth_tokens
    - `id` (uuid, primary key)
    - `user_id` (uuid, foreign key zu users)
    - `token` (text, unique, indexed)
    - `type` (text: 'email_verification' oder 'password_reset')
    - `used` (boolean, default: false)
    - `expires_at` (timestamptz)
    - `created_at` (timestamptz)

  3. Sicherheit
    - Enable RLS auf auth_tokens
    - Nur serverseitige Zugriffe erlauben
    - Automatisches Löschen abgelaufener Tokens

  4. Indizes
    - Index auf token für schnelle Lookups
    - Index auf user_id und type
    - Index auf expires_at für Cleanup
*/

-- Füge email_verified Spalten zur users-Tabelle hinzu
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email_verified'
  ) THEN
    ALTER TABLE users ADD COLUMN email_verified boolean DEFAULT false NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email_verified_at'
  ) THEN
    ALTER TABLE users ADD COLUMN email_verified_at timestamptz;
  END IF;
END $$;

-- Erstelle auth_tokens Tabelle
CREATE TABLE IF NOT EXISTS auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL,
  type text NOT NULL CHECK (type IN ('email_verification', 'password_reset')),
  used boolean DEFAULT false NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Indizes für Performance
CREATE INDEX IF NOT EXISTS idx_auth_tokens_token ON auth_tokens(token);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_type ON auth_tokens(user_id, type);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires ON auth_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_used ON auth_tokens(used) WHERE NOT used;

-- Enable RLS
ALTER TABLE auth_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Keine direkte User-Zugriffe, nur über Service-Role
CREATE POLICY "Service role can manage all tokens"
  ON auth_tokens
  FOR ALL
  USING (auth.role() = 'service_role');

-- Funktion zum automatischen Cleanup abgelaufener Tokens
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM auth_tokens
  WHERE expires_at < now()
    OR (used = true AND created_at < now() - INTERVAL '7 days');
END;
$$;

-- Funktion zum Erstellen eines Verifizierungs-Tokens
CREATE OR REPLACE FUNCTION create_verification_token(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token text;
BEGIN
  -- Invalidiere alte ungenutzte Tokens für diesen User
  UPDATE auth_tokens
  SET used = true
  WHERE user_id = p_user_id
    AND type = 'email_verification'
    AND NOT used;

  -- Generiere neuen Token (32 Bytes = 64 Hex-Zeichen)
  v_token := encode(gen_random_bytes(32), 'hex');

  -- Speichere Token (24 Stunden gültig)
  INSERT INTO auth_tokens (user_id, token, type, expires_at)
  VALUES (p_user_id, v_token, 'email_verification', now() + INTERVAL '24 hours');

  RETURN v_token;
END;
$$;

-- Funktion zum Erstellen eines Passwort-Reset-Tokens
CREATE OR REPLACE FUNCTION create_password_reset_token(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token text;
BEGIN
  -- Invalidiere alte ungenutzte Tokens für diesen User
  UPDATE auth_tokens
  SET used = true
  WHERE user_id = p_user_id
    AND type = 'password_reset'
    AND NOT used;

  -- Generiere neuen Token (32 Bytes = 64 Hex-Zeichen)
  v_token := encode(gen_random_bytes(32), 'hex');

  -- Speichere Token (1 Stunde gültig)
  INSERT INTO auth_tokens (user_id, token, type, expires_at)
  VALUES (p_user_id, v_token, 'password_reset', now() + INTERVAL '1 hour');

  RETURN v_token;
END;
$$;

-- Funktion zum Verifizieren eines Tokens
CREATE OR REPLACE FUNCTION verify_token(
  p_token text,
  p_type text
)
RETURNS TABLE(
  valid boolean,
  user_id uuid,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_record RECORD;
BEGIN
  -- Suche Token
  SELECT * INTO v_token_record
  FROM auth_tokens
  WHERE token = p_token
    AND type = p_type;

  -- Token existiert nicht
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, 'Token ungültig oder nicht gefunden'::text;
    RETURN;
  END IF;

  -- Token bereits verwendet
  IF v_token_record.used THEN
    RETURN QUERY SELECT false, NULL::uuid, 'Token wurde bereits verwendet'::text;
    RETURN;
  END IF;

  -- Token abgelaufen
  IF v_token_record.expires_at < now() THEN
    RETURN QUERY SELECT false, NULL::uuid, 'Token ist abgelaufen'::text;
    RETURN;
  END IF;

  -- Token gültig
  RETURN QUERY SELECT true, v_token_record.user_id, 'Token gültig'::text;
END;
$$;

-- Funktion zum Markieren eines Tokens als verwendet
CREATE OR REPLACE FUNCTION mark_token_used(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE auth_tokens
  SET used = true
  WHERE token = p_token;
END;
$$;