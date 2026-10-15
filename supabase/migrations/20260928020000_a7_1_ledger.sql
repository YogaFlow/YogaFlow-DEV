-- A7-1 — Hauptbuch mit logischen Konten (Schema + Hintergrund-Job).
--
-- Zweck: tenant_tax_settings (Minimalform aus 1.1), ledger_entries,
-- ledger_event_log, process_ledger per pg_cron alle 5 Minuten.
-- Entscheidungen H1–H9 (Inventur A7 / Julius 28.09.2026).
--
-- Quelle nur payment.recorded / payment.reversed (H4).
-- Ohne Steuerstatus wartet das Hauptbuch (H1). Fehler blockieren nie die Zahlung (H2).
--
-- Nicht anwenden in diesem Auftrag — Datei nur schreiben.
--
-- Rückweg (Kommentar, läuft nicht):
--   SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'yogaflow_process_ledger';
--   DROP FUNCTION IF EXISTS public.process_ledger(integer);
--   DROP FUNCTION IF EXISTS yogaflow_private.process_ledger(integer);
--   DROP FUNCTION IF EXISTS yogaflow_private.ledger_unbalanced_events(uuid);
--   DROP FUNCTION IF EXISTS public.set_tax_setting(text, integer, date);
--   -- delete_tenant_complete auf A6-2b-Fassung zurücksetzen
--   DROP TABLE IF EXISTS public.ledger_event_log;
--   DROP TABLE IF EXISTS public.ledger_entries;
--   DROP TABLE IF EXISTS public.tenant_tax_settings;

-- ---------------------------------------------------------------------------
-- 0. pg_cron
-- ---------------------------------------------------------------------------
-- Extension und Schema-Rechte liegen seit A6-3
-- (20260928010000_a6_3_reverse_and_expire.sql). Hier bewusst kein
-- CREATE EXTENSION und kein GRANT/REVOKE auf Schema cron — erneutes
-- Anfassen von Systemrechten (postgres hat USAGE/SELECT WITH GRANT OPTION
-- von supabase_admin) kann 2BP01 „dependent privileges exist“ auslösen.
-- Der Job unten braucht nur cron.schedule (bereits nutzbar).

-- ---------------------------------------------------------------------------
-- 1. tenant_tax_settings (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE public.tenant_tax_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  regime text NOT NULL,
  vat_rate_bp integer NOT NULL,
  valid_from date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_tax_settings_regime_check
    CHECK (regime IN ('regular', 'small_business')),
  CONSTRAINT tenant_tax_settings_vat_rate_check
    CHECK (
      (regime = 'regular' AND vat_rate_bp IN (1900, 700))
      OR (regime = 'small_business' AND vat_rate_bp = 0)
    ),
  CONSTRAINT tenant_tax_settings_tenant_valid_from_key
    UNIQUE (tenant_id, valid_from)
);

CREATE INDEX tenant_tax_settings_tenant_valid_from_idx
  ON public.tenant_tax_settings (tenant_id, valid_from DESC);

COMMENT ON TABLE public.tenant_tax_settings IS
  'Steuerstatus je Studio, historisiert (valid_from). Append-only. Schreiben nur set_tax_setting (Owner). A7 H1/H6.';

CREATE TRIGGER tenant_tax_settings_append_only
  BEFORE UPDATE OR DELETE ON public.tenant_tax_settings
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.enforce_append_only();

ALTER TABLE public.tenant_tax_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_tax_settings_select_managers
  ON public.tenant_tax_settings
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = yogaflow_private.get_my_tenant_id()
    AND yogaflow_private.is_tenant_manager()
  );

REVOKE ALL ON TABLE public.tenant_tax_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.tenant_tax_settings TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. ledger_entries (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL REFERENCES public.payments (id) ON DELETE RESTRICT,
  account text NOT NULL,
  debit_cents integer NOT NULL DEFAULT 0,
  credit_cents integer NOT NULL DEFAULT 0,
  sale_kind text NOT NULL,
  tax_regime text NOT NULL,
  vat_rate_bp integer NOT NULL,
  booking_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_entries_account_check
    CHECK (account IN (
      'cash',
      'bank',
      'paypal_clearing',
      'revenue_standard',
      'revenue_small_business',
      'vat_output'
    )),
  CONSTRAINT ledger_entries_debit_credit_check
    CHECK (
      debit_cents >= 0
      AND credit_cents >= 0
      AND (
        (debit_cents > 0 AND credit_cents = 0)
        OR (credit_cents > 0 AND debit_cents = 0)
      )
    ),
  CONSTRAINT ledger_entries_sale_kind_check
    CHECK (sale_kind IN ('course', 'pass')),
  CONSTRAINT ledger_entries_tax_regime_check
    CHECK (tax_regime IN ('regular', 'small_business')),
  CONSTRAINT ledger_entries_event_account_key
    UNIQUE (event_id, account)
);

