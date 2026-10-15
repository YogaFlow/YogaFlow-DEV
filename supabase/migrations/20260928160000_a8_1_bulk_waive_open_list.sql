-- A8-1 — Sammelaktion „vor Omlify erledigt“ + Offene-Liste + Kurs-Karten-RPC.
--
-- Zweck: Owner/Admin markieren alle offenen, aktiven Buchungen mit Kursbeginn
-- vor einem Datum (und in der Vergangenheit) atomar als waived/pre_omlify.
-- Vorschau, Batch-Rücknahme, Liste offener Beträge, eine RPC für alle Karten
-- eines Kurses (ersetzt N× get_member_passes in der Kasse).
--
-- Bezug: Nachtrag A8, Entscheidungen S1–S7 (28.09.2026).
-- S1 Sammelaktion bis Datum, atomar, als Ganzes rücknehmbar; nur Owner/Admin.
-- S2 Nur status=registered, coverage_status=open, Kursbeginn < Datum und < now().
-- S3 get_open_coverage gleiche Filter; Summe je Person erst in A8-2 UI.
-- S7 get_course_member_passes statt N+1.
--
-- Nebenwirkungen: coverage.waived erzeugt weder Glocke noch Ledger-Zeile
-- (process_ledger nur payment.recorded/reversed) — geprüft vor Textvorgabe Teil E.
--
-- Rückweg (Kommentar, läuft hier nicht):
--
-- CREATE OR REPLACE FUNCTION public.delete_tenant_complete(p_tenant_id uuid)
--   … Fassung A7-1 ohne coverage_waive_batches …
-- CREATE OR REPLACE FUNCTION public.revert_coverage_waived(uuid)
--   … Fassung A2 ohne coverage_waived_batch_id …
-- CREATE OR REPLACE FUNCTION public.set_coverage_waived(uuid, text, text)
--   … Fassung A2 ohne internen Helfer …
-- DROP FUNCTION IF EXISTS public.get_course_member_passes(uuid);
-- DROP FUNCTION IF EXISTS public.get_open_coverage();
-- DROP FUNCTION IF EXISTS public.get_pre_omlify_batches();
-- DROP FUNCTION IF EXISTS public.revert_pre_omlify_batch(uuid);
-- DROP FUNCTION IF EXISTS public.waive_pre_omlify_before(date, integer);
-- DROP FUNCTION IF EXISTS public.preview_pre_omlify_waive(date);
-- DROP FUNCTION IF EXISTS yogaflow_private.revert_coverage_waived_internal(uuid, uuid);
-- DROP FUNCTION IF EXISTS yogaflow_private.waive_coverage_internal(uuid, uuid, text, text, uuid);
-- ALTER TABLE public.registrations
--   DROP CONSTRAINT IF EXISTS registrations_batch_id_implies_pre_omlify,
--   DROP CONSTRAINT IF EXISTS registrations_coverage_waived_batch_id_fkey,
--   DROP COLUMN IF EXISTS coverage_waived_batch_id;
-- DROP TABLE IF EXISTS public.coverage_waive_batches;

-- ---------------------------------------------------------------------------
-- 1. Tabelle coverage_waive_batches (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE public.coverage_waive_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  before_date date NOT NULL,
  waived_count integer NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coverage_waive_batches_waived_count_check
    CHECK (waived_count > 0),
  CONSTRAINT coverage_waive_batches_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants (id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT coverage_waive_batches_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.users (id)
    ON DELETE SET NULL
);

CREATE INDEX coverage_waive_batches_tenant_created_idx
  ON public.coverage_waive_batches (tenant_id, created_at DESC);

COMMENT ON TABLE public.coverage_waive_batches IS
  'Sammel-Erlass vor Omlify (A8). Append-only. Schreiben nur waive_pre_omlify_before.';

CREATE TRIGGER coverage_waive_batches_append_only
  BEFORE UPDATE OR DELETE ON public.coverage_waive_batches
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.enforce_append_only();

ALTER TABLE public.coverage_waive_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY coverage_waive_batches_select_managers
  ON public.coverage_waive_batches
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = yogaflow_private.get_my_tenant_id()
    AND yogaflow_private.is_tenant_manager()
  );

REVOKE ALL ON TABLE public.coverage_waive_batches FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.coverage_waive_batches TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Spalte registrations.coverage_waived_batch_id
-- ---------------------------------------------------------------------------

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS coverage_waived_batch_id uuid;

