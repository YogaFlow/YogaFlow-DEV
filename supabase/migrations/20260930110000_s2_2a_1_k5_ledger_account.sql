-- 2.2a-1 K5 — ledger_entries CHECK kennt psp_clearing; process_ledger loggt stille Fehler.
--
-- Befund: process_ledger failed: 1, weil ledger_entries_account_check kein psp_clearing erlaubt.
-- Basis process_ledger: pg_get_functiondef auf DEV (nach 20260930100000).
--
-- Rückweg:
--   ALTER TABLE public.ledger_entries DROP CONSTRAINT ledger_entries_account_check;
--   ALTER TABLE public.ledger_entries ADD CONSTRAINT ledger_entries_account_check
--     CHECK (account IN (
--       'cash', 'bank', 'paypal_clearing',
--       'revenue_standard', 'revenue_small_business', 'vat_output'
--     ));
--   -- process_ledger aus 20260928020000 / Stand vor dieser Datei wiederherstellen.

-- ---------------------------------------------------------------------------
-- 1. CHECK: gleiche Liste + psp_clearing
-- ---------------------------------------------------------------------------

ALTER TABLE public.ledger_entries
  DROP CONSTRAINT IF EXISTS ledger_entries_account_check;

ALTER TABLE public.ledger_entries
  ADD CONSTRAINT ledger_entries_account_check
  CHECK (account IN (
    'cash',
    'bank',
    'paypal_clearing',
    'psp_clearing',
    'revenue_standard',
    'revenue_small_business',
    'vat_output'
  ));

