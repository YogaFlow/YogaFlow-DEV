-- 3.2a — process_ledger H5' (Teilerstattung anteilig, Abschluss = Rest je Konto)
-- Freigabe 02.10.2026. Ersetzt H5 „exakt spiegeln“.
-- allow: process_ledger

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
  v_refund integer;
  v_orig_brutto integer;
  v_prior_booked integer;
  v_is_closing boolean;
  v_unbooked_prior boolean;
  -- Anteil-Arrays (Konto + Betrag der Originalzeile + Seite)
  v_acc text[];
  v_amt integer[];
  v_is_debit boolean[];
  v_n integer;
  v_i integer;
  v_j integer;
  v_share integer[];
  v_side_sum integer;
  v_raw numeric;
  v_rounded_sum integer;
  v_max_i integer;
  v_max_amt integer;
  v_already integer;
BEGIN
  IF v_limit = 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'booked', 0, 'waiting', 0, 'failed', 0
    );
  END IF;

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
           OR NOT EXISTS (
             SELECT 1
             FROM public.ledger_entries le
             WHERE le.event_id = v_orig_event_id
           )
        THEN
          v_waiting := v_waiting + 1;
          CONTINUE;
        END IF;

        v_refund := pg_catalog.abs(v_pay.amount_cents);
        v_orig_brutto := v_orig.amount_cents;
        IF v_refund <= 0 OR v_orig_brutto <= 0 THEN
          RAISE EXCEPTION 'INVALID_AMOUNT';
        END IF;

        -- Frühere Gegenbuchungen derselben Zahlung müssen gebucht sein
        SELECT EXISTS (
          SELECT 1
          FROM public.payments rev
          JOIN public.events ev
            ON ev.type = 'payment.reversed'
           AND ev.subject_type = 'payment'
           AND ev.subject_id = rev.id
          WHERE rev.reverses_payment_id = v_orig.id
            AND rev.id IS DISTINCT FROM v_pay.id
            AND (ev.occurred_at, ev.id) < (v_event.occurred_at, v_event.id)
            AND NOT EXISTS (
              SELECT 1 FROM public.ledger_event_log l
              WHERE l.event_id = ev.id AND l.status = 'booked'
            )
        ) INTO v_unbooked_prior;

        IF v_unbooked_prior THEN
          v_waiting := v_waiting + 1;
          CONTINUE;
        END IF;

        SELECT COALESCE(pg_catalog.sum(pg_catalog.abs(rev.amount_cents)), 0)::integer
          INTO v_prior_booked
        FROM public.payments rev
        JOIN public.events ev
          ON ev.type = 'payment.reversed'
         AND ev.subject_type = 'payment'
         AND ev.subject_id = rev.id
        JOIN public.ledger_event_log l
          ON l.event_id = ev.id AND l.status = 'booked'
        WHERE rev.reverses_payment_id = v_orig.id
          AND rev.id IS DISTINCT FROM v_pay.id;

        v_is_closing := (v_prior_booked + v_refund >= v_orig_brutto);

        -- Originalzeilen laden
        v_acc := ARRAY[]::text[];
        v_amt := ARRAY[]::integer[];
        v_is_debit := ARRAY[]::boolean[];
        v_n := 0;

        FOR v_line IN
          SELECT *
          FROM public.ledger_entries le
          WHERE le.event_id = v_orig_event_id
          ORDER BY le.account, le.id
        LOOP
          v_n := v_n + 1;
          v_acc := v_acc || v_line.account;
          IF v_line.debit_cents > 0 THEN
            v_amt := v_amt || v_line.debit_cents;
            v_is_debit := v_is_debit || true;
          ELSE
            v_amt := v_amt || v_line.credit_cents;
            v_is_debit := v_is_debit || false;
          END IF;
        END LOOP;

        IF v_n = 0 THEN
          RAISE EXCEPTION 'NO_ORIG_LINES';
        END IF;

        v_share := ARRAY[]::integer[];
        FOR v_i IN 1..v_n LOOP
          v_share := v_share || 0;
        END LOOP;

        IF v_is_closing THEN
          -- Rest je Konto: Original minus bereits gebuchte Gegenzeilen
          FOR v_i IN 1..v_n LOOP
            SELECT COALESCE(pg_catalog.sum(
              CASE
                WHEN v_is_debit[v_i] THEN le.credit_cents
                ELSE le.debit_cents
              END
            ), 0)::integer
              INTO v_already
            FROM public.ledger_entries le
            JOIN public.payments rev ON rev.id = le.payment_id
            JOIN public.events ev
              ON ev.type = 'payment.reversed'
             AND ev.subject_id = rev.id
            JOIN public.ledger_event_log l
              ON l.event_id = ev.id AND l.status = 'booked'
            WHERE rev.reverses_payment_id = v_orig.id
              AND rev.id IS DISTINCT FROM v_pay.id
              AND le.account = v_acc[v_i];

            v_share[v_i] := v_amt[v_i] - v_already;
            IF v_share[v_i] < 0 THEN
              RAISE EXCEPTION 'NEGATIVE_REMAINING';
            END IF;
          END LOOP;
        ELSE
          -- Je Seite (Soll/Haben) anteilig auf Erstattung skalieren
          FOREACH v_j IN ARRAY ARRAY[0, 1] LOOP
            -- v_j=0 debit-Seite, v_j=1 credit-Seite
            v_side_sum := 0;
            FOR v_i IN 1..v_n LOOP
              IF (v_j = 0 AND v_is_debit[v_i]) OR (v_j = 1 AND NOT v_is_debit[v_i]) THEN
                v_side_sum := v_side_sum + v_amt[v_i];
              END IF;
            END LOOP;
            IF v_side_sum <= 0 THEN
              CONTINUE;
            END IF;

            v_rounded_sum := 0;
            v_max_i := NULL;
            v_max_amt := -1;
            FOR v_i IN 1..v_n LOOP
              IF (v_j = 0 AND v_is_debit[v_i]) OR (v_j = 1 AND NOT v_is_debit[v_i]) THEN
                v_raw := (v_amt[v_i]::numeric * v_refund) / v_side_sum;
                v_share[v_i] := pg_catalog.round(v_raw)::integer;
                v_rounded_sum := v_rounded_sum + v_share[v_i];
                IF v_amt[v_i] > v_max_amt THEN
                  v_max_amt := v_amt[v_i];
                  v_max_i := v_i;
                END IF;
              END IF;
            END LOOP;
            IF v_max_i IS NOT NULL THEN
              v_share[v_max_i] := v_share[v_max_i] + (v_refund - v_rounded_sum);
            END IF;
          END LOOP;
        END IF;

        -- Regime/Rate aus Originalzeile
        SELECT le.tax_regime, le.vat_rate_bp, le.sale_kind
          INTO v_regime, v_rate, v_sale_kind
        FROM public.ledger_entries le
        WHERE le.event_id = v_orig_event_id
        LIMIT 1;

        FOR v_i IN 1..v_n LOOP
          IF v_share[v_i] = 0 THEN
            CONTINUE;
          END IF;
          -- Gegenbuchung: Seiten tauschen
          IF v_is_debit[v_i] THEN
            INSERT INTO public.ledger_entries (
              tenant_id, event_id, payment_id, account,
              debit_cents, credit_cents, sale_kind,
              tax_regime, vat_rate_bp, booking_date
            ) VALUES (
              v_event.tenant_id, v_event.id, v_pay.id, v_acc[v_i],
              0, v_share[v_i], v_sale_kind, v_regime, v_rate, v_booking_date
            );
          ELSE
            INSERT INTO public.ledger_entries (
              tenant_id, event_id, payment_id, account,
              debit_cents, credit_cents, sale_kind,
              tax_regime, vat_rate_bp, booking_date
            ) VALUES (
              v_event.tenant_id, v_event.id, v_pay.id, v_acc[v_i],
              v_share[v_i], 0, v_sale_kind, v_regime, v_rate, v_booking_date
            );
          END IF;
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
  'Bucht payment.recorded/reversed. H5'': Teilerstattung anteilig je Seite; Abschluss = Rest je Konto.';

REVOKE ALL ON FUNCTION yogaflow_private.process_ledger(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION yogaflow_private.process_ledger(integer)
  TO postgres, service_role;