CREATE INDEX ledger_entries_tenant_booking_date_idx
  ON public.ledger_entries (tenant_id, booking_date DESC);

CREATE INDEX ledger_entries_payment_id_idx
  ON public.ledger_entries (payment_id);

CREATE INDEX ledger_entries_event_id_idx
  ON public.ledger_entries (event_id);

COMMENT ON TABLE public.ledger_entries IS
  'Hauptbuchzeilen. Append-only. Eine Zeile je Konto je Event (H3). Keine Personen. Quelle payment.* (H4).';

CREATE TRIGGER ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON public.ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.enforce_append_only();

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledger_entries_select_managers
  ON public.ledger_entries
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = yogaflow_private.get_my_tenant_id()
    AND yogaflow_private.is_tenant_manager()
  );

REVOKE ALL ON TABLE public.ledger_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.ledger_entries TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. ledger_event_log (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE public.ledger_event_log (
  event_id uuid PRIMARY KEY REFERENCES public.events (id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  status text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_event_log_status_check
    CHECK (status IN ('booked', 'ignored'))
);

CREATE INDEX ledger_event_log_tenant_processed_at_idx
  ON public.ledger_event_log (tenant_id, processed_at DESC);

COMMENT ON TABLE public.ledger_event_log IS
  'Abgeschlossen verarbeitete Geld-Events für das Hauptbuch. Wartende Events haben keine Zeile (H2/H5).';

CREATE TRIGGER ledger_event_log_append_only
  BEFORE UPDATE OR DELETE ON public.ledger_event_log
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.enforce_append_only();

ALTER TABLE public.ledger_event_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledger_event_log_select_managers
  ON public.ledger_event_log
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = yogaflow_private.get_my_tenant_id()
    AND yogaflow_private.is_tenant_manager()
  );

REVOKE ALL ON TABLE public.ledger_event_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.ledger_event_log TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. set_tax_setting (nur Owner)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_tax_setting(
  p_regime text,
  p_vat_rate_bp integer,
  p_valid_from date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_member_id uuid;
  v_tenant_id uuid;
  v_regime text;
  v_rate integer;
  v_from date;
  v_last date;
  v_earliest date;
  v_id uuid;
  v_event_id uuid;
BEGIN
  v_member_id := yogaflow_private.get_my_member_id();
  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_member_id IS NULL OR v_tenant_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF NOT yogaflow_private.is_owner() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  v_regime := NULLIF(pg_catalog.btrim(COALESCE(p_regime, '')), '');
  v_rate := p_vat_rate_bp;
  v_from := p_valid_from;

  IF v_from IS NULL
     OR v_regime IS NULL
     OR NOT (
       (v_regime = 'regular' AND v_rate IN (1900, 700))
       OR (v_regime = 'small_business' AND v_rate = 0)
     )
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_TAX_SETTING');
  END IF;

  SELECT max(le.booking_date)
    INTO v_last
  FROM public.ledger_entries le
  WHERE le.tenant_id = v_tenant_id;

  IF v_last IS NOT NULL AND v_from <= v_last THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error', 'ALREADY_BOOKED',
      'last_booking_date', v_last
    );
  END IF;

  -- Erste Angabe: muss alle bestehenden Zahlungen abdecken (sonst hängen sie ewig).
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_tax_settings t
    WHERE t.tenant_id = v_tenant_id
  ) THEN
    SELECT min((p.received_at AT TIME ZONE 'Europe/Berlin')::date)
      INTO v_earliest
    FROM public.payments p
    WHERE p.tenant_id = v_tenant_id
      AND p.reverses_payment_id IS NULL
      AND (p.received_at AT TIME ZONE 'Europe/Berlin')::date < v_from;

    IF v_earliest IS NOT NULL THEN
      RETURN pg_catalog.jsonb_build_object(
        'success', false,
        'error', 'BEFORE_FIRST_PAYMENT',
        'earliest_booking_date', v_earliest
      );
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.tenant_tax_settings (
      tenant_id, regime, vat_rate_bp, valid_from
    ) VALUES (
      v_tenant_id, v_regime, v_rate, v_from
    )
    RETURNING id INTO v_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'DUPLICATE_DATE');
  END;

  v_event_id := yogaflow_private.insert_event(
    v_tenant_id,
    'tax_setting.changed',
    'tax_setting',
    v_id,
    pg_catalog.jsonb_build_object(
      'regime', v_regime,
      'vat_rate_bp', v_rate,
      'valid_from', v_from
    ),
    pg_catalog.gen_random_uuid()
  );

  PERFORM yogaflow_private.insert_audit(
    v_tenant_id,
    v_member_id,
    'tax_setting.changed',
    'tenant_tax_settings',
    v_id,
    ARRAY['regime', 'vat_rate_bp', 'valid_from']::text[],
    v_event_id
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'id', v_id,
    'regime', v_regime,
    'vat_rate_bp', v_rate,
    'valid_from', v_from
  );
