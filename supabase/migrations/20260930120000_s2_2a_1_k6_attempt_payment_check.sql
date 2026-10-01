-- 2.2a-1 K6 — payment_attempts: failed/canceled + payment_id erlaubt (K4/C4).
--
-- Befund: payment_attempts_succeeded_iff_payment = (status = succeeded) = (payment_id IS NOT NULL)
-- sperrt die gewollte Kombination failed/canceled + payment_id.
--
-- Rückweg:
--   ALTER TABLE public.payment_attempts
--     DROP CONSTRAINT IF EXISTS payment_attempts_succeeded_has_payment;
--   ALTER TABLE public.payment_attempts
--     DROP CONSTRAINT IF EXISTS payment_attempts_active_no_payment;
--   ALTER TABLE public.payment_attempts
--     ADD CONSTRAINT payment_attempts_succeeded_iff_payment
--     CHECK ((status = 'succeeded') = (payment_id IS NOT NULL));

DO $$
DECLARE
  v_bad integer;
BEGIN
  -- Neue Regeln dürfen von keiner bestehenden Zeile verletzt werden.
  SELECT pg_catalog.count(*)::integer INTO v_bad
  FROM public.payment_attempts a
  WHERE (a.status = 'succeeded' AND a.payment_id IS NULL)
     OR (a.status IN ('initiated', 'processing') AND a.payment_id IS NOT NULL);

  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'K6: % Zeile(n) verletzen die neuen payment_attempts-Regeln',
      v_bad;
  END IF;
END;
$$;

ALTER TABLE public.payment_attempts
  DROP CONSTRAINT IF EXISTS payment_attempts_succeeded_iff_payment;

ALTER TABLE public.payment_attempts
  ADD CONSTRAINT payment_attempts_succeeded_has_payment
  CHECK (status <> 'succeeded' OR payment_id IS NOT NULL);

ALTER TABLE public.payment_attempts
  ADD CONSTRAINT payment_attempts_active_no_payment
  CHECK (status NOT IN ('initiated', 'processing') OR payment_id IS NULL);

DO $$
DECLARE
  v_old boolean;
  v_has boolean;
  v_active boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'payment_attempts'
      AND c.conname = 'payment_attempts_succeeded_iff_payment'
  ) INTO v_old;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'payment_attempts'
      AND c.conname = 'payment_attempts_succeeded_has_payment'
  ) INTO v_has;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'payment_attempts'
      AND c.conname = 'payment_attempts_active_no_payment'
  ) INTO v_active;

  IF v_old THEN
    RAISE EXCEPTION 'Selbstprüfung: alter Constraint payment_attempts_succeeded_iff_payment noch da';
  END IF;
  IF NOT v_has THEN
    RAISE EXCEPTION 'Selbstprüfung: payment_attempts_succeeded_has_payment fehlt';
  END IF;
  IF NOT v_active THEN
    RAISE EXCEPTION 'Selbstprüfung: payment_attempts_active_no_payment fehlt';
  END IF;
END;
$$;
