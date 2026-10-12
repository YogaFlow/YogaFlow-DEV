-- Align public.users UPDATE grants to DEV sollstand (20260911134500).
-- Freeze-Ausnahme / Generalprobe: PROD-Backup-Restore auf leeres Supabase-Projekt
-- lässt Tabellen-UPDATE für authenticated/anon stehen (ALTER DEFAULT PRIVILEGES
-- GRANT ALL ON TABLES), weil schema.sql nur positive GRANTs ohne REVOKE UPDATE
-- exportiert. Live-PROD ist seit 20260911134500 korrekt; die Probe und jeder
-- Restore-Weg brauchen denselben REVOKE vor ZW1-N1/N4 (20261004210000+).
--
-- Auf DEV: no-op (Rechte bereits so).
-- Rückweg:
--   GRANT UPDATE ON public.users TO authenticated;
--   GRANT UPDATE ON public.users TO anon;

REVOKE UPDATE ON public.users FROM anon, authenticated;

GRANT UPDATE (
  first_name,
  last_name,
  email,
  phone,
  street,
  house_number,
  postal_code,
  city,
  role
) ON public.users TO authenticated;

DO $$
DECLARE
  v_allowed text[] := ARRAY[
    'first_name', 'last_name', 'email', 'phone',
    'street', 'house_number', 'postal_code', 'city', 'role'
  ];
  v_col text;
  v_has boolean;
BEGIN
  IF has_any_column_privilege('anon', 'public.users', 'UPDATE') THEN
    RAISE EXCEPTION 'align_users_grants: anon hat noch UPDATE auf public.users';
  END IF;

  IF has_table_privilege('authenticated', 'public.users', 'UPDATE') THEN
    RAISE EXCEPTION 'align_users_grants: authenticated hat noch Tabellen-UPDATE auf public.users';
  END IF;

  FOR v_col IN
    SELECT attname FROM pg_attribute
    WHERE attrelid = 'public.users'::regclass
      AND attnum > 0
      AND NOT attisdropped
  LOOP
    v_has := has_column_privilege('authenticated', 'public.users', v_col, 'UPDATE');
    IF v_has IS DISTINCT FROM (v_col = ANY (v_allowed)) THEN
      RAISE EXCEPTION
        'align_users_grants: public.users.% UPDATE für authenticated ist %, erwartet %',
        v_col, v_has, (v_col = ANY (v_allowed));
    END IF;
  END LOOP;
END $$;
