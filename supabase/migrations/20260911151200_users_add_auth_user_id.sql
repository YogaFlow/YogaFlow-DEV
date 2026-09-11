-- Zweck: public.users um auth_user_id erweitern (eine Auth-Identität, später
--        mehrere Studio-Zeilen). Stufe 1 „Vorbereiten": die Spalte wird noch
--        nirgends gelesen. handle_new_user schreibt sie mit NEW.id, damit
--        neue Konten die NOT-NULL-Spalte erfüllen.
--
-- Direkte INSERTs in public.users ohne auth_user_id scheitern ab jetzt an
-- NOT NULL. Betrifft nur die historischen Importskripte scripts/import-yomita-*
-- (nicht erneut ausführen) und den bereits kaputten Rückfallpfad in
-- ensure_public_user.
--
-- Rückweg:
--   1. CREATE OR REPLACE FUNCTION public.handle_new_user() aus
--      supabase/snapshots/2026-09-11_pre_membership_dev.sql (Zeile 1032).
--   2. ALTER TABLE public.users DROP CONSTRAINT users_auth_user_id_tenant_id_key;
--   3. ALTER TABLE public.users DROP CONSTRAINT users_auth_user_id_fkey;
--   4. ALTER TABLE public.users DROP COLUMN auth_user_id;
-- users_id_fkey (users.id → auth.users) bleibt in Stufe 1 unverändert.

ALTER TABLE public.users ADD COLUMN auth_user_id uuid;

-- Backfill ohne update_users_updated_at: sonst würde updated_at aller Zeilen
-- auf den Transaktionszeitpunkt springen. In PROD stehen dort echte Profile.
ALTER TABLE public.users DISABLE TRIGGER USER;
UPDATE public.users SET auth_user_id = id WHERE auth_user_id IS NULL;
ALTER TABLE public.users ENABLE TRIGGER USER;

ALTER TABLE public.users ALTER COLUMN auth_user_id SET NOT NULL;

ALTER TABLE public.users
  ADD CONSTRAINT users_auth_user_id_fkey
  FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.users
  ADD CONSTRAINT users_auth_user_id_tenant_id_key
  UNIQUE (auth_user_id, tenant_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
BEGIN
  -- Rolle aus Metadata lesen; ungültige Werte auf 'user' zurücksetzen
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'user');
  IF v_role NOT IN ('owner', 'admin', 'teacher', 'user') THEN
    v_role := 'user';
  END IF;

  INSERT INTO public.users (
    id, email, tenant_id, role,
    first_name, last_name,
    street, house_number, postal_code, city, phone,
    auth_user_id
  )
  VALUES (
    NEW.id,
    NEW.email,
    (NEW.raw_user_meta_data->>'tenant_id')::uuid,
    v_role,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name',  ''),
    COALESCE(NEW.raw_user_meta_data->>'street',       NULL),
    COALESCE(NEW.raw_user_meta_data->>'house_number', NULL),
    COALESCE(NEW.raw_user_meta_data->>'postal_code',  NULL),
    COALESCE(NEW.raw_user_meta_data->>'city',         NULL),
    COALESCE(NEW.raw_user_meta_data->>'phone',        NULL),
    NEW.id
  );
  RETURN NEW;
END;
$function$;

DO $$
DECLARE
  v_allowed text[] := ARRAY['first_name','last_name','email','phone',
                            'street','house_number','postal_code','city','role'];
  v_col text;
  v_has boolean;
  v_mismatch integer;
  v_updated_now integer;
  v_triggers_off integer;
BEGIN
  SELECT count(*) INTO v_mismatch
  FROM public.users
  WHERE auth_user_id IS DISTINCT FROM id;

  IF v_mismatch <> 0 THEN
    RAISE EXCEPTION 'Stufe 1: % Zeilen mit auth_user_id IS DISTINCT FROM id', v_mismatch;
  END IF;

  IF has_column_privilege('authenticated', 'public.users', 'auth_user_id', 'UPDATE') THEN
    RAISE EXCEPTION 'Stufe 1: authenticated darf public.users.auth_user_id UPDATEn';
  END IF;

  SELECT count(*) INTO v_updated_now
  FROM public.users
  WHERE updated_at = now();

  IF v_updated_now <> 0 THEN
    RAISE EXCEPTION 'Stufe 1: % Zeilen mit updated_at = now() (Trigger hat gefeuert)', v_updated_now;
  END IF;

  SELECT count(*) INTO v_triggers_off
  FROM pg_trigger
  WHERE tgrelid = 'public.users'::regclass
    AND NOT tgisinternal
    AND tgenabled <> 'O';

  IF v_triggers_off <> 0 THEN
    RAISE EXCEPTION 'Stufe 1: % User-Trigger auf public.users nicht wieder enabled', v_triggers_off;
  END IF;

  IF has_any_column_privilege('anon', 'public.users', 'UPDATE') THEN
    RAISE EXCEPTION 'Stufe 0: anon hat noch UPDATE auf public.users';
  END IF;

  IF has_table_privilege('authenticated', 'public.users', 'UPDATE') THEN
    RAISE EXCEPTION 'Stufe 0: authenticated hat noch Tabellen-UPDATE auf public.users';
  END IF;

  FOR v_col IN
    SELECT attname FROM pg_attribute
    WHERE attrelid = 'public.users'::regclass AND attnum > 0 AND NOT attisdropped
  LOOP
    v_has := has_column_privilege('authenticated', 'public.users', v_col, 'UPDATE');
    IF v_has IS DISTINCT FROM (v_col = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'Stufe 0: public.users.% UPDATE für authenticated ist %, erwartet %',
        v_col, v_has, (v_col = ANY (v_allowed));
    END IF;
  END LOOP;
END $$;
