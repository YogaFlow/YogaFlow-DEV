-- A2 Schritt 2 — Deckung und eingefrorener Preis an registrations.
--
-- Zweck: Jeder Einfügeweg bekommt denselben Preis und dieselbe Deckung.
-- Das setzt ein BEFORE INSERT-Trigger, nicht die Register-RPCs
-- (register_for_course, admin_register_user_for_course). Später gelten
-- dieselben Werte für pending_payment (2.1b) und das Buchen mit Karte (A6).
-- Ein mitgeschickter Preis wird überschrieben. Die Deckung setzt der Trigger
-- nur, wenn sie leer ist, damit A6 beim Einfügen gezielt pass setzen kann.
--
-- Bezug: A2, L9, A2-2, A2-3.
-- L9: price_cents_at_booking und currency sind nach dem Einfügen unveränderlich,
-- auch für service_role.
-- A2-2: Nachrücken ändert die bestehende Zeile (Status), nicht den Preis.
-- A2-3: Bestand — alle Zeilen, auch stornierte — nach derselben Regel füllen.
--
-- Rechenweg: courses.price ist numeric(10,2) in Euro. Mal 100 ergibt eine
-- ganze Zahl ohne Rundungsfehler, z. B. 12,00 € × 100 = 1.200 Cent,
-- 129,00 € × 100 = 12.900 Cent. round() sichert nur den Cast auf integer ab.
-- Für den Bestand ist das der heutige Kurspreis. Den historischen Preis zum
-- Buchungszeitpunkt kennt das System nicht. Serien-Bearbeitung hat bisher
-- auch vergangene Termine umgepreist.
--
-- Rückweg (ausführbar; diese Zeilen sind Kommentar und laufen hier nicht):
--
-- DROP TRIGGER IF EXISTS registrations_price_immutable ON public.registrations;
-- DROP TRIGGER IF EXISTS registrations_freeze_price_on_insert ON public.registrations;
-- DROP FUNCTION IF EXISTS yogaflow_private.registrations_price_immutable();
-- DROP FUNCTION IF EXISTS yogaflow_private.registrations_freeze_price();
-- ALTER TABLE public.registrations
--   DROP CONSTRAINT IF EXISTS registrations_not_required_iff_free,
--   DROP CONSTRAINT IF EXISTS registrations_currency_eur,
--   DROP CONSTRAINT IF EXISTS registrations_price_cents_nonneg,
--   DROP COLUMN IF EXISTS currency,
--   DROP COLUMN IF EXISTS price_cents_at_booking,
--   DROP COLUMN IF EXISTS coverage_status;
-- DROP TYPE IF EXISTS public.registration_coverage_status;

-- ---------------------------------------------------------------------------
-- 1. Typ und Spalten (zunächst NULL, damit der Bestand gefüllt werden kann)
-- ---------------------------------------------------------------------------

CREATE TYPE public.registration_coverage_status AS ENUM (
  'not_required',
  'open',
  'paid',
  'pass',
  'waived'
);

ALTER TABLE public.registrations
  ADD COLUMN coverage_status public.registration_coverage_status,
  ADD COLUMN price_cents_at_booking integer,
  ADD COLUMN currency text;

-- ---------------------------------------------------------------------------
-- 2. Bestand füllen (A2-3: alle Zeilen, auch stornierte)
-- ---------------------------------------------------------------------------

DO $notice_before$
DECLARE
  v_status text;
  v_count bigint;
  v_sum bigint;
BEGIN
  RAISE NOTICE 'Bestand vor dem Füllen:';
  FOR v_status, v_count IN
    SELECT COALESCE(coverage_status::text, 'NULL'), count(*)
    FROM public.registrations
    GROUP BY coverage_status
    ORDER BY 1
  LOOP
    RAISE NOTICE '  coverage_status % = %', v_status, v_count;
  END LOOP;
  SELECT COALESCE(sum(price_cents_at_booking), 0) INTO v_sum
  FROM public.registrations;
  RAISE NOTICE '  summe price_cents_at_booking = %', v_sum;
END
$notice_before$;

UPDATE public.registrations r
SET price_cents_at_booking = round(c.price * 100)::integer,
    currency = 'EUR',
    coverage_status = (
      CASE WHEN c.price = 0 THEN 'not_required' ELSE 'open' END
    )::public.registration_coverage_status
FROM public.courses c
WHERE c.id = r.course_id;

