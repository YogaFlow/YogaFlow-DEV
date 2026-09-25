-- Zweck: Geldkette Story 0.3a — Fundament events und audit_log.
-- Schreibweg nur über yogaflow_private.insert_event / insert_audit
-- (und public.record_service_ping als Beispiellaufruf). Client: nur SELECT
-- für owner/admin (is_tenant_manager). Append-only per Trigger.
--
-- Event-Namen: subjekt.verb_in_vergangenheit, klein, mit Punkt
-- (payment.recorded, pass.purchased). subject_type Singular und klein
-- (registration, payment, pass). Kein Enum, kein CHECK auf type.
-- Sprint A erwartet laut Nachtrag 2026-09-21 (Kommentar, kein Constraint):
--   payment.recorded, payment.reversed, pass.purchased, pass.expired, pass.expiring
-- Plus Smoke-Typ tenant.pinged aus record_service_ping.
--
-- audit_log bewusst ohne before/after: Klartext-Diffs kollidieren mit
-- Art. 15/17 DSGVO und mit Append-only. Ergänzt werden sie erst, wenn eine
-- Story sie braucht, zusammen mit einer Regel, was hineindarf.
--
-- Berechtigungen prüft immer das fachliche RPC, nie das Protokoll. insert_event
-- und insert_audit haben bewusst kein EXECUTE für anon/authenticated und werden
-- nur aus einem RPC heraus gerufen, das die Rolle bereits geprüft hat (z. B.
-- record_payment: owner/admin alle Kurse, teacher nur eigene, E15).
-- record_service_ping ist die Ausnahme: reines Testwerkzeug ohne Fachlogik,
-- deshalb für alle authenticated freigegeben.
--
-- Rückweg (ausführbar; diese Zeilen sind Kommentar und laufen hier nicht):
--
-- DROP FUNCTION IF EXISTS public.record_service_ping(uuid);
-- DROP FUNCTION IF EXISTS yogaflow_private.insert_audit(uuid, uuid, text, text, uuid, text[], uuid);
-- DROP FUNCTION IF EXISTS yogaflow_private.insert_event(uuid, text, text, uuid, jsonb, uuid);
-- DROP TRIGGER IF EXISTS audit_log_append_only ON public.audit_log;
-- DROP TRIGGER IF EXISTS events_append_only ON public.events;
-- DROP FUNCTION IF EXISTS yogaflow_private.enforce_append_only();
-- DROP TABLE IF EXISTS public.audit_log;
-- DROP TABLE IF EXISTS public.events;
--
-- CREATE OR REPLACE FUNCTION public.delete_tenant_complete(p_tenant_id uuid)
-- RETURNS void
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
--     RAISE EXCEPTION 'TENANT_NOT_FOUND: Kein Tenant mit dieser ID.'
--       USING ERRCODE = 'P0002';
--   END IF;
--
--   ALTER TABLE public.users DISABLE TRIGGER prevent_last_owner_delete;
--   BEGIN
--     DELETE FROM public.user_notifications WHERE tenant_id = p_tenant_id;
--     DELETE FROM public.messages WHERE tenant_id = p_tenant_id;
--     DELETE FROM public.registrations WHERE tenant_id = p_tenant_id;
--     DELETE FROM public.courses WHERE tenant_id = p_tenant_id;
--     DELETE FROM public.users WHERE tenant_id = p_tenant_id;
--     DELETE FROM public.tenants WHERE id = p_tenant_id;
--   EXCEPTION WHEN OTHERS THEN
--     ALTER TABLE public.users ENABLE TRIGGER prevent_last_owner_delete;
--     RAISE;
--   END;
--
--   ALTER TABLE public.users ENABLE TRIGGER prevent_last_owner_delete;
-- END;
-- $function$;
--
-- COMMENT ON FUNCTION public.delete_tenant_complete(uuid) IS
--   'Löscht einen Mandanten in fester Reihenfolge: user_notifications, messages, registrations, courses, users, tenants. registrations.course_id und courses.teacher_id sind RESTRICT. prevent_last_owner_delete ist währenddessen pausiert. auth.users separat. Nur postgres/service_role. Jede neue Tabelle mit RESTRICT auf courses/users/tenants muss hier ergänzt werden.';
--
-- REVOKE ALL ON FUNCTION public.delete_tenant_complete(uuid) FROM PUBLIC, anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.delete_tenant_complete(uuid) TO postgres;
-- GRANT EXECUTE ON FUNCTION public.delete_tenant_complete(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 1. Tabellen
-- ---------------------------------------------------------------------------

CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  type text NOT NULL,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  causation_id uuid NOT NULL,
  CONSTRAINT events_tenant_type_subject_causation_key
    UNIQUE (tenant_id, type, subject_id, causation_id)
);

CREATE INDEX events_tenant_occurred_at_idx
  ON public.events (tenant_id, occurred_at DESC);

