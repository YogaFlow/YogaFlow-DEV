-- A6-1 — Fundament: Stornofrist, Spalten, Einlösen/Zurückbuchen-Helfer.
--
-- Zweck: Studio-Stornofrist an tenants; cancellation_deadline und
-- coverage_intent sowie pass_id an registrations; interne Helfer
-- pick_pass_for_registration / redeem_pass / reverse_redemption;
-- remove_member behält Deckung pass (RESTRICT-Fix).
-- Noch kein öffentlicher Buchungsweg löst ein (A6-2).
--
-- Bezug: A6, Entscheidungen W1–W9 (27.09.2026).
-- W2 Abweichung vom Nachtrag: keine Tabelle tenant_booking_settings mit
--     valid_from. Frist als tenants.cancellation_window_hours (0–72,
--     Default 24); Historie über eingefrorenes cancellation_deadline.
-- W9: Karte am Kurstag gültig (valid_until >= Kursdatum), aktiv, Rest ≥ 1;
--     frühestes valid_until, bei Gleichstand ältester Kauf (created_at).
--
-- Event-Namen neu: pass.redeemed, pass.redeem_reversed (kein Ledger, A7).
-- Schalter yogaflow.allow_pass_coverage für UPDATE von pass_id
-- (Muster allow_pass_change).
--
-- Rückweg (ausführbar; diese Zeilen sind Kommentar und laufen hier nicht):
--
-- DROP FUNCTION IF EXISTS yogaflow_private.reverse_redemption(uuid, uuid, text);
-- DROP FUNCTION IF EXISTS yogaflow_private.redeem_pass(uuid, uuid, uuid);
-- DROP FUNCTION IF EXISTS yogaflow_private.pick_pass_for_registration(uuid, uuid);
--
-- CREATE OR REPLACE FUNCTION public.remove_member(p_member_id uuid)
-- RETURNS jsonb
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = ''
-- AS $function$
-- DECLARE
--   v_actor uuid;
--   v_tenant uuid;
--   v_target public.users%ROWTYPE;
--   v_upcoming integer;
--   v_cancelled integer := 0;
--   v_deleted_regs integer := 0;
--   v_money boolean;
--   v_mode text;
--   v_old_auth uuid;
--   v_remaining integer;
--   v_event_id uuid;
--   v_fields text[];
-- BEGIN
--   v_actor := yogaflow_private.get_my_member_id();
--   IF NOT yogaflow_private.is_tenant_manager() THEN
--     RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
--   END IF;
--   v_tenant := yogaflow_private.get_my_tenant_id();
--   SELECT * INTO v_target FROM public.users WHERE id = p_member_id;
--   IF NOT FOUND OR v_target.tenant_id IS DISTINCT FROM v_tenant THEN
--     RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
--   END IF;
--   IF v_target.id = v_actor THEN
--     RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'CANNOT_REMOVE_SELF');
--   END IF;
--   IF v_target.role = 'owner' THEN
--     RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'OWNER_NOT_REMOVABLE');
--   END IF;
--   IF v_target.anonymized_at IS NOT NULL THEN
--     RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ALREADY_REMOVED');
--   END IF;
--   SELECT count(*)::integer INTO v_upcoming
--   FROM public.courses c
--   WHERE c.teacher_id = v_target.id
--     AND c.status = 'active'
--     AND (c.date + COALESCE(c.time, TIME '00:00:00'))
--           AT TIME ZONE 'Europe/Berlin' > pg_catalog.now();
--   IF v_upcoming > 0 THEN
--     RETURN pg_catalog.jsonb_build_object(
--       'success', false, 'error', 'HAS_UPCOMING_COURSES', 'upcoming_courses', v_upcoming
--     );
--   END IF;
--   SELECT * INTO v_target FROM public.users WHERE id = p_member_id FOR UPDATE;
--   IF NOT FOUND OR v_target.tenant_id IS DISTINCT FROM v_tenant THEN
--     RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
--   END IF;
--   IF v_target.anonymized_at IS NOT NULL THEN
--     RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ALREADY_REMOVED');
--   END IF;
--   IF v_target.role = 'owner' THEN
--     RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'OWNER_NOT_REMOVABLE');
--   END IF;
--   v_old_auth := v_target.auth_user_id;
--   PERFORM 1 FROM public.courses c
--   WHERE c.id IN (
--     SELECT r.course_id FROM public.registrations r
--     JOIN public.courses c2 ON c2.id = r.course_id
--     WHERE r.user_id = v_target.id AND r.tenant_id = v_tenant
--       AND r.cancellation_timestamp IS NULL
--       AND r.status IN ('registered'::public.registration_status, 'waitlist'::public.registration_status)
--       AND c2.status = 'active'
--       AND (c2.date + COALESCE(c2.time, TIME '00:00:00'))
--             AT TIME ZONE 'Europe/Berlin' > pg_catalog.now()
--   )
--   ORDER BY c.id FOR UPDATE;
--   UPDATE public.registrations r SET
--     status = 'cancelled'::public.registration_status,
--     cancellation_timestamp = pg_catalog.now(),
--     cancelled_by = v_actor,
--     cancel_reason = 'member_removed',
--     waitlist_position = NULL
--   FROM public.courses c
--   WHERE r.course_id = c.id AND r.user_id = v_target.id AND r.tenant_id = v_tenant
--     AND r.cancellation_timestamp IS NULL
--     AND r.status IN ('registered'::public.registration_status, 'waitlist'::public.registration_status)
--     AND c.status = 'active'
--     AND (c.date + COALESCE(c.time, TIME '00:00:00'))
--           AT TIME ZONE 'Europe/Berlin' > pg_catalog.now();
--   GET DIAGNOSTICS v_cancelled = ROW_COUNT;
--   v_money := EXISTS (
--     SELECT 1 FROM public.registrations r
--     WHERE r.user_id = v_target.id
--       AND (
--         r.coverage_status IN (
--           'paid'::public.registration_coverage_status,
--           'waived'::public.registration_coverage_status
--         )
--         OR EXISTS (SELECT 1 FROM public.payments p WHERE p.registration_id = r.id)
--       )
--   ) OR EXISTS (SELECT 1 FROM public.payments p WHERE p.recorded_by = v_target.id)
--     OR EXISTS (SELECT 1 FROM public.audit_log a WHERE a.actor_member_id = v_target.id)
--     OR EXISTS (
--       SELECT 1 FROM public.courses c
--       WHERE c.teacher_id = v_target.id
--         AND NOT (
--           c.status = 'active'
--           AND (c.date + COALESCE(c.time, TIME '00:00:00'))
--                 AT TIME ZONE 'Europe/Berlin' > pg_catalog.now()
--         )
--     )
--     OR EXISTS (SELECT 1 FROM public.passes p WHERE p.member_id = v_target.id);
--   IF NOT v_money THEN
--     v_mode := 'deleted';
--     SELECT count(*)::integer INTO v_deleted_regs FROM public.registrations WHERE user_id = v_target.id;
--     DELETE FROM public.users WHERE id = v_target.id;
--     v_fields := ARRAY['id']::text[];
--   ELSE
--     v_mode := 'anonymized';
--     DELETE FROM public.messages WHERE sender_id = v_target.id OR recipient_id = v_target.id;
--     DELETE FROM public.user_notifications WHERE user_id = v_target.id;
--     DELETE FROM public.registrations r
--     WHERE r.user_id = v_target.id
--       AND r.cancel_reason IS DISTINCT FROM 'member_removed'
--       AND r.coverage_status NOT IN (
--         'paid'::public.registration_coverage_status,
--         'waived'::public.registration_coverage_status
--       )
--       AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.registration_id = r.id);
--     GET DIAGNOSTICS v_deleted_regs = ROW_COUNT;
--     PERFORM pg_catalog.set_config('yogaflow.allow_member_removal', 'on', true);
--     UPDATE public.users SET
--       first_name = 'Entfernte', last_name = 'Person',
--       email = 'entfernt-' || id::text || '@anonymisiert.invalid',
--       street = NULL, house_number = NULL, postal_code = NULL, city = NULL, phone = NULL,
--       email_verified = false, email_verified_at = NULL, role = 'user',
--       anonymized_at = pg_catalog.now(), auth_user_id = NULL
--     WHERE id = v_target.id;
--     v_fields := ARRAY[
--       'anonymized_at','auth_user_id','email','first_name','last_name','street',
--       'house_number','postal_code','city','phone','email_verified','email_verified_at','role'
--     ]::text[];
--   END IF;
--   v_event_id := yogaflow_private.insert_event(
--     v_tenant, 'member.removed', 'member', v_target.id,
--     pg_catalog.jsonb_build_object(
--       'member_id', v_target.id, 'mode', v_mode,
--       'cancelled_registrations', v_cancelled, 'deleted_registrations', v_deleted_regs
--     ),
--     pg_catalog.gen_random_uuid()
--   );
--   PERFORM yogaflow_private.insert_audit(
--     v_tenant, v_actor, 'member.removed', 'users', v_target.id, v_fields, v_event_id
--   );
--   SELECT count(*)::integer INTO v_remaining FROM public.users WHERE auth_user_id = v_old_auth;
--   RETURN pg_catalog.jsonb_build_object(
--     'success', true, 'mode', v_mode, 'auth_user_id', v_old_auth,
--     'remaining_profiles', v_remaining,
--     'cancelled_registrations', v_cancelled, 'deleted_registrations', v_deleted_regs
--   );
-- END;
-- $function$;
--
-- DROP FUNCTION IF EXISTS public.update_booking_settings(integer, integer);
-- CREATE OR REPLACE FUNCTION public.update_booking_settings(p_default_max_participants integer)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_member uuid;
--   v_tenant_id uuid;
--   v_row public.tenants;
-- BEGIN
--   v_member := yogaflow_private.get_my_member_id();
--   IF v_member IS NULL THEN
--     RETURN jsonb_build_object('success', false, 'message', 'Bitte melde dich an.');
--   END IF;
--   IF NOT yogaflow_private.is_tenant_manager() THEN
--     RETURN jsonb_build_object(
--       'success', false,
--       'message', 'Nur Inhaberin, Inhaber oder Admin des Studios kann die Buchungseinstellungen ändern.'
--     );
--   END IF;
--   v_tenant_id := yogaflow_private.get_my_tenant_id();
--   IF v_tenant_id IS NULL THEN
--     RETURN jsonb_build_object('success', false, 'message', 'Studio nicht gefunden.');
--   END IF;
--   IF p_default_max_participants IS NULL
--      OR p_default_max_participants < 1
--      OR p_default_max_participants > 50
--   THEN
--     RETURN jsonb_build_object(
--       'success', false,
--       'message', 'Die Standardanzahl muss zwischen 1 und 50 liegen.'
--     );
--   END IF;
--   UPDATE public.tenants
--   SET default_max_participants = p_default_max_participants
--   WHERE id = v_tenant_id
--   RETURNING * INTO v_row;
--   IF NOT FOUND THEN
--     RETURN jsonb_build_object('success', false, 'message', 'Studio nicht gefunden.');
--   END IF;
--   RETURN jsonb_build_object(
--     'success', true,
--     'message', 'Gespeichert.',
--     'tenant', jsonb_build_object(
--       'id', v_row.id,
--       'default_max_participants', v_row.default_max_participants,
--       'updated_at', v_row.updated_at
--     )
--   );
-- END;
-- $function$;
-- REVOKE ALL ON FUNCTION public.update_booking_settings(integer) FROM PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION public.update_booking_settings(integer) TO authenticated;
--
-- CREATE OR REPLACE FUNCTION yogaflow_private.registrations_freeze_price()
-- RETURNS trigger
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = ''
-- AS $function$
-- DECLARE
--   v_price numeric;
-- BEGIN
--   SELECT price INTO v_price FROM public.courses WHERE id = NEW.course_id;
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'COURSE_NOT_FOUND: für diese Buchung gibt es keinen Kurs.';
--   END IF;
--   NEW.price_cents_at_booking := pg_catalog.round(v_price * 100)::integer;
--   NEW.currency := 'EUR';
--   NEW.coverage_status := COALESCE(
--     NEW.coverage_status,
--     (CASE WHEN v_price = 0 THEN 'not_required' ELSE 'open' END)
--       ::public.registration_coverage_status
--   );
--   RETURN NEW;
-- END;
-- $function$;
--
-- CREATE OR REPLACE FUNCTION yogaflow_private.registrations_price_immutable()
-- RETURNS trigger
-- LANGUAGE plpgsql
-- SECURITY INVOKER
-- SET search_path = ''
-- AS $function$
-- BEGIN
--   IF NEW.price_cents_at_booking IS DISTINCT FROM OLD.price_cents_at_booking
--      OR NEW.currency IS DISTINCT FROM OLD.currency
--   THEN
--     RAISE EXCEPTION 'PRICE_FROZEN: diesen Preis kannst du nicht mehr ändern.';
--   END IF;
--   RETURN NEW;
-- END;
-- $function$;
-- DROP TRIGGER IF EXISTS registrations_price_immutable ON public.registrations;
-- CREATE TRIGGER registrations_price_immutable
--   BEFORE UPDATE OF price_cents_at_booking, currency
--   ON public.registrations
--   FOR EACH ROW
--   EXECUTE FUNCTION yogaflow_private.registrations_price_immutable();
-- REVOKE ALL ON FUNCTION yogaflow_private.registrations_freeze_price() FROM PUBLIC, anon, authenticated;
-- REVOKE ALL ON FUNCTION yogaflow_private.registrations_price_immutable() FROM PUBLIC, anon, authenticated;
--
-- ALTER TABLE public.registrations
--   DROP CONSTRAINT IF EXISTS registrations_pass_iff_pass_id,
--   DROP CONSTRAINT IF EXISTS registrations_coverage_intent_check;
-- DROP INDEX IF EXISTS public.registrations_pass_id_idx;
-- ALTER TABLE public.registrations
--   DROP COLUMN IF EXISTS coverage_intent,
--   DROP COLUMN IF EXISTS pass_id,
--   DROP COLUMN IF EXISTS cancellation_deadline;
-- ALTER TABLE public.tenants
--   DROP CONSTRAINT IF EXISTS tenants_cancellation_window_hours_range,
--   DROP COLUMN IF EXISTS cancellation_window_hours;