DO $notice_after$
DECLARE
  v_status text;
  v_count bigint;
  v_sum bigint;
BEGIN
  RAISE NOTICE 'Bestand nach dem Füllen:';
  FOR v_status, v_count IN
    SELECT COALESCE(coverage_status::text, 'NULL'), count(*)
    FROM public.registrations
    GROUP BY coverage_status
    ORDER BY 1
  LOOP
    RAISE NOTICE '  coverage_status % = %', v_status, v_count;
  END LOOP;
  SELECT COALESCE(sum(price_cents_at_booking), 0) INTO v_sum
  FROM public.registrations;
  RAISE NOTICE '  summe price_cents_at_booking = %', v_sum;
END
$notice_after$;

-- ---------------------------------------------------------------------------
-- 3. NOT NULL, Default, Checks
-- ---------------------------------------------------------------------------

ALTER TABLE public.registrations
  ALTER COLUMN coverage_status SET NOT NULL,
  ALTER COLUMN price_cents_at_booking SET NOT NULL,
  ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN currency SET DEFAULT 'EUR';

ALTER TABLE public.registrations
  ADD CONSTRAINT registrations_price_cents_nonneg
    CHECK (price_cents_at_booking >= 0),
  ADD CONSTRAINT registrations_currency_eur
    CHECK (currency = 'EUR'),
  ADD CONSTRAINT registrations_not_required_iff_free
    CHECK ((price_cents_at_booking = 0) = (coverage_status = 'not_required'));