CREATE INDEX events_tenant_type_occurred_at_idx
  ON public.events (tenant_id, type, occurred_at DESC);

CREATE INDEX events_subject_idx
  ON public.events (subject_type, subject_id);

COMMENT ON TABLE public.events IS
  'Append-only Geschäftsevents. Namen: subjekt.verb_in_vergangenheit. Schreiben nur über yogaflow_private.insert_event.';

CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  actor_member_id uuid NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  action text NOT NULL,
  table_name text NOT NULL,
  row_id uuid NOT NULL,
  changed_fields text[] NOT NULL DEFAULT '{}'::text[],
  at timestamptz NOT NULL DEFAULT now(),
  event_id uuid NULL REFERENCES public.events (id) ON DELETE RESTRICT
);

-- Keine Spalten before/after — Klartext-Diffs kollidieren mit Art. 15/17 und
-- Append-only; erst mit eigener Story und Inhaltsregel ergänzen.

CREATE INDEX audit_log_tenant_at_idx
  ON public.audit_log (tenant_id, at DESC);

CREATE INDEX audit_log_table_row_idx
  ON public.audit_log (table_name, row_id);

CREATE INDEX audit_log_actor_member_id_idx
  ON public.audit_log (actor_member_id);

COMMENT ON TABLE public.audit_log IS
  'Append-only Audit. actor_member_id = Profil-ID (users.id), NULL bei Cron. Ohne before/after. Schreiben nur über yogaflow_private.insert_audit.';

-- ---------------------------------------------------------------------------
-- 2. Append-only-Trigger (SECURITY INVOKER)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.enforce_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- No-Op-UPDATE (NEW ≡ OLD): Zeilensperre aus dem Konfliktweg, keine Mutation.
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;

  IF current_setting('yogaflow.allow_append_only_delete', true) = 'on'
     AND current_user::text NOT IN ('anon', 'authenticated')
  THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'append-only: % auf %.% ist nicht erlaubt',
    TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME;
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.enforce_append_only() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION yogaflow_private.enforce_append_only() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION yogaflow_private.enforce_append_only() TO postgres, service_role;

CREATE TRIGGER events_append_only
  BEFORE UPDATE OR DELETE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.enforce_append_only();

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.enforce_append_only();

-- ---------------------------------------------------------------------------
-- 3. RLS und Tabellenrechte
-- ---------------------------------------------------------------------------

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY events_select_managers
  ON public.events
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = yogaflow_private.get_my_tenant_id()
    AND yogaflow_private.is_tenant_manager()
  );

CREATE POLICY audit_log_select_managers
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = yogaflow_private.get_my_tenant_id()
    AND yogaflow_private.is_tenant_manager()
  );

