-- A2 Schritt 3 — Erlass einer offenen Buchung (E15, W1–W4).
--
-- Zweck: owner und admin markieren eine Buchung mit coverage_status = open
-- als erlassen, mit Pflichtgrund. Lehrende und Teilnehmende können das nicht.
-- Ein Erlass erzeugt keine Buchungszeile im späteren Hauptbuch (A7), nur
-- Event und Audit. Sammelaktion „erledigt vor Omlify“ kommt mit A8 (W4).
--
-- Bezug: A2, E15, W1–W4, A2-5.
-- W1: coverage_waived_reason ∈ pre_omlify, goodwill, other. Bei other ist
--     eine Notiz Pflicht (mindestens 3 Zeichen nach Trim).
-- W2: Rücknahme über revert_coverage_waived(uuid), nur owner/admin, mit Audit, ohne Notiz.
-- W3: nur coverage_status = open. Buchungsstatus (aktiv/storniert) egal.
-- W4: keine Sammelaktion in diesem Schritt.
--
-- Notiz: bleibt auf registrations.coverage_waived_note.
-- Grund ist Art. 17: Freitext gehört nicht in das append-only audit_log.
-- events.payload bekommt registration_id, reason und price_cents_at_booking,
-- nicht die Notiz. changed_fields nennt die Spalte, kopiert den Text nicht.
-- Die Rücknahme setzt die vier Erlass-Felder auf NULL und hat keine Notiz.
-- Der alte Grund-Code steht im Payload von coverage.waive_reverted; die
-- Audit-Zeile zeigt über event_id darauf.
--
-- Rückweg (ausführbar; diese Zeilen sind Kommentar und laufen hier nicht).
-- Events und Audit-Zeilen bleiben (append-only):
--
-- DROP FUNCTION IF EXISTS public.revert_coverage_waived(uuid);
-- DROP FUNCTION IF EXISTS public.set_coverage_waived(uuid, text, text);
-- ALTER TABLE public.registrations
--   DROP CONSTRAINT IF EXISTS registrations_waived_other_needs_note,
--   DROP CONSTRAINT IF EXISTS registrations_waived_fields_iff_waived,
--   DROP CONSTRAINT IF EXISTS registrations_waived_reason_valid,
--   DROP CONSTRAINT IF EXISTS registrations_coverage_waived_by_fkey,
--   DROP COLUMN IF EXISTS coverage_waived_at,
--   DROP COLUMN IF EXISTS coverage_waived_by,
--   DROP COLUMN IF EXISTS coverage_waived_note,
--   DROP COLUMN IF EXISTS coverage_waived_reason;

-- ---------------------------------------------------------------------------
-- 1. Spalten und Checks
-- ---------------------------------------------------------------------------

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS coverage_waived_reason text,
  ADD COLUMN IF NOT EXISTS coverage_waived_note text,
  ADD COLUMN IF NOT EXISTS coverage_waived_by uuid,
  ADD COLUMN IF NOT EXISTS coverage_waived_at timestamptz;

ALTER TABLE public.registrations
  DROP CONSTRAINT IF EXISTS registrations_coverage_waived_by_fkey;

ALTER TABLE public.registrations
  ADD CONSTRAINT registrations_coverage_waived_by_fkey
  FOREIGN KEY (coverage_waived_by) REFERENCES public.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.registrations.coverage_waived_reason IS
  'Erlass-Grund: pre_omlify, goodwill oder other. NULL, solange die Buchung nicht waived ist.';
COMMENT ON COLUMN public.registrations.coverage_waived_note IS
  'Notiz zum Erlass. Pflicht bei other (mindestens 3 Zeichen). Kann persönliche Umstände enthalten. Nicht im Event-Payload.';
COMMENT ON COLUMN public.registrations.coverage_waived_by IS
  'Profil (users.id), das den Erlass gesetzt hat. NULL nach Löschen des Profils.';
COMMENT ON COLUMN public.registrations.coverage_waived_at IS
  'Zeitpunkt des Erlasses. NULL, solange die Buchung nicht waived ist.';

ALTER TABLE public.registrations
  DROP CONSTRAINT IF EXISTS registrations_waived_reason_valid,
  DROP CONSTRAINT IF EXISTS registrations_waived_fields_iff_waived,
  DROP CONSTRAINT IF EXISTS registrations_waived_other_needs_note;

ALTER TABLE public.registrations
  ADD CONSTRAINT registrations_waived_reason_valid
    CHECK (
      coverage_waived_reason IS NULL
      OR coverage_waived_reason IN ('pre_omlify', 'goodwill', 'other')
    ),
  ADD CONSTRAINT registrations_waived_fields_iff_waived
    CHECK (
      (coverage_status = 'waived') = (coverage_waived_reason IS NOT NULL)
      AND (coverage_status = 'waived') = (coverage_waived_at IS NOT NULL)
    ),
  ADD CONSTRAINT registrations_waived_other_needs_note
    CHECK (
      coverage_waived_reason IS DISTINCT FROM 'other'
      OR pg_catalog.length(pg_catalog.btrim(coverage_waived_note)) >= 3
    );

-- ---------------------------------------------------------------------------
-- 2. set_coverage_waived
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
  v_note text;
  v_event_id uuid;
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
  -- Fehlende Zeile und fremdes Studio: dieselbe Meldung, kein Hinweis auf die ID.
  IF NOT FOUND OR v_row.tenant_id IS DISTINCT FROM v_tenant_id THEN
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

  UPDATE public.registrations
  SET
    coverage_status = 'waived'::public.registration_coverage_status,
    coverage_waived_reason = p_reason,
    coverage_waived_note = v_note,
    coverage_waived_by = v_member_id,
    coverage_waived_at = pg_catalog.now()
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
    v_member_id,
    'coverage.waived',
    'registrations',
    p_registration_id,
    ARRAY[
      'coverage_status',
      'coverage_waived_reason',
      'coverage_waived_note',
      'coverage_waived_by',
      'coverage_waived_at'
    ]::text[],
    v_event_id
  );

  RETURN pg_catalog.jsonb_build_object('success', true, 'coverage_status', 'waived');