-- ---------------------------------------------------------------------------
-- 4. Preis beim Einfügen aus dem Kurs, immer überschrieben
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.registrations_freeze_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_price numeric;
BEGIN
  SELECT price
    INTO v_price
  FROM public.courses
  WHERE id = NEW.course_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COURSE_NOT_FOUND: für diese Buchung gibt es keinen Kurs.';
  END IF;

  -- Mitgeschickter Preis gilt nicht. Deckung nur, wenn der Einfügeweg sie
  -- leer lässt. A6 darf coverage_status = pass mitgeben.
  NEW.price_cents_at_booking := pg_catalog.round(v_price * 100)::integer;
  NEW.currency := 'EUR';
  NEW.coverage_status := COALESCE(
    NEW.coverage_status,
    (CASE
       WHEN v_price = 0 THEN 'not_required'
       ELSE 'open'
     END)::public.registration_coverage_status
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS registrations_freeze_price_on_insert ON public.registrations;
CREATE TRIGGER registrations_freeze_price_on_insert
  BEFORE INSERT ON public.registrations
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.registrations_freeze_price();

-- ---------------------------------------------------------------------------
-- 5. Preis und Währung nach dem Einfügen unveränderlich (L9)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.registrations_price_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.price_cents_at_booking IS DISTINCT FROM OLD.price_cents_at_booking
     OR NEW.currency IS DISTINCT FROM OLD.currency
  THEN
    RAISE EXCEPTION 'PRICE_FROZEN: diesen Preis kannst du nicht mehr ändern.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS registrations_price_immutable ON public.registrations;
CREATE TRIGGER registrations_price_immutable
  BEFORE UPDATE OF price_cents_at_booking, currency
  ON public.registrations
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.registrations_price_immutable();

-- Trigger feuern ohne EXECUTE-Recht der auslösenden Rolle.
REVOKE ALL ON FUNCTION yogaflow_private.registrations_freeze_price() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION yogaflow_private.registrations_price_immutable() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Selbstprüfung
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_nulls bigint;
  v_total bigint;
  v_covered bigint;
  v_mismatch bigint;
  v_id uuid;
  v_cents integer;
  v_freeze_oid oid;
  v_immutable_oid oid;
  v_freeze_definer boolean;
  v_immutable_definer boolean;
BEGIN
  SELECT count(*)
    INTO v_nulls
  FROM public.registrations
  WHERE coverage_status IS NULL
     OR price_cents_at_booking IS NULL
     OR currency IS NULL;

  IF v_nulls <> 0 THEN
    RAISE EXCEPTION 'A2: % Zeilen mit NULL in Deckung, Preis oder Währung', v_nulls;
  END IF;

  SELECT count(*) INTO v_total FROM public.registrations;
  SELECT count(*)
    INTO v_covered
  FROM public.registrations
  WHERE coverage_status IN ('open', 'not_required');

  IF v_covered <> v_total THEN
    RAISE EXCEPTION 'A2: open + not_required = %, Gesamtzahl = %', v_covered, v_total;
  END IF;

  SELECT count(*)
    INTO v_mismatch
  FROM public.registrations r
  JOIN public.courses c ON c.id = r.course_id
  WHERE r.price_cents_at_booking IS DISTINCT FROM round(c.price * 100)::integer
     OR r.currency IS DISTINCT FROM 'EUR'
     OR r.coverage_status IS DISTINCT FROM (
          CASE WHEN c.price = 0 THEN 'not_required' ELSE 'open' END
        )::public.registration_coverage_status;

  IF v_mismatch <> 0 THEN
    RAISE EXCEPTION 'A2: % Zeilen weichen vom heutigen Kurspreis ab', v_mismatch;
  END IF;

  SELECT p.oid, p.prosecdef
    INTO v_freeze_oid, v_freeze_definer
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'yogaflow_private'
    AND p.proname = 'registrations_freeze_price'
    AND pg_get_function_identity_arguments(p.oid) = '';

  IF v_freeze_oid IS NULL OR NOT v_freeze_definer THEN
    RAISE EXCEPTION 'A2: registrations_freeze_price fehlt oder ist nicht SECURITY DEFINER';
  END IF;

  SELECT p.oid, p.prosecdef
    INTO v_immutable_oid, v_immutable_definer
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'yogaflow_private'
    AND p.proname = 'registrations_price_immutable'
    AND pg_get_function_identity_arguments(p.oid) = '';

  IF v_immutable_oid IS NULL OR v_immutable_definer THEN
    RAISE EXCEPTION 'A2: registrations_price_immutable fehlt oder ist nicht SECURITY INVOKER';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_options_to_table((SELECT proconfig FROM pg_proc WHERE oid = v_freeze_oid))
    WHERE option_name = 'search_path'
      AND option_value = '""'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_options_to_table((SELECT proconfig FROM pg_proc WHERE oid = v_immutable_oid))
    WHERE option_name = 'search_path'
      AND option_value = '""'
  ) THEN
    RAISE EXCEPTION 'A2: search_path der Preisfunktionen ist nicht leer';
  END IF;

  IF has_function_privilege('anon', v_freeze_oid, 'EXECUTE')
     OR has_function_privilege('authenticated', v_freeze_oid, 'EXECUTE')
     OR has_function_privilege('anon', v_immutable_oid, 'EXECUTE')
     OR has_function_privilege('authenticated', v_immutable_oid, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'A2: anon oder authenticated hat EXECUTE auf eine Preisfunktion';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'registrations'
      AND NOT t.tgisinternal
      AND t.tgname = 'registrations_freeze_price_on_insert'
      AND (t.tgtype & 2) = 2
      AND (t.tgtype & 4) = 4
  ) THEN
    RAISE EXCEPTION 'A2: Trigger registrations_freeze_price_on_insert (BEFORE INSERT) fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'registrations'
      AND NOT t.tgisinternal
      AND t.tgname = 'registrations_price_immutable'
      AND (t.tgtype & 2) = 2
      AND (t.tgtype & 16) = 16
      AND pg_get_triggerdef(t.oid) ILIKE '%price_cents_at_booking%'
      AND pg_get_triggerdef(t.oid) ILIKE '%currency%'
  ) THEN
    RAISE EXCEPTION 'A2: Trigger registrations_price_immutable (BEFORE UPDATE OF Preis und Währung) fehlt';
  END IF;

  SELECT id, price_cents_at_booking
    INTO v_id, v_cents
  FROM public.registrations
  LIMIT 1;

  IF v_id IS NULL THEN
    RAISE NOTICE 'A2: registrations ist leer, Unveränderlichkeitstest übersprungen';
  ELSE
    BEGIN
      UPDATE public.registrations
         SET price_cents_at_booking = price_cents_at_booking + 1
       WHERE id = v_id;

      RAISE EXCEPTION 'self-check: PRICE_FROZEN ist nicht ausgelöst worden';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM NOT LIKE 'PRICE_FROZEN:%' THEN
          RAISE;
        END IF;
    END;

    IF (SELECT price_cents_at_booking FROM public.registrations WHERE id = v_id)
         IS DISTINCT FROM v_cents
    THEN
      RAISE EXCEPTION 'A2: Preis hat sich trotz PRICE_FROZEN geändert';
    END IF;
  END IF;
END $$;
