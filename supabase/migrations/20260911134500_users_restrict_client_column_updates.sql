-- Stufe 0: Spaltenrechte auf public.users
-- Befund 11.09.2026 (A2 auf DEV, A3 auf PROD strukturell identisch):
-- Policy users_update_own_profile prüft nur id = auth.uid(). Tabellen-UPDATE
-- lag bei anon und authenticated auf allen Spalten (keine attacl). Dadurch
-- konnte authenticated die eigene Zeile SET tenant_id und SET email_verified
-- ausführen.
--
-- Dieser Schritt sperrt UPDATE für anon vollständig und für authenticated
-- auf alle Spalten außer der Client-GRANT-Liste aus der Inventur 1d.
-- Gesperrt u. a.: tenant_id, email_verified, email_verified_at, id,
-- created_at, updated_at, gdpr_consent, gdpr_consent_date.
-- email bleibt bewusst erlaubt (Profile.tsx sendet sie; Aufräumen folgt
-- in einem späteren Auftrag).
-- role steht auf der Liste, weil Owner/Admin sie in Users.tsx:378 als
-- authenticated setzen; Schutz gegen Eskalation bleibt beim Trigger
-- check_role_escalation.
-- INSERT, DELETE, SELECT, TRUNCATE werden nicht angefasst.
--
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

-- Selbstprüfung: bricht ab, wenn die Rechte nicht exakt der Liste entsprechen.
DO $$
DECLARE
  v_allowed text[] := ARRAY['first_name','last_name','email','phone',
                            'street','house_number','postal_code','city','role'];
  v_col text;
  v_has boolean;
BEGIN
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
