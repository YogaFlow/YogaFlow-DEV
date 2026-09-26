-- A1 — Soft-Cancel-Schema für registrations (Spalten, Regeln, Eindeutigkeit).
--
-- Zweck / Entscheidungen:
--   D1  cancellation_timestamp weiterverwenden; neu cancelled_by, cancel_reason;
--       CHECK status = 'cancelled' ⇔ cancellation_timestamp IS NOT NULL
--   D1a ALLE Altzeilen mit cancellation_timestamp IS NOT NULL → status cancelled,
--       cancel_reason = legacy_closed, TS unverändert, waitlist_position = NULL,
--       is_waitlist unverändert. Begründung: TS liegen vor Kursbeginn
--       (Vorprüfung A1); Teilnahme nicht belegbar. Bildet das heutige Verhalten
--       ab (alle Filter mit cancellation_timestamp IS NULL behandeln die Zeilen
--       schon als inaktiv).
--   D2  is_waitlist bleibt; bei cancelled behält den letzten Wert
--   D3  Erneut anmelden = neue Zeile → partieller Unique-Index nur aktiv
--   D4  FK course_id bleibt RESTRICT (kein Eingriff)
--   D5  Stornierte in A1 ausblenden wie heute (kein Policy-Eingriff; Filter
--       cancellation_timestamp IS NULL bleiben gültig)
--   D6  Enum-Wert kommt aus 20260926141500; hier erst Nutzung
--
-- messages.tenant_id SET NOT NULL: verschoben. buildThreadSendPayload setzt
-- tenantId: undefined; eigener Fix nötig, bevor NOT NULL sicher ist.
--
-- Bewusst nicht in dieser Datei: RPC-Umbau, Trigger-Umbau, Grants/Policies
-- (Schritt 2). Harte DELETEs bleiben bis dahin bestehen.
--
-- Rückweg (nach dieser Migration, vor Schritt 2):
--   DROP INDEX IF EXISTS public.registrations_active_course_user_key;
--   ALTER TABLE public.registrations
--     DROP CONSTRAINT IF EXISTS registrations_waitlist_consistent,
--     DROP CONSTRAINT IF EXISTS registrations_cancel_reason_required,
--     DROP CONSTRAINT IF EXISTS registrations_cancelled_consistent,
--     DROP CONSTRAINT IF EXISTS registrations_cancel_reason_check,
--     ALTER COLUMN status DROP NOT NULL,
--     DROP CONSTRAINT IF EXISTS registrations_cancelled_by_fkey,
--     DROP COLUMN IF EXISTS cancel_reason,
--     DROP COLUMN IF EXISTS cancelled_by;
--   UPDATE public.registrations
--     SET status = CASE WHEN is_waitlist THEN 'waitlist'::registration_status
--                       ELSE 'registered'::registration_status END,
--         cancel_reason = NULL
--     WHERE cancel_reason = 'legacy_closed';
--   -- waitlist_position der Altzeilen geht verloren (vergangene Kurse, ohne
--   -- Bedeutung). Rückweg gilt nur vor Schritt 2 (danach können Paare aus
--   -- stornierter und neuer Zeile existieren, dann scheitert der volle UNIQUE).
--   ALTER TABLE public.registrations
--     ADD CONSTRAINT registrations_course_id_user_id_key UNIQUE (course_id, user_id);
--   -- Enum-Wert 'cancelled' bleibt (siehe Datei 1).

-- ---------------------------------------------------------------------------
-- Spalten
-- ---------------------------------------------------------------------------

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS cancelled_by uuid NULL,
  ADD COLUMN IF NOT EXISTS cancel_reason text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'registrations_cancelled_by_fkey'
      AND conrelid = 'public.registrations'::regclass
  ) THEN
    ALTER TABLE public.registrations
      ADD CONSTRAINT registrations_cancelled_by_fkey
      FOREIGN KEY (cancelled_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'registrations_cancel_reason_check'
      AND conrelid = 'public.registrations'::regclass
  ) THEN
    ALTER TABLE public.registrations
      ADD CONSTRAINT registrations_cancel_reason_check
      CHECK (
        cancel_reason IS NULL
        OR cancel_reason IN (
          'participant',
          'studio',
          'course_cancelled',
          'promotion_expired',
          'role_change',
          'legacy_closed'
        )
      );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- D1a — Altzeilen mit gesetztem cancellation_timestamp
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_before int;
  v_after int;
  v_registered_before int;
  v_waitlist_before int;