ALTER TABLE public.registrations
  DROP CONSTRAINT IF EXISTS registrations_coverage_waived_batch_id_fkey;

ALTER TABLE public.registrations
  ADD CONSTRAINT registrations_coverage_waived_batch_id_fkey
  FOREIGN KEY (coverage_waived_batch_id) REFERENCES public.coverage_waive_batches (id)
  ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.registrations
  DROP CONSTRAINT IF EXISTS registrations_batch_id_implies_pre_omlify;

ALTER TABLE public.registrations
  ADD CONSTRAINT registrations_batch_id_implies_pre_omlify
  CHECK (
    coverage_waived_batch_id IS NULL
    OR (
      coverage_status = 'waived'::public.registration_coverage_status
      AND coverage_waived_reason = 'pre_omlify'
    )
  );

COMMENT ON COLUMN public.registrations.coverage_waived_batch_id IS
  'Sammel-Erlass-Batch (A8). NULL bei Einzel-Erlass. Nur bei waived/pre_omlify gesetzt.';

CREATE INDEX registrations_coverage_waived_batch_id_idx
  ON public.registrations (coverage_waived_batch_id)
  WHERE coverage_waived_batch_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Interne Helfer (waive / revert)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.waive_coverage_internal(
  p_registration_id uuid,
  p_member_id uuid,
  p_reason text,
  p_note text,
  p_batch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row public.registrations%ROWTYPE;
  v_note text;
  v_event_id uuid;
BEGIN
  SELECT *
    INTO v_row
  FROM public.registrations
  WHERE id = p_registration_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_row.coverage_status IS DISTINCT FROM 'open'::public.registration_coverage_status THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error', 'NOT_OPEN',
      'coverage_status', v_row.coverage_status::text
    );
  END IF;

  IF p_reason IS NULL OR p_reason NOT IN ('pre_omlify', 'goodwill', 'other') THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_REASON');
  END IF;

  v_note := NULLIF(pg_catalog.btrim(p_note), '');
  IF p_reason = 'other' AND (v_note IS NULL OR pg_catalog.length(v_note) < 3) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOTE_REQUIRED');
  END IF;

  IF p_batch_id IS NOT NULL AND p_reason IS DISTINCT FROM 'pre_omlify' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_REASON');
  END IF;

  UPDATE public.registrations
  SET
    coverage_status = 'waived'::public.registration_coverage_status,
    coverage_waived_reason = p_reason,
    coverage_waived_note = v_note,
    coverage_waived_by = p_member_id,
    coverage_waived_at = pg_catalog.now(),
    coverage_waived_batch_id = p_batch_id
  WHERE id = p_registration_id;

  v_event_id := yogaflow_private.insert_event(
    v_row.tenant_id,
    'coverage.waived',
    'registration',
    p_registration_id,
    pg_catalog.jsonb_build_object(
      'registration_id', p_registration_id,
      'reason', p_reason,
      'price_cents_at_booking', v_row.price_cents_at_booking
    ),
    pg_catalog.gen_random_uuid()
  );

  PERFORM yogaflow_private.insert_audit(
    v_row.tenant_id,
    p_member_id,
    'coverage.waived',
    'registrations',
    p_registration_id,
    ARRAY[
      'coverage_status',
      'coverage_waived_reason',
      'coverage_waived_note',
      'coverage_waived_by',
      'coverage_waived_at',
      'coverage_waived_batch_id'
    ]::text[],
    v_event_id
  );

  RETURN pg_catalog.jsonb_build_object('success', true, 'coverage_status', 'waived');
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.waive_coverage_internal(uuid, uuid, text, text, uuid) IS
  'Interner Erlass: Update, Event coverage.waived, Audit. Keine Rechteprüfung. Optional Batch-ID.';

