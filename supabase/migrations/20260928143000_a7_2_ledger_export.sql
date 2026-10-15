-- A7-2 — Hauptbuch-Export (CSV für die Steuerberatung).
--
-- Zweck: export_ledger(p_from, p_to) liefert Hauptbuchzeilen eines Zeitraums.
-- Nur Owner und Admin. Keine Namen, keine Personen-IDs. Keine Summen
-- (Summen entstehen im Client, nur in der zweiten CSV-Datei).
--
-- Zeitraum höchstens 366 Kalendertage einschließlich
-- (p_to - p_from > 365 → RANGE_TOO_LARGE).
-- NULL oder Ende vor Anfang → INVALID_RANGE.
--
-- Nicht anwenden in diesem Auftrag — Datei nur schreiben. Julius pusht auf DEV.
--
-- Rückweg (Kommentar, läuft nicht):
--   DROP FUNCTION IF EXISTS public.export_ledger(date, date);

CREATE OR REPLACE FUNCTION public.export_ledger(
  p_from date,
  p_to date
)
RETURNS TABLE (
  booking_date date,
  event_id uuid,
  payment_id uuid,
  account text,
  debit_cents integer,
  credit_cents integer,
  sale_kind text,
  tax_regime text,
  vat_rate_bp integer,
  method text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_member_id uuid;
  v_tenant_id uuid;
BEGIN
  v_member_id := yogaflow_private.get_my_member_id();
  v_tenant_id := yogaflow_private.get_my_tenant_id();

  IF v_member_id IS NULL
     OR v_tenant_id IS NULL
     OR NOT yogaflow_private.is_tenant_manager()
  THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF p_from IS NULL
     OR p_to IS NULL
     OR p_to < p_from
  THEN
    RAISE EXCEPTION 'INVALID_RANGE' USING ERRCODE = '22023';
  END IF;

  IF (p_to - p_from) > 365 THEN
    RAISE EXCEPTION 'RANGE_TOO_LARGE' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    le.booking_date,
    le.event_id,
    le.payment_id,
    le.account,
    le.debit_cents,
    le.credit_cents,
    le.sale_kind,
    le.tax_regime,
    le.vat_rate_bp,
    p.method::text
  FROM public.ledger_entries le
  JOIN public.payments p
    ON p.id = le.payment_id
   AND p.tenant_id = le.tenant_id
  WHERE le.tenant_id = v_tenant_id
    AND le.booking_date >= p_from
    AND le.booking_date <= p_to
  ORDER BY le.booking_date, le.event_id, le.account;
END;
$function$;

COMMENT ON FUNCTION public.export_ledger(date, date) IS
  'Hauptbuchzeilen im Zeitraum für Owner/Admin. Keine Personen. Fehler: FORBIDDEN, INVALID_RANGE, RANGE_TOO_LARGE. A7-2.';

REVOKE ALL ON FUNCTION public.export_ledger(date, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.export_ledger(date, date)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Selbstprüfung (statisch)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_def text;
  v_sec boolean;
  v_result text;
BEGIN
  SELECT p.prosecdef, pg_get_functiondef(p.oid), pg_get_function_result(p.oid)
    INTO v_sec, v_def, v_result
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'export_ledger';

  IF NOT COALESCE(v_sec, false) THEN
    RAISE EXCEPTION 'A7-2: export_ledger nicht SECURITY DEFINER';
  END IF;

  IF v_def IS NULL
     OR position('search_path' IN v_def) = 0
     OR v_def LIKE '%search_path TO ''public''%'
     OR v_def LIKE '%search_path TO public%'
  THEN
    RAISE EXCEPTION 'A7-2: export_ledger search_path nicht leer';
  END IF;

  IF v_def LIKE '%public.users%'
     OR v_def LIKE '%first_name%'
     OR v_def LIKE '%last_name%'
  THEN
    RAISE EXCEPTION 'A7-2: export_ledger darf keine Personen liefern';
  END IF;

  IF v_result IS NULL
     OR position('booking_date' IN v_result) = 0
     OR position('method' IN v_result) = 0
     OR position('vat_rate_bp' IN v_result) = 0
  THEN
    RAISE EXCEPTION 'A7-2: Rückgabe von export_ledger unvollständig';
  END IF;

  IF has_function_privilege('anon', 'public.export_ledger(date,date)', 'EXECUTE')
     OR NOT has_function_privilege(
          'authenticated',
          'public.export_ledger(date,date)',
          'EXECUTE'
        )
  THEN
    RAISE EXCEPTION 'A7-2: EXECUTE auf export_ledger falsch';
  END IF;
END;
$$;
