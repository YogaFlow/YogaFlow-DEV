-- A2 Schritt 1 — Leseschutz registrations (E5 / E15, Vorbereitung A2).
--
-- Zweck: Lehrende sehen Buchungen nur noch für Kurse, die sie selbst leiten,
-- plus die eigenen Buchungen als Teilnehmerin. owner/admin sehen weiter alles
-- im Studio. Keine eigene Tabelle, keine Spalten-Grants (select * in
-- Participants.tsx bleibt gültig). price_cents_at_booking gibt es noch nicht;
-- schützenswert an registrations ist coverage_status in fremden Kursen — die
-- Spalte kommt später, der Leseschutz gilt dann mit.
--
-- Initplan: get_my_tenant_id, get_my_member_id und is_tenant_manager hängen
-- nicht von der Zeile ab. Sie stehen in (SELECT …), damit Postgres sie einmal
-- pro Abfrage auswertet. is_course_teacher(course_id) bleibt zeilenweise,
-- weil der Kurs sich je Zeile unterscheidet.
--
-- Bezug: Entscheidung A2-1.
--
-- Voraussetzung: Stand nach A1 (20260926144500) und nach dem Signup-Hotfix
-- (20260926160500). Auf registrations liegt nur noch die SELECT-Policy
-- registrations_select. Die Selbstprüfung bricht ab, wenn
-- INSERT/UPDATE/DELETE-Policies wieder da sind.
--
-- Rückweg:
--   DROP POLICY IF EXISTS "registrations_select" ON public.registrations;
--   CREATE POLICY "registrations_select"
--     ON public.registrations FOR SELECT
--     TO authenticated
--     USING (
--       (tenant_id = yogaflow_private.get_my_tenant_id())
--       AND (
--         (user_id = (SELECT yogaflow_private.get_my_member_id()))
--         OR yogaflow_private.is_staff()
--       )
--     );
--   DROP FUNCTION IF EXISTS yogaflow_private.is_course_teacher(uuid);

-- ---------------------------------------------------------------------------
-- Hilfsfunktion: bin ich die Lehrende dieses Kurses?
-- SECURITY DEFINER, damit die Policy nicht über die courses-Policy läuft
-- (keine RLS-Rekursion).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.is_course_teacher(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.courses
    WHERE id = p_course_id
      AND teacher_id = yogaflow_private.get_my_member_id()
      AND tenant_id = yogaflow_private.get_my_tenant_id()
  );
$$;

REVOKE ALL ON FUNCTION yogaflow_private.is_course_teacher(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION yogaflow_private.is_course_teacher(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Policy: Studio, und (eigene Zeile oder owner/admin oder Lehrende des Kurses)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "registrations_select" ON public.registrations;
CREATE POLICY "registrations_select"
  ON public.registrations
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT yogaflow_private.get_my_tenant_id())
    AND (
      user_id = (SELECT yogaflow_private.get_my_member_id())
      OR (SELECT yogaflow_private.is_tenant_manager())
      OR yogaflow_private.is_course_teacher(course_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Selbstprüfung
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_select_count integer;
  v_write_count integer;
  v_qual text;
  v_oid oid;
  v_prosecdef boolean;
BEGIN
  SELECT count(*)
    INTO v_select_count
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'registrations'
    AND pol.polcmd = 'r';

  IF v_select_count <> 1 THEN
    RAISE EXCEPTION 'A2: genau eine SELECT-Policy auf registrations erwartet, gefunden %', v_select_count;
  END IF;

  SELECT pg_get_expr(pol.polqual, pol.polrelid)
    INTO v_qual
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'registrations'
    AND pol.polname = 'registrations_select'
    AND pol.polcmd = 'r'
    AND pol.polroles = ARRAY[(SELECT oid FROM pg_roles WHERE rolname = 'authenticated')];

  IF v_qual IS NULL THEN
    RAISE EXCEPTION 'A2: Policy registrations_select (nur authenticated, nur SELECT) fehlt';
  END IF;

  IF v_qual NOT ILIKE '%is_course_teacher%' OR v_qual ILIKE '%is_staff%' THEN
    RAISE EXCEPTION 'A2: registrations_select muss is_course_teacher enthalten und nicht is_staff: %', v_qual;
  END IF;

  SELECT count(*)
    INTO v_write_count
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'registrations'
    AND pol.polcmd IN ('a', 'w', 'd', '*');

  IF v_write_count <> 0 THEN
    RAISE EXCEPTION 'A2: keine INSERT/UPDATE/DELETE-Policy auf registrations erwartet, gefunden %', v_write_count;
  END IF;

  SELECT p.oid, p.prosecdef
    INTO v_oid, v_prosecdef
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'yogaflow_private'
    AND p.proname = 'is_course_teacher'
    AND pg_get_function_identity_arguments(p.oid) = 'p_course_id uuid';

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'A2: yogaflow_private.is_course_teacher(uuid) fehlt';
  END IF;

  IF NOT v_prosecdef THEN
    RAISE EXCEPTION 'A2: is_course_teacher ist nicht SECURITY DEFINER';
  END IF;

  -- SET search_path = '' speichert als option_value die zwei Zeichen "".
  IF NOT EXISTS (
    SELECT 1
    FROM pg_options_to_table((SELECT proconfig FROM pg_proc WHERE oid = v_oid))
    WHERE option_name = 'search_path'
      AND option_value = '""'
  ) THEN
    RAISE EXCEPTION 'A2: is_course_teacher search_path ist nicht leer';
  END IF;

  IF has_function_privilege('anon', 'yogaflow_private.is_course_teacher(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'A2: anon hat EXECUTE auf is_course_teacher';
  END IF;

  IF NOT has_function_privilege('authenticated', 'yogaflow_private.is_course_teacher(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'A2: authenticated braucht EXECUTE auf is_course_teacher';
  END IF;
END $$;
