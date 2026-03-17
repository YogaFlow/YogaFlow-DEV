-- gen_random_bytes() wird von create_password_reset_token und anderen
-- Token-Funktionen genutzt und kommt aus der Erweiterung pgcrypto.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