-- ---------------------------------------------------------------------------
-- 2. process_ledger — WHEN OTHERS: RAISE LOG, sonst unverändert
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.process_ledger(
  p_limit integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_limit integer := GREATEST(COALESCE(p_limit, 500), 0);
  v_booked integer := 0;
  v_waiting integer := 0;
  v_failed integer := 0;
  v_event public.events%ROWTYPE;
  v_pay public.payments%ROWTYPE;
  v_orig public.payments%ROWTYPE;
  v_orig_event_id uuid;
  v_booking_date date;
  v_regime text;
  v_rate integer;
  v_money_account text;
  v_sale_kind text;
  v_brutto integer;
  v_netto integer;
  v_ust integer;
  v_line record;
BEGIN
  IF v_limit = 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'booked', 0, 'waiting', 0, 'failed', 0
    );
  END IF;

  -- Fester Schlüssel; verhindert parallele Läufe (H2).
  IF NOT pg_catalog.pg_try_advisory_xact_lock(872014701) THEN
    RETURN pg_catalog.jsonb_build_object('skipped', 'locked');
  END IF;

  FOR v_event IN
    SELECT e.*
    FROM public.events e
    WHERE e.type IN ('payment.recorded', 'payment.reversed')
      AND NOT EXISTS (
        SELECT 1
        FROM public.ledger_event_log l
        WHERE l.event_id = e.id
      )
      -- Studios ohne Steuerstatus nicht anwählen (sonst Verhungern vor LIMIT).
      AND EXISTS (
        SELECT 1
        FROM public.tenant_tax_settings t
        WHERE t.tenant_id = e.tenant_id
      )
    ORDER BY e.occurred_at ASC, e.id ASC
    LIMIT v_limit
    FOR UPDATE OF e SKIP LOCKED
  LOOP
    BEGIN
      -- Bereits Zeilen (Crash nach INSERT, vor Log) → nur Log nachziehen.
      IF EXISTS (
        SELECT 1 FROM public.ledger_entries le WHERE le.event_id = v_event.id
      ) THEN
        INSERT INTO public.ledger_event_log (event_id, tenant_id, status)
        VALUES (v_event.id, v_event.tenant_id, 'booked')
        ON CONFLICT (event_id) DO NOTHING;
        v_booked := v_booked + 1;
        CONTINUE;
      END IF;

      SELECT * INTO v_pay
      FROM public.payments
      WHERE id = v_event.subject_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'PAYMENT_NOT_FOUND';
      END IF;

      v_booking_date := (
        v_pay.received_at AT TIME ZONE 'Europe/Berlin'
      )::date;

      v_money_account := yogaflow_private.ledger_money_account(v_pay.method);
      v_sale_kind := yogaflow_private.ledger_sale_kind(v_pay.subject_type);

      IF v_money_account IS NULL OR v_sale_kind IS NULL THEN
        RAISE EXCEPTION 'UNSUPPORTED_PAYMENT';
      END IF;

      IF v_event.type = 'payment.recorded' THEN
        SELECT t.regime, t.vat_rate_bp
          INTO v_regime, v_rate
        FROM public.tenant_tax_settings t
        WHERE t.tenant_id = v_event.tenant_id
          AND t.valid_from <= v_booking_date
        ORDER BY t.valid_from DESC
        LIMIT 1;

        IF v_regime IS NULL THEN
          v_waiting := v_waiting + 1;
          CONTINUE;
        END IF;

        v_brutto := v_pay.amount_cents;
        IF v_brutto <= 0 THEN
          RAISE EXCEPTION 'INVALID_AMOUNT';
        END IF;

        IF v_regime = 'small_business' THEN
          INSERT INTO public.ledger_entries (
            tenant_id, event_id, payment_id, account,
            debit_cents, credit_cents, sale_kind,
            tax_regime, vat_rate_bp, booking_date
          ) VALUES
            (
              v_event.tenant_id, v_event.id, v_pay.id, v_money_account,
              v_brutto, 0, v_sale_kind, v_regime, v_rate, v_booking_date
            ),
            (
              v_event.tenant_id, v_event.id, v_pay.id, 'revenue_small_business',
              0, v_brutto, v_sale_kind, v_regime, v_rate, v_booking_date
            );
        ELSE
          v_netto := yogaflow_private.ledger_net_cents(v_brutto, v_rate);
          v_ust := v_brutto - v_netto;
          INSERT INTO public.ledger_entries (
            tenant_id, event_id, payment_id, account,
            debit_cents, credit_cents, sale_kind,
            tax_regime, vat_rate_bp, booking_date
          ) VALUES
            (
              v_event.tenant_id, v_event.id, v_pay.id, v_money_account,
              v_brutto, 0, v_sale_kind, v_regime, v_rate, v_booking_date
            ),
            (
              v_event.tenant_id, v_event.id, v_pay.id, 'revenue_standard',
              0, v_netto, v_sale_kind, v_regime, v_rate, v_booking_date
            ),
            (
              v_event.tenant_id, v_event.id, v_pay.id, 'vat_output',
              0, v_ust, v_sale_kind, v_regime, v_rate, v_booking_date
            );
        END IF;

        INSERT INTO public.ledger_event_log (event_id, tenant_id, status)
        VALUES (v_event.id, v_event.tenant_id, 'booked');

        v_booked := v_booked + 1;

      ELSIF v_event.type = 'payment.reversed' THEN
        IF v_pay.reverses_payment_id IS NULL THEN
          RAISE EXCEPTION 'NO_ORIGINAL';
        END IF;

        SELECT * INTO v_orig
        FROM public.payments
        WHERE id = v_pay.reverses_payment_id;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'ORIGINAL_NOT_FOUND';
        END IF;

        SELECT e.id
          INTO v_orig_event_id
        FROM public.events e
        WHERE e.type = 'payment.recorded'
          AND e.subject_type = 'payment'
          AND e.subject_id = v_orig.id
        ORDER BY e.occurred_at ASC
        LIMIT 1;

        IF v_orig_event_id IS NULL
           OR NOT EXISTS (
             SELECT 1
             FROM public.ledger_event_log l
             WHERE l.event_id = v_orig_event_id
               AND l.status = 'booked'
           )
        THEN
          v_waiting := v_waiting + 1;
          CONTINUE;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM public.ledger_entries le
          WHERE le.event_id = v_orig_event_id
        ) THEN
          v_waiting := v_waiting + 1;
          CONTINUE;
        END IF;

        FOR v_line IN
          SELECT *
          FROM public.ledger_entries le
          WHERE le.event_id = v_orig_event_id
          ORDER BY le.account
        LOOP
          INSERT INTO public.ledger_entries (
            tenant_id, event_id, payment_id, account,
            debit_cents, credit_cents, sale_kind,
            tax_regime, vat_rate_bp, booking_date
          ) VALUES (
            v_event.tenant_id,
            v_event.id,
            v_pay.id,
            v_line.account,
            v_line.credit_cents,
            v_line.debit_cents,
            v_line.sale_kind,
            v_line.tax_regime,
            v_line.vat_rate_bp,
            v_booking_date
          );
        END LOOP;

        INSERT INTO public.ledger_event_log (event_id, tenant_id, status)
        VALUES (v_event.id, v_event.tenant_id, 'booked');

        v_booked := v_booked + 1;
      END IF;

    EXCEPTION
      WHEN OTHERS THEN
        RAISE LOG 'ledger.failed event_id=% sqlstate=% msg=%',
          v_event.id, SQLSTATE, SQLERRM;
        v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'booked', v_booked,
    'waiting', v_waiting,
    'failed', v_failed
  );
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.process_ledger(integer) IS
  'Bucht payment.recorded/reversed in ledger_entries. Fehler: RAISE LOG + failed-Zähler, erneuter Versuch.';

REVOKE ALL ON FUNCTION yogaflow_private.process_ledger(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION yogaflow_private.process_ledger(integer)
  TO postgres, service_role;

-- public-Alias unverändert (nur falls Rechte erneut gesetzt werden müssen)
REVOKE ALL ON FUNCTION public.process_ledger(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_ledger(integer)
  TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- 3. Selbstprüfung
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_check text;
  v_method text;
  v_account text;
  v_methods text[] := ARRAY[
    'cash', 'bank_transfer', 'paypal_manual', 'card'
  ];
BEGIN
  SELECT pg_get_constraintdef(c.oid)
    INTO v_check
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'ledger_entries'
    AND c.conname = 'ledger_entries_account_check';

  IF v_check IS NULL OR v_check NOT LIKE '%psp_clearing%' THEN
    RAISE EXCEPTION 'Selbstprüfung: ledger_entries_account_check ohne psp_clearing';
  END IF;

  FOREACH v_method IN ARRAY v_methods LOOP
    v_account := yogaflow_private.ledger_money_account(
      v_method::public.payment_method
    );
    IF v_account IS NULL THEN
      RAISE EXCEPTION 'Selbstprüfung: ledger_money_account(%) ist NULL', v_method;
    END IF;
    IF v_check NOT LIKE '%' || v_account || '%' THEN
      RAISE EXCEPTION
        'Selbstprüfung: Konto % aus ledger_money_account(%) fehlt im CHECK',
        v_account, v_method;
    END IF;
  END LOOP;
END;
$$;