END;
$function$;

COMMENT ON FUNCTION public.set_tax_setting(text, integer, date) IS
  'Setzt einen historisierten Steuerstatus. Nur Owner. H1/H6. Fehler: FORBIDDEN, INVALID_TAX_SETTING, ALREADY_BOOKED, BEFORE_FIRST_PAYMENT, DUPLICATE_DATE.';

REVOKE ALL ON FUNCTION public.set_tax_setting(text, integer, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_tax_setting(text, integer, date)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Helfer: Geldkonto, Sale-Kind, Netto (H8)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.ledger_money_account(
  p_method public.payment_method
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT CASE p_method
    WHEN 'cash'::public.payment_method THEN 'cash'
    WHEN 'bank_transfer'::public.payment_method THEN 'bank'
    WHEN 'paypal_manual'::public.payment_method THEN 'paypal_clearing'
    ELSE NULL
  END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.ledger_money_account(public.payment_method)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION yogaflow_private.ledger_money_account(public.payment_method)
  TO postgres, service_role;

CREATE OR REPLACE FUNCTION yogaflow_private.ledger_sale_kind(
  p_subject_type text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT CASE p_subject_type
    WHEN 'registration' THEN 'course'
    WHEN 'pass_purchase' THEN 'pass'
    ELSE NULL
  END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.ledger_sale_kind(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION yogaflow_private.ledger_sale_kind(text)
  TO postgres, service_role;

CREATE OR REPLACE FUNCTION yogaflow_private.ledger_net_cents(
  p_brutto integer,
  p_vat_rate_bp integer
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  -- H8: round(brutto × 10000 / (10000 + satz_bp)), kaufmännisch auf Cent
  SELECT CASE
    WHEN p_brutto IS NULL OR p_vat_rate_bp IS NULL OR p_vat_rate_bp < 0 THEN NULL
    WHEN p_vat_rate_bp = 0 THEN p_brutto
    ELSE pg_catalog.round(
      (p_brutto::numeric * 10000) / (10000 + p_vat_rate_bp)
    )::integer
  END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.ledger_net_cents(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION yogaflow_private.ledger_net_cents(integer, integer)
  TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- 6. process_ledger
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
  'Bucht payment.recorded/reversed ins Hauptbuch. Nur Studios mit Steuerstatus. Wartende ohne Log-Zeile. Lock → skipped=locked. Nur postgres/service_role. H2–H5, H8, H9.';

REVOKE ALL ON FUNCTION yogaflow_private.process_ledger(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION yogaflow_private.process_ledger(integer)
  TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.process_ledger(p_limit integer DEFAULT 500)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT yogaflow_private.process_ledger(p_limit);
$function$;

COMMENT ON FUNCTION public.process_ledger(integer) IS
  'Alias für yogaflow_private.process_ledger. Nur service_role/postgres.';

REVOKE ALL ON FUNCTION public.process_ledger(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_ledger(integer)
  TO postgres, service_role;

-- Cron alle 5 Minuten, idempotent angelegt.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'yogaflow_process_ledger'
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'yogaflow_process_ledger',
    '*/5 * * * *',
    $cron$SELECT yogaflow_private.process_ledger();$cron$
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. ledger_unbalanced_events
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.ledger_unbalanced_events(
  p_tenant uuid
)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT le.event_id
  FROM public.ledger_entries le
  WHERE le.tenant_id = p_tenant
  GROUP BY le.event_id
  HAVING sum(le.debit_cents) IS DISTINCT FROM sum(le.credit_cents);
$function$;

COMMENT ON FUNCTION yogaflow_private.ledger_unbalanced_events(uuid) IS
  'Events mit Summe Soll ≠ Summe Haben. Nur service_role/postgres (Tests/Generalprobe).';

REVOKE ALL ON FUNCTION yogaflow_private.ledger_unbalanced_events(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION yogaflow_private.ledger_unbalanced_events(uuid)
  TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.ledger_unbalanced_events(p_tenant uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT yogaflow_private.ledger_unbalanced_events(p_tenant);
$function$;

COMMENT ON FUNCTION public.ledger_unbalanced_events(uuid) IS
  'Alias für yogaflow_private.ledger_unbalanced_events. Nur service_role/postgres.';

REVOKE ALL ON FUNCTION public.ledger_unbalanced_events(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ledger_unbalanced_events(uuid)
  TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- 8. delete_tenant_complete (A6-2b + Ledger/Steuer vor events)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_tenant_complete(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND: Kein Tenant mit dieser ID.'
      USING ERRCODE = 'P0002';
  END IF;

  ALTER TABLE public.users DISABLE TRIGGER prevent_last_owner_delete;
  BEGIN
    SET LOCAL yogaflow.allow_append_only_delete = 'on';
    SET LOCAL yogaflow.allow_payment_delete = 'on';
    SET LOCAL yogaflow.allow_pass_product_delete = 'on';
    SET LOCAL yogaflow.allow_pass_delete = 'on';
    -- A6-2b/c: Zyklus registrations.pass_id → passes → payments → registrations
    SET CONSTRAINTS public.registrations_pass_id_fkey DEFERRED;

    -- A7-1: Ledger und Steuer vor events/payments (FKs RESTRICT)
    DELETE FROM public.ledger_event_log WHERE tenant_id = p_tenant_id;
    DELETE FROM public.ledger_entries WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenant_tax_settings WHERE tenant_id = p_tenant_id;

    DELETE FROM public.audit_log WHERE tenant_id = p_tenant_id;
    DELETE FROM public.events WHERE tenant_id = p_tenant_id;
    DELETE FROM public.user_notifications WHERE tenant_id = p_tenant_id;
    DELETE FROM public.messages WHERE tenant_id = p_tenant_id;
    DELETE FROM public.pass_movements WHERE tenant_id = p_tenant_id;
    DELETE FROM public.passes WHERE tenant_id = p_tenant_id;
    DELETE FROM public.payments
      WHERE tenant_id = p_tenant_id
        AND reverses_payment_id IS NOT NULL;
    DELETE FROM public.payments WHERE tenant_id = p_tenant_id;
    DELETE FROM public.registrations WHERE tenant_id = p_tenant_id;
    DELETE FROM public.courses WHERE tenant_id = p_tenant_id;
    DELETE FROM public.pass_products WHERE tenant_id = p_tenant_id;
    DELETE FROM public.users WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenants WHERE id = p_tenant_id;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.users ENABLE TRIGGER prevent_last_owner_delete;
    RAISE;
  END;

  ALTER TABLE public.users ENABLE TRIGGER prevent_last_owner_delete;
END;
$function$;

COMMENT ON FUNCTION public.delete_tenant_complete(uuid) IS
  'Löscht einen Mandanten: ledger_event_log, ledger_entries, tenant_tax_settings, audit_log, events, user_notifications, messages, pass_movements, passes, payments, registrations, courses, pass_products, users, tenants. A6-2b SET CONSTRAINTS; A7-1 Ledger vor events. auth.users separat. Nur postgres/service_role.';

REVOKE ALL ON FUNCTION public.delete_tenant_complete(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tenant_complete(uuid)
  TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- 9. Selbstprüfung (statisch)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_def text;
  v_sec boolean;
BEGIN
  IF to_regclass('public.tenant_tax_settings') IS NULL
     OR to_regclass('public.ledger_entries') IS NULL
     OR to_regclass('public.ledger_event_log') IS NULL
  THEN
    RAISE EXCEPTION 'A7-1: Tabellen fehlen';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenant_tax_settings_tenant_valid_from_key'
  ) THEN
    RAISE EXCEPTION 'A7-1: UNIQUE (tenant_id, valid_from) fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ledger_entries_event_account_key'
  ) THEN
    RAISE EXCEPTION 'A7-1: UNIQUE (event_id, account) fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'tenant_tax_settings_append_only'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'ledger_entries_append_only'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'ledger_event_log_append_only'
  ) THEN
    RAISE EXCEPTION 'A7-1: Append-only-Trigger fehlen';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tenant_tax_settings'
      AND policyname = 'tenant_tax_settings_select_managers'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ledger_entries'
      AND policyname = 'ledger_entries_select_managers'
  ) THEN
    RAISE EXCEPTION 'A7-1: RLS-Policies fehlen';
  END IF;

  -- Kein Tabellen-Schreibrecht für authenticated
  IF has_table_privilege('authenticated', 'public.tenant_tax_settings', 'INSERT')
     OR has_table_privilege('authenticated', 'public.tenant_tax_settings', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.tenant_tax_settings', 'DELETE')
     OR has_table_privilege('authenticated', 'public.ledger_entries', 'INSERT')
     OR has_table_privilege('authenticated', 'public.ledger_entries', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.ledger_entries', 'DELETE')
     OR has_table_privilege('authenticated', 'public.ledger_event_log', 'INSERT')
     OR has_table_privilege('authenticated', 'public.ledger_event_log', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.ledger_event_log', 'DELETE')
  THEN
    RAISE EXCEPTION 'A7-1: authenticated hat Schreibrecht auf Ledger/Steuer';
  END IF;

  SELECT p.prosecdef, pg_get_functiondef(p.oid)
    INTO v_sec, v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'set_tax_setting';

  IF NOT COALESCE(v_sec, false) THEN
    RAISE EXCEPTION 'A7-1: set_tax_setting nicht SECURITY DEFINER';
  END IF;

  IF position('search_path' IN v_def) = 0
     OR v_def LIKE '%search_path TO ''public''%'
     OR v_def LIKE '%search_path TO public%'
  THEN
    RAISE EXCEPTION 'A7-1: set_tax_setting search_path nicht leer';
  END IF;

  IF has_function_privilege('anon', 'public.set_tax_setting(text,integer,date)', 'EXECUTE')
     OR NOT has_function_privilege(
          'authenticated',
          'public.set_tax_setting(text,integer,date)',
          'EXECUTE'
        )
  THEN
    RAISE EXCEPTION 'A7-1: EXECUTE auf set_tax_setting falsch';
  END IF;

  IF has_function_privilege(
       'authenticated',
       'yogaflow_private.process_ledger(integer)',
       'EXECUTE'
     )
     OR has_function_privilege(
          'anon',
          'yogaflow_private.process_ledger(integer)',
          'EXECUTE'
        )
     OR has_function_privilege(
          'authenticated',
          'public.process_ledger(integer)',
          'EXECUTE'
        )
     OR has_function_privilege(
          'anon',
          'public.process_ledger(integer)',
          'EXECUTE'
        )
  THEN
    RAISE EXCEPTION 'A7-1: process_ledger darf nicht für anon/authenticated EXECUTE haben';
  END IF;

  IF has_function_privilege(
       'authenticated',
       'public.ledger_unbalanced_events(uuid)',
       'EXECUTE'
     )
     OR has_function_privilege(
          'anon',
          'public.ledger_unbalanced_events(uuid)',
          'EXECUTE'
        )
  THEN
    RAISE EXCEPTION 'A7-1: ledger_unbalanced_events darf nicht für anon/authenticated EXECUTE haben';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'yogaflow_process_ledger'
  ) THEN
    RAISE EXCEPTION 'A7-1: Cron-Job yogaflow_process_ledger fehlt';
  END IF;

  SELECT pg_get_functiondef('public.delete_tenant_complete(uuid)'::regprocedure)
    INTO v_def;
  IF v_def IS NULL
     OR v_def NOT LIKE '%ledger_event_log%'
     OR v_def NOT LIKE '%ledger_entries%'
     OR v_def NOT LIKE '%tenant_tax_settings%'
  THEN
    RAISE EXCEPTION 'A7-1: delete_tenant_complete ohne Ledger/Steuer-Tabellen';
  END IF;
  IF position('ledger_event_log' IN v_def)
       > position('DELETE FROM public.events' IN v_def)
     OR position('ledger_entries' IN v_def)
       > position('DELETE FROM public.events' IN v_def)
     OR position('tenant_tax_settings' IN v_def)
       > position('DELETE FROM public.events' IN v_def)
  THEN
    RAISE EXCEPTION 'A7-1: delete_tenant_complete löscht Ledger nicht vor events';
  END IF;
END;
$$;