END;
$function$;

COMMENT ON FUNCTION public.set_coverage_waived(uuid, text, text) IS
  'Erlass einer offenen Buchung. Nur owner/admin (is_tenant_manager). Grund pre_omlify, goodwill oder other; bei other Notiz mit mindestens 3 Zeichen. Event coverage.waived ohne Notiztext.';

-- ---------------------------------------------------------------------------
-- 3. revert_coverage_waived
-- ---------------------------------------------------------------------------

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
  v_event_id uuid;
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
    coverage_waived_at = NULL
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
    v_member_id,
    'coverage.waive_reverted',
    'registrations',
    p_registration_id,
    ARRAY[
      'coverage_status',
      'coverage_waived_reason',
      'coverage_waived_note',
      'coverage_waived_by',
      'coverage_waived_at'
    ]::text[],
    v_event_id
  );

  RETURN pg_catalog.jsonb_build_object('success', true, 'coverage_status', 'open');
END;
$function$;

COMMENT ON FUNCTION public.revert_coverage_waived(uuid) IS
  'Nimmt einen Erlass zurück und setzt die Deckung auf open. Nur owner/admin, ohne Notiz. Event coverage.waive_reverted trägt den alten Grund-Code.';

REVOKE ALL ON FUNCTION public.set_coverage_waived(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_coverage_waived(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.revert_coverage_waived(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revert_coverage_waived(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Selbstprüfung
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_bad bigint;
  v_columns integer;
  v_checks integer;
  v_set_oid oid;
  v_revert_oid oid;
  v_set_definer boolean;
  v_revert_definer boolean;
BEGIN
  SELECT count(*)
    INTO v_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'registrations'
    AND column_name IN (
      'coverage_waived_reason',
      'coverage_waived_note',
      'coverage_waived_by',
      'coverage_waived_at'
    );

  IF v_columns <> 4 THEN
    RAISE EXCEPTION 'A2 Erlass: % von 4 Erlass-Spalten vorhanden', v_columns;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registrations_coverage_waived_by_fkey'
      AND conrelid = 'public.registrations'::regclass
      AND pg_get_constraintdef(oid) ILIKE '%ON DELETE SET NULL%'
  ) THEN
    RAISE EXCEPTION 'A2 Erlass: FK coverage_waived_by ON DELETE SET NULL fehlt';
  END IF;

  SELECT count(*)
    INTO v_checks
  FROM pg_constraint
  WHERE conrelid = 'public.registrations'::regclass
    AND contype = 'c'
    AND conname IN (
      'registrations_waived_reason_valid',
      'registrations_waived_fields_iff_waived',
      'registrations_waived_other_needs_note'
    );

  IF v_checks <> 3 THEN
    RAISE EXCEPTION 'A2 Erlass: % von 3 CHECKs vorhanden', v_checks;
  END IF;

  SELECT count(*)
    INTO v_bad
  FROM public.registrations
  WHERE (
    (
      coverage_waived_reason IS NULL
      OR coverage_waived_reason IN ('pre_omlify', 'goodwill', 'other')
    )
    AND ((coverage_status = 'waived') = (coverage_waived_reason IS NOT NULL))
    AND ((coverage_status = 'waived') = (coverage_waived_at IS NOT NULL))
    AND (
      coverage_waived_reason IS DISTINCT FROM 'other'
      OR length(btrim(coverage_waived_note)) >= 3
    )
  ) IS NOT TRUE;

  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'A2 Erlass: % Zeilen verletzen die neuen CHECKs', v_bad;
  END IF;

  SELECT p.oid, p.prosecdef
    INTO v_set_oid, v_set_definer
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'set_coverage_waived'
    AND pg_get_function_identity_arguments(p.oid) = 'p_registration_id uuid, p_reason text, p_note text';

  SELECT p.oid, p.prosecdef
    INTO v_revert_oid, v_revert_definer
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'revert_coverage_waived'
    AND pg_get_function_identity_arguments(p.oid) = 'p_registration_id uuid';

  IF v_set_oid IS NULL OR NOT v_set_definer OR v_revert_oid IS NULL OR NOT v_revert_definer THEN
    RAISE EXCEPTION 'A2 Erlass: eine RPC fehlt oder ist nicht SECURITY DEFINER';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_options_to_table((SELECT proconfig FROM pg_proc WHERE oid = v_set_oid))
    WHERE option_name = 'search_path' AND option_value = '""'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_options_to_table((SELECT proconfig FROM pg_proc WHERE oid = v_revert_oid))
    WHERE option_name = 'search_path' AND option_value = '""'
  ) THEN
    RAISE EXCEPTION 'A2 Erlass: search_path einer RPC ist nicht leer';
  END IF;

  IF has_function_privilege('anon', v_set_oid, 'EXECUTE')
     OR has_function_privilege('anon', v_revert_oid, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'A2 Erlass: anon hat EXECUTE auf eine Erlass-RPC';
  END IF;

  IF NOT has_function_privilege('authenticated', v_set_oid, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_revert_oid, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'A2 Erlass: authenticated braucht EXECUTE auf beide Erlass-RPCs';
  END IF;

  IF has_table_privilege('authenticated', 'public.registrations', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.registrations', 'coverage_status', 'UPDATE')
  THEN
    RAISE EXCEPTION 'A2 Erlass: authenticated darf coverage_status nicht direkt ändern';
  END IF;
END $$;