-- ---------------------------------------------------------------------------
-- 1. Stornofrist an tenants
-- ---------------------------------------------------------------------------

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS cancellation_window_hours integer NOT NULL DEFAULT 24;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_cancellation_window_hours_range'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_cancellation_window_hours_range
      CHECK (cancellation_window_hours BETWEEN 0 AND 72);
  END IF;
END;
$$;

COMMENT ON COLUMN public.tenants.cancellation_window_hours IS
  'Stunden vor Kursbeginn, in denen die Teilnehmerin die Einheit zurückbekommt (W2). Bei Buchung als cancellation_deadline eingefroren.';

-- Alte Signatur entfernen, sonst zwei Überladungen.
DROP FUNCTION IF EXISTS public.update_booking_settings(integer);

CREATE OR REPLACE FUNCTION public.update_booking_settings(
  p_default_max_participants integer DEFAULT NULL,
  p_cancellation_window_hours integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_member uuid;
  v_tenant_id uuid;
  v_row public.tenants;
  v_old public.tenants;
  v_fields text[] := '{}';
  v_event_id uuid;
BEGIN
  v_member := yogaflow_private.get_my_member_id();
  IF v_member IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Bitte melde dich an.'
    );
  END IF;

  IF NOT yogaflow_private.is_tenant_manager() THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Nur Inhaberin, Inhaber oder Admin des Studios kann die Buchungseinstellungen ändern.'
    );
  END IF;

  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Studio nicht gefunden.'
    );
  END IF;

  IF p_default_max_participants IS NULL AND p_cancellation_window_hours IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Keine Änderung angegeben.'
    );
  END IF;

  IF p_default_max_participants IS NOT NULL
     AND (p_default_max_participants < 1 OR p_default_max_participants > 50)
  THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Die Standardanzahl muss zwischen 1 und 50 liegen.'
    );
  END IF;

  IF p_cancellation_window_hours IS NOT NULL
     AND (p_cancellation_window_hours < 0 OR p_cancellation_window_hours > 72)
  THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Die Stornofrist muss zwischen 0 und 72 Stunden liegen.'
    );
  END IF;

  SELECT * INTO v_old FROM public.tenants WHERE id = v_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Studio nicht gefunden.'
    );
  END IF;

  UPDATE public.tenants
  SET
    default_max_participants = COALESCE(p_default_max_participants, default_max_participants),
    cancellation_window_hours = COALESCE(p_cancellation_window_hours, cancellation_window_hours)
  WHERE id = v_tenant_id
  RETURNING * INTO v_row;

  IF v_row.default_max_participants IS DISTINCT FROM v_old.default_max_participants THEN
    v_fields := v_fields || ARRAY['default_max_participants']::text[];
  END IF;
  IF v_row.cancellation_window_hours IS DISTINCT FROM v_old.cancellation_window_hours THEN
    v_fields := v_fields || ARRAY['cancellation_window_hours']::text[];
  END IF;

  IF pg_catalog.array_length(v_fields, 1) IS NOT NULL THEN
    v_event_id := yogaflow_private.insert_event(
      v_tenant_id,
      'tenant.booking_settings_updated',
      'tenant',
      v_tenant_id,
      pg_catalog.jsonb_build_object(
        'default_max_participants', v_row.default_max_participants,
        'cancellation_window_hours', v_row.cancellation_window_hours
      ),
      pg_catalog.gen_random_uuid()
    );
    PERFORM yogaflow_private.insert_audit(
      v_tenant_id,
      v_member,
      'tenant.booking_settings_updated',
      'tenants',
      v_tenant_id,
      v_fields,
      v_event_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Gespeichert.',
    'tenant', jsonb_build_object(
      'id', v_row.id,
      'default_max_participants', v_row.default_max_participants,
      'cancellation_window_hours', v_row.cancellation_window_hours,
      'updated_at', v_row.updated_at
    )
  );