REVOKE ALL ON TABLE public.events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.events TO authenticated;
GRANT SELECT ON TABLE public.audit_log TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Schreibhelfer (kein Client-EXECUTE)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.insert_event(
  p_tenant_id uuid,
  p_type text,
  p_subject_type text,
  p_subject_id uuid,
  p_payload jsonb,
  p_causation_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.events (
    tenant_id, type, subject_type, subject_id, payload, causation_id
  ) VALUES (
    p_tenant_id,
    p_type,
    p_subject_type,
    p_subject_id,
    COALESCE(p_payload, '{}'::jsonb),
    p_causation_id
  )
  ON CONFLICT (tenant_id, type, subject_id, causation_id)
  DO UPDATE SET type = public.events.type
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION yogaflow_private.insert_audit(
  p_tenant_id uuid,
  p_actor_member_id uuid,
  p_action text,
  p_table_name text,
  p_row_id uuid,
  p_changed_fields text[],
  p_event_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.audit_log (
    tenant_id,
    actor_member_id,
    action,
    table_name,
    row_id,
    changed_fields,
    event_id
  ) VALUES (
    p_tenant_id,
    p_actor_member_id,
    p_action,
    p_table_name,
    p_row_id,
    COALESCE(p_changed_fields, '{}'::text[]),
    p_event_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.insert_event(uuid, text, text, uuid, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION yogaflow_private.insert_audit(uuid, uuid, text, text, uuid, text[], uuid)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Beispiellaufruf record_service_ping
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_service_ping(p_causation_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_member_id uuid;
  v_causation_id uuid;
  v_event_id uuid;
BEGIN
  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'record_service_ping: kein Tenant-Kontext';
  END IF;

  v_member_id := yogaflow_private.get_my_member_id();
  v_causation_id := COALESCE(p_causation_id, gen_random_uuid());

  v_event_id := yogaflow_private.insert_event(
    v_tenant_id,
    'tenant.pinged',
    'tenant',
    v_tenant_id,
    '{}'::jsonb,
    v_causation_id
  );

  -- Audit bei jedem Aufruf; idempotent ist nur events.
  PERFORM yogaflow_private.insert_audit(
    v_tenant_id,
    v_member_id,
    'service_ping',
    'tenants',
    v_tenant_id,
    '{}'::text[],
    v_event_id
  );

  RETURN v_event_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_service_ping(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_service_ping(uuid) TO authenticated;

COMMENT ON FUNCTION public.record_service_ping(uuid) IS
  'Smoke-RPC Story 0.3: schreibt Event tenant.pinged und eine Audit-Zeile. tenant_id nur aus get_my_tenant_id().';

-- ---------------------------------------------------------------------------
-- 6. delete_tenant_complete: audit_log und events zuerst, per Session-Schalter
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
    -- SET LOCAL gilt nur in dieser Transaktion und bleibt danach nicht.
    SET LOCAL yogaflow.allow_append_only_delete = 'on';

    DELETE FROM public.audit_log WHERE tenant_id = p_tenant_id;
    DELETE FROM public.events WHERE tenant_id = p_tenant_id;
    DELETE FROM public.user_notifications WHERE tenant_id = p_tenant_id;
    DELETE FROM public.messages WHERE tenant_id = p_tenant_id;
    DELETE FROM public.registrations WHERE tenant_id = p_tenant_id;
    DELETE FROM public.courses WHERE tenant_id = p_tenant_id;
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
  'Löscht einen Mandanten in fester Reihenfolge: audit_log, events (Append-only per SET LOCAL yogaflow.allow_append_only_delete), user_notifications, messages, registrations, courses, users, tenants. registrations.course_id und courses.teacher_id sind RESTRICT. prevent_last_owner_delete ist währenddessen pausiert. auth.users separat. Nur postgres/service_role. Jede neue Tabelle mit FK auf tenants/users muss hier ergänzt werden.';

REVOKE ALL ON FUNCTION public.delete_tenant_complete(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tenant_complete(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.delete_tenant_complete(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Selbstprüfung
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_tenant_id uuid;
  v_slug text;
  v_event_id uuid;
  v_event_id_2 uuid;
  v_occurred_at timestamptz;
  v_payload jsonb;
  v_count integer;
  v_prosecdef boolean;
  v_def text;
  v_qual text;
  v_priv text;
  v_role text;
  v_ok boolean;
  v_sqlstate text;
  v_msg text;
BEGIN
  -- audit_log hat keine Spalte before oder after
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'audit_log'
      AND column_name IN ('before', 'after')
  ) THEN
    RAISE EXCEPTION 'audit_log darf keine Spalten before/after haben';
  END IF;

  -- anon und authenticated ohne INSERT/UPDATE/DELETE
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH v_priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE'] LOOP
      IF has_table_privilege(v_role, 'public.events', v_priv) THEN
        RAISE EXCEPTION '% hat noch % auf public.events', v_role, v_priv;
      END IF;
      IF has_table_privilege(v_role, 'public.audit_log', v_priv) THEN
        RAISE EXCEPTION '% hat noch % auf public.audit_log', v_role, v_priv;
      END IF;
    END LOOP;
  END LOOP;

  -- Triggerfunktion ist SECURITY INVOKER
  SELECT p.prosecdef
    INTO v_prosecdef
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'yogaflow_private'
    AND p.proname = 'enforce_append_only'
    AND pg_get_function_identity_arguments(p.oid) = '';

  IF v_prosecdef IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'enforce_append_only prosecdef=%, erwartet false (INVOKER)', v_prosecdef;
  END IF;

  -- Policy-Qual enthält is_tenant_manager
  SELECT qual INTO v_qual
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'events'
    AND policyname = 'events_select_managers';
  IF v_qual IS NULL OR v_qual NOT LIKE '%is_tenant_manager%' THEN
    RAISE EXCEPTION 'events_select_managers Qual ohne is_tenant_manager: %', v_qual;
  END IF;

  SELECT qual INTO v_qual
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'audit_log'
    AND policyname = 'audit_log_select_managers';
  IF v_qual IS NULL OR v_qual NOT LIKE '%is_tenant_manager%' THEN
    RAISE EXCEPTION 'audit_log_select_managers Qual ohne is_tenant_manager: %', v_qual;
  END IF;

  -- insert_event enthält kein INTO STRICT
  SELECT pg_get_functiondef(
    'yogaflow_private.insert_event(uuid, text, text, uuid, jsonb, uuid)'::regprocedure
  ) INTO v_def;
  IF v_def ILIKE '%INTO STRICT%' THEN
    RAISE EXCEPTION 'insert_event enthält INTO STRICT';
  END IF;

  -- Wegwerf-Tenant für Mutations- und Idempotenztests
  v_slug := 'zzg03a' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  INSERT INTO public.tenants (name, slug)
  VALUES ('tmp geldkette 03a', v_slug)
  RETURNING id INTO v_tenant_id;

  -- insert_event zweimal: gleiche id, eine Zeile, erste occurred_at/payload bleiben
  v_event_id := yogaflow_private.insert_event(
    v_tenant_id,
    'tenant.pinged',
    'tenant',
    v_tenant_id,
    '{"first":true}'::jsonb,
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid
  );

  SELECT occurred_at, payload
    INTO v_occurred_at, v_payload
  FROM public.events
  WHERE id = v_event_id;

  -- kurze Pause unnötig; Idempotenz prüft Gleichheit, nicht Zeitdifferenz
  v_event_id_2 := yogaflow_private.insert_event(
    v_tenant_id,
    'tenant.pinged',
    'tenant',
    v_tenant_id,
    '{"first":false,"second":true}'::jsonb,
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid
  );

  IF v_event_id_2 IS DISTINCT FROM v_event_id THEN
    RAISE EXCEPTION 'insert_event Idempotenz: ids %, %', v_event_id, v_event_id_2;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.events
  WHERE tenant_id = v_tenant_id
    AND type = 'tenant.pinged'
    AND subject_id = v_tenant_id
    AND causation_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid;

  IF v_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'insert_event Idempotenz: % Zeilen, erwartet 1', v_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.events
    WHERE id = v_event_id
      AND (occurred_at IS DISTINCT FROM v_occurred_at
           OR payload IS DISTINCT FROM v_payload
           OR payload IS DISTINCT FROM '{"first":true}'::jsonb)
  ) THEN
    RAISE EXCEPTION 'insert_event Idempotenz: occurred_at oder payload der ersten Zeile verändert';
  END IF;

  -- UPDATE und DELETE ohne Schalter scheitern mit append-only:
  v_ok := false;
  BEGIN
    UPDATE public.events
       SET payload = '{"mut":true}'::jsonb
     WHERE id = v_event_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    IF v_msg LIKE 'append-only:%' THEN
      v_ok := true;
    ELSE
      RAISE EXCEPTION 'UPDATE ohne Schalter: unerwarteter Fehler % %', v_sqlstate, v_msg;
    END IF;
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'UPDATE ohne Schalter hat nicht mit append-only: abgebrochen';
  END IF;

  v_ok := false;
  BEGIN
    DELETE FROM public.events WHERE id = v_event_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    IF v_msg LIKE 'append-only:%' THEN
      v_ok := true;
    ELSE
      RAISE EXCEPTION 'DELETE ohne Schalter: unerwarteter Fehler % %', v_sqlstate, v_msg;
    END IF;
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'DELETE ohne Schalter hat nicht mit append-only: abgebrochen';
  END IF;

  -- als authenticated MIT Schalter scheitert es ebenfalls.
  -- RLS kurz aus; UPDATE/DELETE kurz gewährt, sonst endet es vor dem Trigger
  -- mit „permission denied for table“ statt „append-only:“.
  ALTER TABLE public.events DISABLE ROW LEVEL SECURITY;
  GRANT UPDATE, DELETE ON TABLE public.events TO authenticated;
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL yogaflow.allow_append_only_delete = 'on';
    UPDATE public.events
       SET payload = '{"mut":true}'::jsonb
     WHERE id = v_event_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    IF v_msg LIKE 'append-only:%' THEN
      v_ok := true;
    ELSE
      RAISE EXCEPTION 'authenticated+Schalter UPDATE: unerwarteter Fehler % %', v_sqlstate, v_msg;
    END IF;
  END;
  RESET ROLE;
  IF NOT v_ok THEN
    REVOKE UPDATE, DELETE ON TABLE public.events FROM authenticated;
    ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
    RAISE EXCEPTION 'authenticated MIT Schalter hat UPDATE nicht mit append-only: abgebrochen';
  END IF;

  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL yogaflow.allow_append_only_delete = 'on';
    DELETE FROM public.events WHERE id = v_event_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    IF v_msg LIKE 'append-only:%' THEN
      v_ok := true;
    ELSE
      RAISE EXCEPTION 'authenticated+Schalter DELETE: unerwarteter Fehler % %', v_sqlstate, v_msg;
    END IF;
  END;
  RESET ROLE;
  REVOKE UPDATE, DELETE ON TABLE public.events FROM authenticated;
  ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'authenticated MIT Schalter hat DELETE nicht mit append-only: abgebrochen';
  END IF;

  -- Wegwerf-Zeilen entfernen (Schalter + Reihenfolge audit vor events vor tenant)
  SET LOCAL yogaflow.allow_append_only_delete = 'on';
  DELETE FROM public.audit_log WHERE tenant_id = v_tenant_id;
  DELETE FROM public.events WHERE tenant_id = v_tenant_id;
  DELETE FROM public.tenants WHERE id = v_tenant_id;
END $$;