REVOKE ALL ON FUNCTION yogaflow_private.waive_coverage_internal(uuid, uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION yogaflow_private.revert_coverage_waived_internal(
  p_registration_id uuid,
  p_member_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row public.registrations%ROWTYPE;
  v_event_id uuid;
BEGIN
  SELECT *
    INTO v_row
  FROM public.registrations
  WHERE id = p_registration_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_row.coverage_status IS DISTINCT FROM 'waived'::public.registration_coverage_status THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error', 'NOT_WAIVED',
      'coverage_status', v_row.coverage_status::text
    );
  END IF;

  UPDATE public.registrations
  SET
    coverage_status = 'open'::public.registration_coverage_status,
    coverage_waived_reason = NULL,
    coverage_waived_note = NULL,
    coverage_waived_by = NULL,
    coverage_waived_at = NULL,
    coverage_waived_batch_id = NULL
  WHERE id = p_registration_id;

  v_event_id := yogaflow_private.insert_event(
    v_row.tenant_id,
    'coverage.waive_reverted',
    'registration',
    p_registration_id,
    pg_catalog.jsonb_build_object(
      'registration_id', p_registration_id,
      'reason', v_row.coverage_waived_reason,
      'price_cents_at_booking', v_row.price_cents_at_booking
    ),
    pg_catalog.gen_random_uuid()
  );

  PERFORM yogaflow_private.insert_audit(
    v_row.tenant_id,
    p_member_id,
    'coverage.waive_reverted',
    'registrations',
    p_registration_id,
    ARRAY[
      'coverage_status',
      'coverage_waived_reason',
      'coverage_waived_note',
      'coverage_waived_by',
      'coverage_waived_at',
      'coverage_waived_batch_id'
    ]::text[],
    v_event_id
  );

  RETURN pg_catalog.jsonb_build_object('success', true, 'coverage_status', 'open');
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.revert_coverage_waived_internal(uuid, uuid) IS
  'Interne Rücknahme eines Erlasses inkl. coverage_waived_batch_id. Keine Rechteprüfung.';

REVOKE ALL ON FUNCTION yogaflow_private.revert_coverage_waived_internal(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. set_coverage_waived / revert_coverage_waived (Verhalten unverändert + batch NULL)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_coverage_waived(
  p_registration_id uuid,
  p_reason text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid;
  v_tenant_id uuid;
  v_row public.registrations%ROWTYPE;
BEGIN
  v_member_id := yogaflow_private.get_my_member_id();
  IF NOT yogaflow_private.is_tenant_manager() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT *
    INTO v_row
  FROM public.registrations
  WHERE id = p_registration_id
  FOR UPDATE;

  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF NOT FOUND OR v_row.tenant_id IS DISTINCT FROM v_tenant_id THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  -- Zeile ist gesperrt; Helfer sperrt erneut (gleiche Tx, noop).
  RETURN yogaflow_private.waive_coverage_internal(
    p_registration_id,
    v_member_id,
    p_reason,
    p_note,
    NULL
  );
END;
$function$;

COMMENT ON FUNCTION public.set_coverage_waived(uuid, text, text) IS
  'Erlass einer offenen Buchung. Nur owner/admin. Grund pre_omlify, goodwill oder other; bei other Notiz ≥ 3 Zeichen. Event coverage.waived ohne Notiztext. A8: intern über waive_coverage_internal.';

CREATE OR REPLACE FUNCTION public.revert_coverage_waived(
  p_registration_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid;
  v_tenant_id uuid;
  v_row public.registrations%ROWTYPE;
BEGIN
  v_member_id := yogaflow_private.get_my_member_id();
  IF NOT yogaflow_private.is_tenant_manager() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT *
    INTO v_row
  FROM public.registrations
  WHERE id = p_registration_id
  FOR UPDATE;

  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF NOT FOUND OR v_row.tenant_id IS DISTINCT FROM v_tenant_id THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  RETURN yogaflow_private.revert_coverage_waived_internal(p_registration_id, v_member_id);
END;
$function$;

COMMENT ON FUNCTION public.revert_coverage_waived(uuid) IS
  'Nimmt einen Erlass zurück (open). Nur owner/admin. Setzt coverage_waived_batch_id auf NULL. Event coverage.waive_reverted.';

REVOKE ALL ON FUNCTION public.set_coverage_waived(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_coverage_waived(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.revert_coverage_waived(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revert_coverage_waived(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. preview_pre_omlify_waive
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.preview_pre_omlify_waive(p_before date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tenant_id uuid;
  v_today date;
  v_cutoff timestamptz;
  v_count integer;
  v_course_count integer;
  v_first date;
  v_last date;
BEGIN
  IF NOT yogaflow_private.is_tenant_manager() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF p_before IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_DATE');
  END IF;

  v_today := (pg_catalog.now() AT TIME ZONE 'Europe/Berlin')::date;
  IF p_before > v_today THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'DATE_IN_FUTURE');
  END IF;

  v_cutoff := p_before::timestamp AT TIME ZONE 'Europe/Berlin';

  SELECT
    count(*)::integer,
    count(DISTINCT r.course_id)::integer,
    min(c.date),
    max(c.date)
  INTO v_count, v_course_count, v_first, v_last
  FROM public.registrations r
  JOIN public.courses c ON c.id = r.course_id
  WHERE r.tenant_id = v_tenant_id
    AND r.status = 'registered'::public.registration_status
    AND r.coverage_status = 'open'::public.registration_coverage_status
    AND (c.date + COALESCE(c.time, TIME '00:00')) AT TIME ZONE 'Europe/Berlin' < v_cutoff
    AND (c.date + COALESCE(c.time, TIME '00:00')) AT TIME ZONE 'Europe/Berlin' < pg_catalog.now();

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'count', v_count,
    'course_count', v_course_count,
    'first_course_date', v_first,
    'last_course_date', v_last,
    'limit', 1000
  );
END;
$function$;

COMMENT ON FUNCTION public.preview_pre_omlify_waive(date) IS
  'Vorschau Sammel-Erlass vor Omlify. Nur Owner/Admin. Filter S2.';

REVOKE ALL ON FUNCTION public.preview_pre_omlify_waive(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_pre_omlify_waive(date) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. waive_pre_omlify_before
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.waive_pre_omlify_before(
  p_before date,
  p_expected_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid;
  v_tenant_id uuid;
  v_today date;
  v_cutoff timestamptz;
  v_count integer;
  v_batch_id uuid;
  v_id uuid;
  v_result jsonb;
  v_event_id uuid;
  v_ids uuid[];
BEGIN
  v_member_id := yogaflow_private.get_my_member_id();
  IF NOT yogaflow_private.is_tenant_manager() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_tenant_id IS NULL OR v_member_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF p_before IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_DATE');
  END IF;

  v_today := (pg_catalog.now() AT TIME ZONE 'Europe/Berlin')::date;
  IF p_before > v_today THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'DATE_IN_FUTURE');
  END IF;

  v_cutoff := p_before::timestamp AT TIME ZONE 'Europe/Berlin';

  SELECT coalesce(array_agg(locked.id ORDER BY locked.id), ARRAY[]::uuid[])
    INTO v_ids
  FROM (
    SELECT r.id
    FROM public.registrations r
    JOIN public.courses c ON c.id = r.course_id
    WHERE r.tenant_id = v_tenant_id
      AND r.status = 'registered'::public.registration_status
      AND r.coverage_status = 'open'::public.registration_coverage_status
      AND (c.date + COALESCE(c.time, TIME '00:00')) AT TIME ZONE 'Europe/Berlin' < v_cutoff
      AND (c.date + COALESCE(c.time, TIME '00:00')) AT TIME ZONE 'Europe/Berlin' < pg_catalog.now()
    ORDER BY r.id
    FOR UPDATE OF r
  ) locked;

  v_count := coalesce(pg_catalog.array_length(v_ids, 1), 0);

  IF v_count IS DISTINCT FROM p_expected_count THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error', 'COUNT_CHANGED',
      'count', v_count
    );
  END IF;

  IF v_count = 0 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOTHING_TO_WAIVE');
  END IF;

  IF v_count > 1000 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'TOO_MANY', 'count', v_count);
  END IF;

  INSERT INTO public.coverage_waive_batches (
    tenant_id, before_date, waived_count, created_by
  ) VALUES (
    v_tenant_id, p_before, v_count, v_member_id
  )
  RETURNING id INTO v_batch_id;

  FOREACH v_id IN ARRAY v_ids
  LOOP
    v_result := yogaflow_private.waive_coverage_internal(
      v_id,
      v_member_id,
      'pre_omlify',
      NULL,
      v_batch_id
    );
    IF v_result->>'success' IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'A8 bulk waive failed for %: %', v_id, v_result->>'error';
    END IF;
  END LOOP;

  v_event_id := yogaflow_private.insert_event(
    v_tenant_id,
    'coverage.batch_waived',
    'coverage_waive_batch',
    v_batch_id,
    pg_catalog.jsonb_build_object(
      'batch_id', v_batch_id,
      'before_date', p_before,
      'count', v_count
    ),
    pg_catalog.gen_random_uuid()
  );

  PERFORM yogaflow_private.insert_audit(
    v_tenant_id,
    v_member_id,
    'coverage.batch_waived',
    'coverage_waive_batches',
    v_batch_id,
    ARRAY['before_date', 'waived_count']::text[],
    v_event_id
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'waived', v_count
  );
END;
$function$;

COMMENT ON FUNCTION public.waive_pre_omlify_before(date, integer) IS
  'Atomarer Sammel-Erlass vor Omlify. Nur Owner/Admin. Max 1000. Event je Buchung + coverage.batch_waived.';

REVOKE ALL ON FUNCTION public.waive_pre_omlify_before(date, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.waive_pre_omlify_before(date, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. revert_pre_omlify_batch
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.revert_pre_omlify_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid;
  v_tenant_id uuid;
  v_batch public.coverage_waive_batches%ROWTYPE;
  v_ids uuid[];
  v_id uuid;
  v_result jsonb;
  v_reverted integer := 0;
  v_skipped integer := 0;
  v_event_id uuid;
BEGIN
  v_member_id := yogaflow_private.get_my_member_id();
  IF NOT yogaflow_private.is_tenant_manager() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_tenant_id IS NULL OR v_member_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT *
    INTO v_batch
  FROM public.coverage_waive_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND OR v_batch.tenant_id IS DISTINCT FROM v_tenant_id THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  SELECT coalesce(array_agg(locked.id ORDER BY locked.id), ARRAY[]::uuid[])
    INTO v_ids
  FROM (
    SELECT r.id
    FROM public.registrations r
    WHERE r.coverage_waived_batch_id = p_batch_id
      AND r.coverage_status = 'waived'::public.registration_coverage_status
      AND r.tenant_id = v_tenant_id
    ORDER BY r.id
    FOR UPDATE OF r
  ) locked;

  -- skipped: ursprünglich im Batch, inzwischen einzeln geändert / nicht mehr waived
  v_skipped := v_batch.waived_count - coalesce(pg_catalog.array_length(v_ids, 1), 0);

  FOREACH v_id IN ARRAY coalesce(v_ids, ARRAY[]::uuid[])
  LOOP
    v_result := yogaflow_private.revert_coverage_waived_internal(v_id, v_member_id);
    IF v_result->>'success' = 'true' THEN
      v_reverted := v_reverted + 1;
    END IF;
  END LOOP;

  IF v_reverted > 0 THEN
    v_event_id := yogaflow_private.insert_event(
      v_tenant_id,
      'coverage.batch_waive_reverted',
      'coverage_waive_batch',
      p_batch_id,
      pg_catalog.jsonb_build_object(
        'batch_id', p_batch_id,
        'reverted', v_reverted,
        'skipped', v_skipped
      ),
      pg_catalog.gen_random_uuid()
    );

    PERFORM yogaflow_private.insert_audit(
      v_tenant_id,
      v_member_id,
      'coverage.batch_waive_reverted',
      'coverage_waive_batches',
      p_batch_id,
      ARRAY['reverted', 'skipped']::text[],
      v_event_id
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'reverted', v_reverted,
    'skipped', v_skipped
  );
END;
$function$;

COMMENT ON FUNCTION public.revert_pre_omlify_batch(uuid) IS
  'Nimmt einen Sammel-Erlass zurück. Nur noch waived+batch_id. Idempotent (reverted 0).';

REVOKE ALL ON FUNCTION public.revert_pre_omlify_batch(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revert_pre_omlify_batch(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. get_pre_omlify_batches
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_pre_omlify_batches()
RETURNS TABLE (
  id uuid,
  before_date date,
  created_at timestamptz,
  waived_count integer,
  still_waived_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF NOT yogaflow_private.is_tenant_manager() THEN
    RETURN;
  END IF;

  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    b.id,
    b.before_date,
    b.created_at,
    b.waived_count,
    (
      SELECT count(*)::integer
      FROM public.registrations r
      WHERE r.coverage_waived_batch_id = b.id
        AND r.coverage_status = 'waived'::public.registration_coverage_status
    ) AS still_waived_count
  FROM public.coverage_waive_batches b
  WHERE b.tenant_id = v_tenant_id
  ORDER BY b.created_at DESC;
END;
$function$;

COMMENT ON FUNCTION public.get_pre_omlify_batches() IS
  'Verlauf Sammel-Erlasse des Studios. Nur Owner/Admin. Neueste zuerst.';

REVOKE ALL ON FUNCTION public.get_pre_omlify_batches() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pre_omlify_batches() TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. get_open_coverage
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_open_coverage()
RETURNS TABLE (
  registration_id uuid,
  course_id uuid,
  course_title text,
  course_starts_at timestamptz,
  user_id uuid,
  display_name text,
  price_cents_at_booking integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF NOT yogaflow_private.is_tenant_manager() THEN
    RAISE EXCEPTION 'FORBIDDEN'
      USING ERRCODE = '42501';
  END IF;

  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    c.id,
    c.title,
    (c.date + COALESCE(c.time, TIME '00:00')) AT TIME ZONE 'Europe/Berlin',
    u.id,
    NULLIF(pg_catalog.btrim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''),
    r.price_cents_at_booking
  FROM public.registrations r
  JOIN public.courses c ON c.id = r.course_id
  JOIN public.users u ON u.id = r.user_id
  WHERE r.tenant_id = v_tenant_id
    AND r.status = 'registered'::public.registration_status
    AND r.coverage_status = 'open'::public.registration_coverage_status
    AND (c.date + COALESCE(c.time, TIME '00:00')) AT TIME ZONE 'Europe/Berlin' < pg_catalog.now()
  ORDER BY
    COALESCE(u.last_name, ''),
    COALESCE(u.first_name, ''),
    (c.date + COALESCE(c.time, TIME '00:00')) AT TIME ZONE 'Europe/Berlin'
  LIMIT 2000;
END;
$function$;

COMMENT ON FUNCTION public.get_open_coverage() IS
  'Offene Deckung vergangener Kurse (S2/S3). Nur Owner/Admin. Keine Studio-Summe. Limit 2000.';

REVOKE ALL ON FUNCTION public.get_open_coverage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_open_coverage() TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. get_course_member_passes
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_course_member_passes(p_course_id uuid)
RETURNS TABLE (
  user_id uuid,
  pass_id uuid,
  name text,
  remaining integer,
  units_total integer,
  valid_until date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_tenant_id uuid;
  v_course public.courses%ROWTYPE;
  v_today date;
BEGIN
  v_actor := yogaflow_private.get_my_member_id();
  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_actor IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_course
  FROM public.courses
  WHERE id = p_course_id;

  IF NOT FOUND OR v_course.tenant_id IS DISTINCT FROM v_tenant_id THEN
    RAISE EXCEPTION 'FORBIDDEN'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (
    yogaflow_private.is_tenant_manager()
    OR yogaflow_private.is_course_teacher(p_course_id)
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN'
      USING ERRCODE = '42501';
  END IF;

  v_today := (pg_catalog.now() AT TIME ZONE 'Europe/Berlin')::date;

  RETURN QUERY
  SELECT
    r.user_id,
    p.id,
    p.name,
    yogaflow_private.pass_remaining(p.id),
    p.units_total,
    p.valid_until
  FROM public.registrations r
  JOIN public.passes p
    ON p.member_id = r.user_id
   AND p.tenant_id = v_tenant_id
   AND p.status = 'active'
   AND p.valid_until >= v_today
  WHERE r.course_id = p_course_id
    AND r.tenant_id = v_tenant_id
    AND r.status IN (
      'registered'::public.registration_status,
      'waitlist'::public.registration_status
    )
  ORDER BY r.user_id, p.valid_until ASC, p.created_at ASC;
END;
$function$;

COMMENT ON FUNCTION public.get_course_member_passes(uuid) IS
  'Aktive Karten aller Angemeldeten eines Kurses. Owner/Admin oder Kursleitung. Felder wie get_member_passes + user_id.';

REVOKE ALL ON FUNCTION public.get_course_member_passes(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_course_member_passes(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 11. delete_tenant_complete (A7-1 + coverage_waive_batches nach registrations)
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
    SET CONSTRAINTS public.registrations_pass_id_fkey DEFERRED;
    SET CONSTRAINTS public.coverage_waive_batches_tenant_id_fkey DEFERRED;
    SET CONSTRAINTS public.registrations_coverage_waived_batch_id_fkey DEFERRED;

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
    DELETE FROM public.coverage_waive_batches WHERE tenant_id = p_tenant_id;
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
  'Löscht einen Mandanten: … payments, registrations, coverage_waive_batches, courses, … A8-1 Batches nach registrations. Nur postgres/service_role.';

REVOKE ALL ON FUNCTION public.delete_tenant_complete(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tenant_complete(uuid)
  TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- 12. Selbstprüfung (statisch)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_def text;
  v_oid oid;
BEGIN
  IF to_regclass('public.coverage_waive_batches') IS NULL THEN
    RAISE EXCEPTION 'A8-1: coverage_waive_batches fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'registrations'
      AND column_name = 'coverage_waived_batch_id'
  ) THEN
    RAISE EXCEPTION 'A8-1: coverage_waived_batch_id fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registrations_batch_id_implies_pre_omlify'
  ) THEN
    RAISE EXCEPTION 'A8-1: CHECK batch_id implies pre_omlify fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'coverage_waive_batches_tenant_id_fkey'
      AND pg_get_constraintdef(oid) ILIKE '%DEFERRABLE%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registrations_coverage_waived_batch_id_fkey'
      AND pg_get_constraintdef(oid) ILIKE '%DEFERRABLE%'
  ) THEN
    RAISE EXCEPTION 'A8-1: FKs nicht DEFERRABLE';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'coverage_waive_batches_append_only'
  ) THEN
    RAISE EXCEPTION 'A8-1: Append-only-Trigger fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'coverage_waive_batches'
      AND policyname = 'coverage_waive_batches_select_managers'
  ) THEN
    RAISE EXCEPTION 'A8-1: RLS-Policy fehlt';
  END IF;

  IF has_table_privilege('authenticated', 'public.coverage_waive_batches', 'INSERT')
     OR has_table_privilege('authenticated', 'public.coverage_waive_batches', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.coverage_waive_batches', 'DELETE')
  THEN
    RAISE EXCEPTION 'A8-1: authenticated hat Schreibrecht auf coverage_waive_batches';
  END IF;

  FOREACH v_def IN ARRAY ARRAY[
    'public.preview_pre_omlify_waive(date)',
    'public.waive_pre_omlify_before(date,integer)',
    'public.revert_pre_omlify_batch(uuid)',
    'public.get_pre_omlify_batches()',
    'public.get_open_coverage()',
    'public.get_course_member_passes(uuid)',
    'public.set_coverage_waived(uuid,text,text)',
    'public.revert_coverage_waived(uuid)'
  ]
  LOOP
    SELECT p.oid INTO v_oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.oid = v_def::regprocedure;

    IF v_oid IS NULL OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) THEN
      RAISE EXCEPTION 'A8-1: % fehlt oder nicht SECURITY DEFINER', v_def;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_options_to_table((SELECT proconfig FROM pg_proc WHERE oid = v_oid))
      WHERE option_name = 'search_path' AND option_value = '""'
    ) THEN
      RAISE EXCEPTION 'A8-1: % search_path nicht leer', v_def;
    END IF;

    IF has_function_privilege('anon', v_def, 'EXECUTE') THEN
      RAISE EXCEPTION 'A8-1: anon hat EXECUTE auf %', v_def;
    END IF;

    IF NOT has_function_privilege('authenticated', v_def, 'EXECUTE') THEN
      RAISE EXCEPTION 'A8-1: authenticated braucht EXECUTE auf %', v_def;
    END IF;
  END LOOP;

  SELECT pg_get_functiondef('public.delete_tenant_complete(uuid)'::regprocedure)
    INTO v_def;
  IF v_def NOT ILIKE '%coverage_waive_batches%' THEN
    RAISE EXCEPTION 'A8-1: delete_tenant_complete ohne coverage_waive_batches';
  END IF;
  IF position('DELETE FROM public.registrations' in v_def)
       > position('DELETE FROM public.coverage_waive_batches' in v_def)
  THEN
    RAISE EXCEPTION 'A8-1: coverage_waive_batches muss nach registrations gelöscht werden';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'yogaflow_private'
      AND p.proname = 'waive_coverage_internal'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'yogaflow_private'
      AND p.proname = 'revert_coverage_waived_internal'
  ) THEN
    RAISE EXCEPTION 'A8-1: interne Helfer fehlen';
  END IF;
END $$;