END;
$function$;

COMMENT ON FUNCTION public.update_booking_settings(integer, integer) IS
  'Owner/Admin: Standard-Teilnehmerzahl und/oder Stornofrist (Stunden). NULL = nicht ändern.';

REVOKE ALL ON FUNCTION public.update_booking_settings(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_booking_settings(integer, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Spalten an registrations
-- ---------------------------------------------------------------------------

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS cancellation_deadline timestamptz NULL,
  ADD COLUMN IF NOT EXISTS pass_id uuid NULL
    REFERENCES public.passes (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS coverage_intent text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registrations_coverage_intent_check'
      AND conrelid = 'public.registrations'::regclass
  ) THEN
    ALTER TABLE public.registrations
      ADD CONSTRAINT registrations_coverage_intent_check
      CHECK (coverage_intent IS NULL OR coverage_intent = 'pass');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registrations_pass_iff_pass_id'
      AND conrelid = 'public.registrations'::regclass
  ) THEN
    ALTER TABLE public.registrations
      ADD CONSTRAINT registrations_pass_iff_pass_id
      CHECK (
        (coverage_status = 'pass'::public.registration_coverage_status)
        = (pass_id IS NOT NULL)
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS registrations_pass_id_idx
  ON public.registrations (pass_id)
  WHERE pass_id IS NOT NULL;

COMMENT ON COLUMN public.registrations.cancellation_deadline IS
  'Eingefrorener Zeitpunkt (Kursbeginn Berlin minus Studio-Frist). NULL bei Bestand vor A6-1.';
COMMENT ON COLUMN public.registrations.pass_id IS
  'Karte, die diese Buchung deckt. Nur gesetzt wenn coverage_status = pass.';
COMMENT ON COLUMN public.registrations.coverage_intent IS
  'Warteliste: pass = mit Karte einlösen beim Nachrücken (W3).';

-- Freeze: A2-Körper (Preis/Deckung) unverändert + cancellation_deadline (A6-1).
CREATE OR REPLACE FUNCTION yogaflow_private.registrations_freeze_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_price numeric;
  -- A6-1: für eingefrorene Stornofrist
  v_date date;
  v_time time;
  v_hours integer;
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

  -- A6-1: Stornofrist einfrieren (Kursbeginn Berlin minus Studio-Fenster).
  SELECT c.date, c.time, t.cancellation_window_hours
    INTO v_date, v_time, v_hours
  FROM public.courses c
  JOIN public.tenants t ON t.id = c.tenant_id
  WHERE c.id = NEW.course_id;

  NEW.cancellation_deadline :=
    ((v_date + COALESCE(v_time, TIME '00:00:00')) AT TIME ZONE 'Europe/Berlin')
    - pg_catalog.make_interval(hours => v_hours);

  RETURN NEW;
END;
$function$;

-- Unveränderlich: Preis, Währung, Frist; pass_id nur mit Schalter
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

  IF NEW.cancellation_deadline IS DISTINCT FROM OLD.cancellation_deadline THEN
    RAISE EXCEPTION 'CANCELLATION_DEADLINE_FROZEN: diese Stornofrist kannst du nicht mehr ändern.';
  END IF;

  IF NEW.pass_id IS DISTINCT FROM OLD.pass_id
     AND pg_catalog.current_setting('yogaflow.allow_pass_coverage', true) IS DISTINCT FROM 'on'
  THEN
    RAISE EXCEPTION 'PASS_ID_FROZEN: die Kartenverknüpfung kannst du nicht direkt ändern.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS registrations_price_immutable ON public.registrations;
CREATE TRIGGER registrations_price_immutable
  BEFORE UPDATE OF price_cents_at_booking, currency, cancellation_deadline, pass_id
  ON public.registrations
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.registrations_price_immutable();

REVOKE ALL ON FUNCTION yogaflow_private.registrations_freeze_price()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION yogaflow_private.registrations_price_immutable()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Interne Helfer
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.pick_pass_for_registration(
  p_member_id uuid,
  p_course_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tenant uuid;
  v_date date;
  v_eligible boolean;
  v_cand record;
BEGIN
  SELECT c.tenant_id, c.date, COALESCE(c.pass_eligible, true)
    INTO v_tenant, v_date, v_eligible
  FROM public.courses c
  WHERE c.id = p_course_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT v_eligible THEN
    RETURN NULL;
  END IF;

  FOR v_cand IN
    SELECT p.id
    FROM public.passes p
    WHERE p.member_id = p_member_id
      AND p.tenant_id = v_tenant
      AND p.status = 'active'
      AND p.valid_until >= v_date
    ORDER BY p.valid_until ASC, p.created_at ASC, p.id ASC
    FOR UPDATE OF p
  LOOP
    IF yogaflow_private.pass_remaining(v_cand.id) >= 1 THEN
      RETURN v_cand.id;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION yogaflow_private.redeem_pass(
  p_registration_id uuid,
  p_pass_id uuid,
  p_actor uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_reg public.registrations%ROWTYPE;
  v_course public.courses%ROWTYPE;
  v_pass public.passes%ROWTYPE;
  v_remaining integer;
  v_movement_id uuid;
  v_event_id uuid;
  v_causation uuid := pg_catalog.gen_random_uuid();
BEGIN
  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = p_registration_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_OPEN';
  END IF;

  SELECT * INTO v_course
  FROM public.courses
  WHERE id = v_reg.course_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_PASS_ELIGIBLE';
  END IF;

  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = p_registration_id
  FOR UPDATE;

  IF v_reg.status IS DISTINCT FROM 'registered'::public.registration_status
     OR v_reg.cancellation_timestamp IS NOT NULL
     OR v_reg.coverage_status IS DISTINCT FROM 'open'::public.registration_coverage_status
  THEN
    RAISE EXCEPTION 'NOT_OPEN';
  END IF;

  IF COALESCE(v_course.pass_eligible, true) IS NOT TRUE THEN
    RAISE EXCEPTION 'NOT_PASS_ELIGIBLE';
  END IF;

  SELECT * INTO v_pass
  FROM public.passes
  WHERE id = p_pass_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PASS_MISMATCH';
  END IF;

  IF v_pass.member_id IS DISTINCT FROM v_reg.user_id
     OR v_pass.tenant_id IS DISTINCT FROM v_reg.tenant_id
     OR v_reg.tenant_id IS DISTINCT FROM v_course.tenant_id
  THEN
    RAISE EXCEPTION 'PASS_MISMATCH';
  END IF;

  IF v_pass.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'PASS_EXPIRED';
  END IF;

  IF v_pass.valid_until < v_course.date THEN
    RAISE EXCEPTION 'PASS_EXPIRED';
  END IF;

  v_remaining := yogaflow_private.pass_remaining(v_pass.id);
  IF v_remaining < 1 THEN
    RAISE EXCEPTION 'PASS_EMPTY';
  END IF;

  PERFORM pg_catalog.set_config('yogaflow.allow_pass_coverage', 'on', true);

  UPDATE public.registrations
  SET
    coverage_status = 'pass'::public.registration_coverage_status,
    pass_id = v_pass.id
  WHERE id = v_reg.id;

  v_event_id := yogaflow_private.insert_event(
    v_reg.tenant_id,
    'pass.redeemed',
    'pass',
    v_pass.id,
    pg_catalog.jsonb_build_object(
      'pass_id', v_pass.id,
      'registration_id', v_reg.id,
      'remaining_after', v_remaining - 1
    ),
    v_causation
  );

  INSERT INTO public.pass_movements (
    tenant_id,
    pass_id,
    delta,
    kind,
    registration_id,
    actor_member_id,
    event_id
  ) VALUES (
    v_reg.tenant_id,
    v_pass.id,
    -1,
    'redeem',
    v_reg.id,
    p_actor,
    v_event_id
  )
  RETURNING id INTO v_movement_id;

  PERFORM yogaflow_private.insert_audit(
    v_reg.tenant_id,
    p_actor,
    'pass.redeemed',
    'registrations',
    v_reg.id,
    ARRAY['coverage_status', 'pass_id']::text[],
    v_event_id
  );

  RETURN v_movement_id;
END;
$function$;

-- jsonb: movement_id + pass_inactive (A6-3 E17-Hinweis).
CREATE OR REPLACE FUNCTION yogaflow_private.reverse_redemption(
  p_registration_id uuid,
  p_actor uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_reg public.registrations%ROWTYPE;
  v_course public.courses%ROWTYPE;
  v_pass public.passes%ROWTYPE;
  v_pass_id uuid;
  v_inactive boolean := false;
  v_movement_id uuid;
  v_event_id uuid;
  v_causation uuid := pg_catalog.gen_random_uuid();
  v_reason text;
BEGIN
  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = p_registration_id;

  IF NOT FOUND
     OR v_reg.coverage_status IS DISTINCT FROM 'pass'::public.registration_coverage_status
     OR v_reg.pass_id IS NULL
  THEN
    RAISE EXCEPTION 'NOT_OPEN';
  END IF;

  v_pass_id := v_reg.pass_id;
  v_reason := NULLIF(pg_catalog.btrim(COALESCE(p_reason, '')), '');
  IF v_reason IS NOT NULL AND pg_catalog.char_length(v_reason) > 200 THEN
    RAISE EXCEPTION 'NOTE_TOO_LONG';
  END IF;

  SELECT * INTO v_course
  FROM public.courses
  WHERE id = v_reg.course_id
  FOR UPDATE;

  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = p_registration_id
  FOR UPDATE;

  IF v_reg.coverage_status IS DISTINCT FROM 'pass'::public.registration_coverage_status
     OR v_reg.pass_id IS NULL
  THEN
    RAISE EXCEPTION 'NOT_OPEN';
  END IF;

  SELECT * INTO v_pass
  FROM public.passes
  WHERE id = v_pass_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PASS_MISMATCH';
  END IF;

  IF v_pass.status IS DISTINCT FROM 'active'
     OR v_pass.valid_until < COALESCE(v_course.date, v_pass.valid_until)
  THEN
    v_inactive := true;
  END IF;

  PERFORM pg_catalog.set_config('yogaflow.allow_pass_coverage', 'on', true);

  UPDATE public.registrations
  SET
    coverage_status = 'open'::public.registration_coverage_status,
    pass_id = NULL
  WHERE id = v_reg.id;

  -- Freitext (p_reason) nur in pass_movements.reason, nie im Event (Art. 17).
  v_event_id := yogaflow_private.insert_event(
    v_reg.tenant_id,
    'pass.redeem_reversed',
    'pass',
    v_pass_id,
    pg_catalog.jsonb_build_object(
      'pass_id', v_pass_id,
      'registration_id', v_reg.id,
      'pass_inactive', v_inactive
    ),
    v_causation
  );

  INSERT INTO public.pass_movements (
    tenant_id,
    pass_id,
    delta,
    kind,
    registration_id,
    reason,
    actor_member_id,
    event_id
  ) VALUES (
    v_reg.tenant_id,
    v_pass_id,
    1,
    'redeem_reversal',
    v_reg.id,
    v_reason,
    p_actor,
    v_event_id
  )
  RETURNING id INTO v_movement_id;

  PERFORM yogaflow_private.insert_audit(
    v_reg.tenant_id,
    p_actor,
    'pass.redeem_reversed',
    'registrations',
    v_reg.id,
    ARRAY['coverage_status', 'pass_id']::text[],
    v_event_id
  );

  RETURN pg_catalog.jsonb_build_object(
    'movement_id', v_movement_id,
    'pass_inactive', v_inactive
  );
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.pick_pass_for_registration(uuid, uuid) IS
  'Wählt die passende Karte nach W9 und sperrt sie FOR UPDATE. NULL wenn keine.';
COMMENT ON FUNCTION yogaflow_private.redeem_pass(uuid, uuid, uuid) IS
  'Löst eine Einheit ein: redeem −1, coverage pass. Exceptions NOT_OPEN/NOT_PASS_ELIGIBLE/PASS_EMPTY/PASS_EXPIRED/PASS_MISMATCH.';
COMMENT ON FUNCTION yogaflow_private.reverse_redemption(uuid, uuid, text) IS
  'Bucht Einlösung zurück: redeem_reversal +1, coverage open. jsonb movement_id + pass_inactive.';

REVOKE ALL ON FUNCTION yogaflow_private.pick_pass_for_registration(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION yogaflow_private.redeem_pass(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION yogaflow_private.reverse_redemption(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. remove_member — Deckung pass / pass_id behalten (Diff zu A5)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.remove_member(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_tenant uuid;
  v_target public.users%ROWTYPE;
  v_upcoming integer;
  v_cancelled integer := 0;
  v_deleted_regs integer := 0;
  v_money boolean;
  v_mode text;
  v_old_auth uuid;
  v_remaining integer;
  v_event_id uuid;
  v_fields text[];
BEGIN
  v_actor := yogaflow_private.get_my_member_id();
  IF NOT yogaflow_private.is_tenant_manager() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  v_tenant := yogaflow_private.get_my_tenant_id();

  SELECT *
    INTO v_target
  FROM public.users
  WHERE id = p_member_id;

  IF NOT FOUND OR v_target.tenant_id IS DISTINCT FROM v_tenant THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_target.id = v_actor THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'CANNOT_REMOVE_SELF');
  END IF;

  IF v_target.role = 'owner' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'OWNER_NOT_REMOVABLE');
  END IF;

  IF v_target.anonymized_at IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ALREADY_REMOVED');
  END IF;

  SELECT count(*)::integer
    INTO v_upcoming
  FROM public.courses c
  WHERE c.teacher_id = v_target.id
    AND c.status = 'active'
    AND (c.date + COALESCE(c.time, TIME '00:00:00'))
          AT TIME ZONE 'Europe/Berlin' > pg_catalog.now();

  IF v_upcoming > 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error', 'HAS_UPCOMING_COURSES',
      'upcoming_courses', v_upcoming
    );
  END IF;

  SELECT *
    INTO v_target
  FROM public.users
  WHERE id = p_member_id
  FOR UPDATE;

  IF NOT FOUND OR v_target.tenant_id IS DISTINCT FROM v_tenant THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_target.anonymized_at IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ALREADY_REMOVED');
  END IF;

  IF v_target.role = 'owner' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'OWNER_NOT_REMOVABLE');
  END IF;

  v_old_auth := v_target.auth_user_id;

  PERFORM 1
  FROM public.courses c
  WHERE c.id IN (
    SELECT r.course_id
    FROM public.registrations r
    JOIN public.courses c2 ON c2.id = r.course_id
    WHERE r.user_id = v_target.id
      AND r.tenant_id = v_tenant
      AND r.cancellation_timestamp IS NULL
      AND r.status IN (
        'registered'::public.registration_status,
        'waitlist'::public.registration_status
      )
      AND c2.status = 'active'
      AND (c2.date + COALESCE(c2.time, TIME '00:00:00'))
            AT TIME ZONE 'Europe/Berlin' > pg_catalog.now()
  )
  ORDER BY c.id
  FOR UPDATE;

  UPDATE public.registrations r
  SET
    status = 'cancelled'::public.registration_status,
    cancellation_timestamp = pg_catalog.now(),
    cancelled_by = v_actor,
    cancel_reason = 'member_removed',
    waitlist_position = NULL
  FROM public.courses c
  WHERE r.course_id = c.id
    AND r.user_id = v_target.id
    AND r.tenant_id = v_tenant
    AND r.cancellation_timestamp IS NULL
    AND r.status IN (
      'registered'::public.registration_status,
      'waitlist'::public.registration_status
    )
    AND c.status = 'active'
    AND (c.date + COALESCE(c.time, TIME '00:00:00'))
          AT TIME ZONE 'Europe/Berlin' > pg_catalog.now();

  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  -- Diff A6-1: coverage pass / pass_id zählt als Geldbezug (neben passes).
  v_money := EXISTS (
    SELECT 1
    FROM public.registrations r
    WHERE r.user_id = v_target.id
      AND (
        r.coverage_status IN (
          'paid'::public.registration_coverage_status,
          'waived'::public.registration_coverage_status,
          'pass'::public.registration_coverage_status
        )
        OR r.pass_id IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM public.payments p WHERE p.registration_id = r.id
        )
      )
  ) OR EXISTS (
    SELECT 1 FROM public.payments p WHERE p.recorded_by = v_target.id
  ) OR EXISTS (
    SELECT 1 FROM public.audit_log a WHERE a.actor_member_id = v_target.id
  ) OR EXISTS (
    SELECT 1
    FROM public.courses c
    WHERE c.teacher_id = v_target.id
      AND NOT (
        c.status = 'active'
        AND (c.date + COALESCE(c.time, TIME '00:00:00'))
              AT TIME ZONE 'Europe/Berlin' > pg_catalog.now()
      )
  ) OR EXISTS (
    SELECT 1 FROM public.passes p WHERE p.member_id = v_target.id
  );

  IF NOT v_money THEN
    v_mode := 'deleted';
    SELECT count(*)::integer
      INTO v_deleted_regs
    FROM public.registrations
    WHERE user_id = v_target.id;

    DELETE FROM public.users WHERE id = v_target.id;
    v_fields := ARRAY['id']::text[];
  ELSE
    v_mode := 'anonymized';

    DELETE FROM public.messages
    WHERE sender_id = v_target.id OR recipient_id = v_target.id;

    DELETE FROM public.user_notifications
    WHERE user_id = v_target.id;

    -- Diff A6-1: pass / pass_id in der Behalten-Liste (RESTRICT pass_movements).
    DELETE FROM public.registrations r
    WHERE r.user_id = v_target.id
      AND r.cancel_reason IS DISTINCT FROM 'member_removed'
      AND r.coverage_status NOT IN (
        'paid'::public.registration_coverage_status,
        'waived'::public.registration_coverage_status,
        'pass'::public.registration_coverage_status
      )
      AND r.pass_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.payments p WHERE p.registration_id = r.id
      );

    GET DIAGNOSTICS v_deleted_regs = ROW_COUNT;

    PERFORM pg_catalog.set_config('yogaflow.allow_member_removal', 'on', true);

    UPDATE public.users
    SET
      first_name = 'Entfernte',
      last_name = 'Person',
      email = 'entfernt-' || id::text || '@anonymisiert.invalid',
      street = NULL,
      house_number = NULL,
      postal_code = NULL,
      city = NULL,
      phone = NULL,
      email_verified = false,
      email_verified_at = NULL,
      role = 'user',
      anonymized_at = pg_catalog.now(),
      auth_user_id = NULL
    WHERE id = v_target.id;

    v_fields := ARRAY[
      'anonymized_at',
      'auth_user_id',
      'email',
      'first_name',
      'last_name',
      'street',
      'house_number',
      'postal_code',
      'city',
      'phone',
      'email_verified',
      'email_verified_at',
      'role'
    ]::text[];
  END IF;

  v_event_id := yogaflow_private.insert_event(
    v_tenant,
    'member.removed',
    'member',
    v_target.id,
    pg_catalog.jsonb_build_object(
      'member_id', v_target.id,
      'mode', v_mode,
      'cancelled_registrations', v_cancelled,
      'deleted_registrations', v_deleted_regs
    ),
    pg_catalog.gen_random_uuid()
  );

  PERFORM yogaflow_private.insert_audit(
    v_tenant,
    v_actor,
    'member.removed',
    'users',
    v_target.id,
    v_fields,
    v_event_id
  );

  SELECT count(*)::integer
    INTO v_remaining
  FROM public.users
  WHERE auth_user_id = v_old_auth;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'mode', v_mode,
    'auth_user_id', v_old_auth,
    'remaining_profiles', v_remaining,
    'cancelled_registrations', v_cancelled,
    'deleted_registrations', v_deleted_regs
  );
END;
$function$;

COMMENT ON FUNCTION public.remove_member(uuid) IS
  'Entfernt ein Profil. Geldbezug inkl. Karte und Deckung pass. Login löscht delete-user nur bei remaining_profiles = 0.';

REVOKE ALL ON FUNCTION public.remove_member(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_member(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Selbstprüfung
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_bad bigint;
  v_pick oid;
  v_redeem oid;
  v_reverse oid;
  v_freeze_oid oid;
  v_freeze_def text;
  v_rm_def text;
  v_rev_def text;
  v_event_payload text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tenants'
      AND column_name = 'cancellation_window_hours'
      AND data_type = 'integer' AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'A6-1: tenants.cancellation_window_hours fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_cancellation_window_hours_range'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    RAISE EXCEPTION 'A6-1: CHECK tenants_cancellation_window_hours_range fehlt';
  END IF;

  IF (
    SELECT regexp_replace(COALESCE(column_default, ''), '[^0-9]', '', 'g')
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tenants'
      AND column_name = 'cancellation_window_hours'
  ) IS DISTINCT FROM '24' THEN
    RAISE EXCEPTION 'A6-1: Default cancellation_window_hours ist nicht 24';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'registrations'
      AND column_name = 'cancellation_deadline'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'registrations'
      AND column_name = 'pass_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'registrations'
      AND column_name = 'coverage_intent'
  ) THEN
    RAISE EXCEPTION 'A6-1: Spalten an registrations fehlen';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registrations_pass_iff_pass_id'
      AND conrelid = 'public.registrations'::regclass
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registrations_coverage_intent_check'
      AND conrelid = 'public.registrations'::regclass
  ) THEN
    RAISE EXCEPTION 'A6-1: CHECKs an registrations fehlen';
  END IF;

  -- Frist-Logik: nur statisch (kein Probe-INSERT in Studio-Daten; prüft a6_1_foundation.mjs).
  SELECT p.oid INTO v_freeze_oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'yogaflow_private'
    AND p.proname = 'registrations_freeze_price'
    AND pg_get_function_identity_arguments(p.oid) = '';

  IF v_freeze_oid IS NULL THEN
    RAISE EXCEPTION 'A6-1: registrations_freeze_price fehlt';
  END IF;

  SELECT pg_get_functiondef(v_freeze_oid) INTO v_freeze_def;
  IF v_freeze_def NOT LIKE '%cancellation_deadline%' THEN
    RAISE EXCEPTION 'A6-1: registrations_freeze_price setzt cancellation_deadline nicht';
  END IF;

  SELECT p.oid INTO v_pick
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'yogaflow_private'
    AND p.proname = 'pick_pass_for_registration';

  SELECT p.oid INTO v_redeem
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'yogaflow_private' AND p.proname = 'redeem_pass';

  SELECT p.oid INTO v_reverse
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'yogaflow_private' AND p.proname = 'reverse_redemption';

  IF v_pick IS NULL OR v_redeem IS NULL OR v_reverse IS NULL THEN
    RAISE EXCEPTION 'A6-1: ein Helfer fehlt';
  END IF;

  IF has_function_privilege('authenticated', v_pick, 'EXECUTE')
     OR has_function_privilege('authenticated', v_redeem, 'EXECUTE')
     OR has_function_privilege('authenticated', v_reverse, 'EXECUTE')
     OR has_function_privilege('anon', v_pick, 'EXECUTE')
     OR has_function_privilege('anon', v_redeem, 'EXECUTE')
     OR has_function_privilege('anon', v_reverse, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'A6-1: Helfer sind für anon/authenticated ausführbar';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_rm_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'remove_member'
    AND pg_get_function_identity_arguments(p.oid) = 'p_member_id uuid';

  IF v_rm_def IS NULL
     OR v_rm_def NOT LIKE '%pass%'
     OR v_rm_def NOT LIKE '%pass_id%'
  THEN
    RAISE EXCEPTION 'A6-1: remove_member enthält pass/pass_id nicht';
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.registrations r
  WHERE r.coverage_status = 'pass'::public.registration_coverage_status
    AND COALESCE((
      SELECT pg_catalog.sum(m.delta)
      FROM public.pass_movements m
      WHERE m.registration_id = r.id
        AND m.kind IN ('redeem', 'redeem_reversal')
        AND m.pass_id = r.pass_id
    ), 0) <> -1;

  IF v_bad <> 0 THEN
    RAISE EXCEPTION
      'A6-1: % Buchungen mit pass ohne passende nicht zurückgebuchte redeem-Bewegung',
      v_bad;
  END IF;

  IF to_regprocedure('public.update_booking_settings(integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'A6-1: alte Signatur update_booking_settings(integer) existiert noch';
  END IF;

  IF to_regprocedure('public.update_booking_settings(integer, integer)') IS NULL THEN
    RAISE EXCEPTION 'A6-1: update_booking_settings(integer, integer) fehlt';
  END IF;

  -- Event-Payload von pass.redeem_reversed ohne Freitext 'reason'
  -- (Grund nur in pass_movements.reason, Art. 17).
  SELECT pg_get_functiondef(v_reverse) INTO v_rev_def;
  v_event_payload := (regexp_match(
    v_rev_def,
    'pass\.redeem_reversed[\s\S]*?jsonb_build_object\s*\(([\s\S]*?)\)\s*,\s*v_causation',
    'i'
  ))[1];
  IF v_event_payload IS NULL THEN
    RAISE EXCEPTION 'A6-1: Event-Payload von pass.redeem_reversed nicht gefunden';
  END IF;
  IF v_event_payload ~ '''reason''' THEN
    RAISE EXCEPTION 'A6-1: Event pass.redeem_reversed enthält reason im Payload';
  END IF;
END;
$$;