BEGIN
  SELECT count(*) INTO v_before
  FROM public.registrations
  WHERE cancellation_timestamp IS NOT NULL;

  SELECT count(*) INTO v_registered_before
  FROM public.registrations
  WHERE cancellation_timestamp IS NOT NULL
    AND status = 'registered';

  SELECT count(*) INTO v_waitlist_before
  FROM public.registrations
  WHERE cancellation_timestamp IS NOT NULL
    AND status = 'waitlist';

  RAISE NOTICE 'A1 D1a before: total_with_ts=%, registered=%, waitlist=%',
    v_before, v_registered_before, v_waitlist_before;

  UPDATE public.registrations
  SET
    status = 'cancelled',
    cancel_reason = 'legacy_closed',
    waitlist_position = NULL
  WHERE cancellation_timestamp IS NOT NULL;

  GET DIAGNOSTICS v_after = ROW_COUNT;

  RAISE NOTICE 'A1 D1a after: rows_updated=%, remaining_active_status_with_ts=%',
    v_after,
    (
      SELECT count(*)
      FROM public.registrations
      WHERE cancellation_timestamp IS NOT NULL
        AND status IS DISTINCT FROM 'cancelled'
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- status NOT NULL + CHECKs
-- ---------------------------------------------------------------------------

ALTER TABLE public.registrations
  ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registrations_cancelled_consistent'
      AND conrelid = 'public.registrations'::regclass
  ) THEN
    ALTER TABLE public.registrations
      ADD CONSTRAINT registrations_cancelled_consistent
      CHECK ((status = 'cancelled') = (cancellation_timestamp IS NOT NULL));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registrations_cancel_reason_required'
      AND conrelid = 'public.registrations'::regclass
  ) THEN
    ALTER TABLE public.registrations
      ADD CONSTRAINT registrations_cancel_reason_required
      CHECK ((status = 'cancelled') = (cancel_reason IS NOT NULL));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registrations_waitlist_consistent'
      AND conrelid = 'public.registrations'::regclass
  ) THEN
    ALTER TABLE public.registrations
      ADD CONSTRAINT registrations_waitlist_consistent
      CHECK (status = 'cancelled' OR is_waitlist = (status = 'waitlist'));
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Eindeutigkeit: nur aktive Zeilen
-- ---------------------------------------------------------------------------

ALTER TABLE public.registrations
  DROP CONSTRAINT IF EXISTS registrations_course_id_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS registrations_active_course_user_key
  ON public.registrations (course_id, user_id)
  WHERE status IN ('registered', 'waitlist');

-- ---------------------------------------------------------------------------
-- Selbstprüfung
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_n int;
  v_idx_unique boolean;
  v_idx_partial boolean;
BEGIN
  SELECT count(*) INTO v_n
  FROM public.registrations
  WHERE NOT ((status = 'cancelled') = (cancellation_timestamp IS NOT NULL));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'A1 self-check: registrations_cancelled_consistent verletzt (% Zeilen)', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.registrations
  WHERE NOT ((status = 'cancelled') = (cancel_reason IS NOT NULL));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'A1 self-check: registrations_cancel_reason_required verletzt (% Zeilen)', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.registrations
  WHERE status <> 'cancelled'
    AND is_waitlist IS DISTINCT FROM (status = 'waitlist');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'A1 self-check: registrations_waitlist_consistent verletzt (% Zeilen)', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM (
    SELECT course_id, user_id
    FROM public.registrations
    WHERE status IN ('registered', 'waitlist')
    GROUP BY course_id, user_id
    HAVING count(*) > 1
  ) d;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'A1 self-check: aktive Doppelungen (course_id, user_id) = %', v_n;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registrations_course_id_user_id_key'
      AND conrelid = 'public.registrations'::regclass
  ) THEN
    RAISE EXCEPTION 'A1 self-check: registrations_course_id_user_id_key existiert noch';
  END IF;

  SELECT i.indisunique, (i.indpred IS NOT NULL) INTO v_idx_unique, v_idx_partial
  FROM pg_class c
  JOIN pg_index i ON i.indexrelid = c.oid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'registrations_active_course_user_key';

  IF v_idx_unique IS DISTINCT FROM true OR v_idx_partial IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'A1 self-check: registrations_active_course_user_key fehlt, nicht unique oder nicht partiell';
  END IF;

  SELECT count(*) INTO v_n
  FROM public.registrations
  WHERE cancellation_timestamp IS NOT NULL
    AND status <> 'cancelled';
  IF v_n <> 0 THEN
    RAISE EXCEPTION
      'A1 self-check: % Zeilen mit cancellation_timestamp und status <> cancelled',
      v_n;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'registrations'
      AND t.tgname = 'promote_waitlist_after_registered_delete'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'A1 self-check: Trigger promote_waitlist_after_registered_delete fehlt';
  END IF;
END;
$$;
