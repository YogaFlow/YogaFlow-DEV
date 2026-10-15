-- 2.2a-1 — Online-Zahlung: Direct Charge Abschluss (ohne Stripe-API / Edge Function).
--
-- Basis DEV (pg_get_functiondef): register_for_course, ledger_money_account,
-- payment_attempts_guard, create_pending_registration, create_payment_attempt,
-- set_payment_attempt_status, record_manual_payment (Payload-Muster),
-- insert_manual_payment_reversal (Gegenzeilen-Muster), expire_payment_holds.
--
-- Entscheidung 09: C1–C10 (Checkout Karte). Keine process_ledger-Änderung außer
-- ledger_money_account(card → psp_clearing).
--
-- Rückweg:
--   DROP FUNCTION IF EXISTS public.mark_online_payment_failed(text, text);
--   DROP FUNCTION IF EXISTS yogaflow_private.mark_online_payment_failed(text, text);
--   DROP FUNCTION IF EXISTS public.record_online_refund(uuid, text, integer, timestamptz);
--   DROP FUNCTION IF EXISTS yogaflow_private.record_online_refund(uuid, text, integer, timestamptz);
--   DROP FUNCTION IF EXISTS public.complete_online_payment(text, integer, text, timestamptz, boolean);
--   DROP FUNCTION IF EXISTS yogaflow_private.complete_online_payment(text, integer, text, timestamptz, boolean);
--   DROP FUNCTION IF EXISTS public.check_before_confirm(uuid, uuid);
--   DROP FUNCTION IF EXISTS yogaflow_private.check_before_confirm(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.attach_payment_ref(uuid, text);
--   DROP FUNCTION IF EXISTS yogaflow_private.attach_payment_ref(uuid, text);
--   DROP FUNCTION IF EXISTS public.prepare_online_payment(uuid, uuid);
--   DROP FUNCTION IF EXISTS yogaflow_private.prepare_online_payment(uuid, uuid);
--   -- register_for_course / payment_attempts_guard / ledger_money_account aus
--     20260929140001 bzw. 20260928020000 wiederherstellen;
--   -- email_deliveries_kind_check auf nur waitlist_promoted_payment_required.

-- ---------------------------------------------------------------------------
-- 1. Hauptbuch: card → psp_clearing
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
    WHEN 'card'::public.payment_method THEN 'psp_clearing'
    ELSE NULL
  END;
$function$;

COMMENT ON FUNCTION yogaflow_private.ledger_money_account(public.payment_method) IS
  'Logisches Geldkonto je Zahlungsart. card → psp_clearing (Verrechnung Stripe). Keine Gebühren in 1a.';

REVOKE ALL ON FUNCTION yogaflow_private.ledger_money_account(public.payment_method)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION yogaflow_private.ledger_money_account(public.payment_method)
  TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- 2. Guard payment_attempts: initiated|processing → succeeded nur mit payment_id + GUC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.payment_attempts_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_allowed boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.subject_type IS DISTINCT FROM OLD.subject_type
       OR NEW.registration_id IS DISTINCT FROM OLD.registration_id
       OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.method IS DISTINCT FROM OLD.method
       OR NEW.provider IS DISTINCT FROM OLD.provider
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.livemode IS DISTINCT FROM OLD.livemode
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'payment_attempts: diese Spalten sind unveränderlich'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.provider_ref IS NOT NULL
       AND NEW.provider_ref IS DISTINCT FROM OLD.provider_ref
    THEN
      RAISE EXCEPTION 'payment_attempts: provider_ref ist unveränderlich'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.provider_ref IS NOT DISTINCT FROM OLD.provider_ref
       AND NEW.failure_code IS NOT DISTINCT FROM OLD.failure_code
       AND NEW.payment_id IS NOT DISTINCT FROM OLD.payment_id
       AND NEW.status_changed_at IS NOT DISTINCT FROM OLD.status_changed_at
    THEN
      RETURN NEW;
    END IF;

    -- Endzustände: Statuswechsel aus failed/canceled verboten (canceled → succeeded bleibt zu).
    IF OLD.status IN ('failed', 'canceled')
       AND NEW.status IS DISTINCT FROM OLD.status
    THEN
      RAISE EXCEPTION 'payment_attempts: Endzustand'
        USING ERRCODE = '22023';
    END IF;

    IF OLD.status = 'initiated' AND NEW.status IN ('processing', 'failed', 'canceled') THEN
      v_allowed := true;
    ELSIF OLD.status = 'processing' AND NEW.status IN ('failed', 'canceled') THEN
      v_allowed := true;
    ELSIF OLD.status IN ('initiated', 'processing')
          AND NEW.status = 'succeeded'
          AND NEW.payment_id IS NOT NULL
    THEN
      -- Nur Abschluss-Funktion (GUC), nie Client.
      v_allowed := true;
    ELSIF OLD.status IS NOT DISTINCT FROM NEW.status THEN
      -- z. B. payment_id an canceled hängen (Spätfall C4) oder provider_ref setzen.
      v_allowed := true;
    END IF;

    IF NOT v_allowed THEN
      RAISE EXCEPTION 'payment_attempts: Übergang % → % nicht erlaubt', OLD.status, NEW.status
        USING ERRCODE = '22023';
    END IF;

    IF NEW.status = 'succeeded'
       AND (
         NEW.payment_id IS NULL
         OR pg_catalog.current_setting('yogaflow.allow_payment_attempt_change', true) IS DISTINCT FROM 'on'
         OR current_user::text IN ('anon', 'authenticated')
       )
    THEN
      RAISE EXCEPTION 'payment_attempts: succeeded nur über Abschluss mit payment_id'
        USING ERRCODE = '22023';
    END IF;

    IF pg_catalog.current_setting('yogaflow.allow_payment_attempt_change', true) = 'on'
       AND current_user::text NOT IN ('anon', 'authenticated')
    THEN
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        NEW.status_changed_at := pg_catalog.now();
      END IF;
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'payment_attempts: Status nur über RPC'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.payment_attempts_guard() IS
  'Unveränderliche Spalten; Endzustände; succeeded nur mit payment_id und GUC allow_payment_attempt_change.';

REVOKE ALL ON FUNCTION yogaflow_private.payment_attempts_guard()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. register_for_course — Online-Pflicht → pending_payment (C2, C8)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.register_for_course(
  p_course_id uuid,
  p_use_pass boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := yogaflow_private.get_my_member_id();
  v_tenant_id uuid;
  v_user_role text;
  v_course_tenant uuid;
  v_max_participants integer;
  v_course_date date;
  v_course_status text;
  v_teacher_id uuid;
  v_course_price numeric;
  v_current_count integer;
  v_next_position integer;
  v_reg_id uuid;
  v_pass_id uuid;
  v_want_pass boolean;
  v_free boolean;
  v_coverage text;
  v_remaining integer;
  v_hold_expires timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Bitte melde dich an.'
    );
  END IF;

  SELECT tenant_id, role
  INTO v_tenant_id, v_user_role
  FROM public.users
  WHERE id = v_user_id;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Kein Tenant für Benutzer gefunden.'
    );
  END IF;

  IF v_user_role NOT IN ('user', 'teacher') THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Owner und Admins können sich nicht für Kurse anmelden.'
    );
  END IF;

  SELECT tenant_id, max_participants, date, status, teacher_id, price
  INTO v_course_tenant, v_max_participants, v_course_date, v_course_status,
       v_teacher_id, v_course_price
  FROM public.courses
  WHERE id = p_course_id
  FOR UPDATE;

  IF NOT FOUND OR v_max_participants IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Kurs nicht gefunden.'
    );
  END IF;

  IF v_teacher_id IS NOT DISTINCT FROM v_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Du kannst dich nicht für deinen eigenen Kurs anmelden.'
    );
  END IF;

  IF v_course_tenant IS DISTINCT FROM v_tenant_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Dieser Kurs gehört nicht zu deinem Studio.'
    );
  END IF;

  IF v_course_date < CURRENT_DATE THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Anmeldung für vergangene Kurse ist nicht möglich.'
    );
  END IF;

  IF lower(trim(coalesce(v_course_status, 'active'))) IN (
    'canceled', 'cancelled', 'not_planned'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Dieser Kurs ist nicht zur Anmeldung verfügbar.'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.registrations
    WHERE course_id = p_course_id
      AND user_id = v_user_id
      AND cancellation_timestamp IS NULL
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Du bist für diesen Kurs bereits angemeldet oder stehst auf der Warteliste.'
    );
  END IF;

  v_free := (COALESCE(v_course_price, 0) = 0);
  -- W12: kostenlos → Wunsch ignorieren
  v_want_pass := COALESCE(p_use_pass, false) AND NOT v_free;

  v_current_count := yogaflow_private.course_occupied_seats(p_course_id);

  IF v_current_count >= v_max_participants THEN
    SELECT COUNT(*)::integer + 1 INTO v_next_position
    FROM public.registrations
    WHERE course_id = p_course_id
      AND is_waitlist = true
      AND status = 'waitlist'
      AND cancellation_timestamp IS NULL;

    INSERT INTO public.registrations (
      user_id,
      course_id,
      tenant_id,
      status,
      is_waitlist,
      waitlist_position,
      coverage_intent
    )
    VALUES (
      v_user_id,
      p_course_id,
      v_tenant_id,
      'waitlist',
      true,
      v_next_position,
      CASE WHEN v_want_pass THEN 'pass' ELSE NULL END
    )
    RETURNING id INTO v_reg_id;

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Du wurdest auf die Warteliste gesetzt.',
      'waitlist_position', v_next_position,
      'is_waitlist', true,
      'coverage', CASE WHEN v_free THEN 'not_required' ELSE 'open' END,
      'status', 'waitlist',
      'registration_id', v_reg_id
    );
  END IF;

  -- C8: Mit Karte wie bisher (Fehler bei fehlender Karte unverändert).
  IF v_want_pass THEN
    v_pass_id := yogaflow_private.pick_pass_for_registration(v_user_id, p_course_id);
    IF v_pass_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'NO_VALID_PASS',
        'message', 'Du hast keine gültige Karte für diesen Kurs.'
      );
    END IF;
  END IF;

  -- C2: Online-Pflicht ohne Karte → Reservierung checkout, 15 Min.
  IF NOT v_free
     AND NOT v_want_pass
     AND yogaflow_private.online_payment_required(v_tenant_id)
  THEN
    v_hold_expires := pg_catalog.now() + interval '15 minutes';
    v_reg_id := yogaflow_private.create_pending_registration(
      p_course_id,
      v_user_id,
      'checkout',
      v_hold_expires
    );

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Platz reserviert — bitte jetzt online bezahlen.',
      'is_waitlist', false,
      'coverage', 'open',
      'status', 'pending_payment',
      'registration_id', v_reg_id,
      'hold_expires_at', v_hold_expires
    );
  END IF;

  BEGIN
    INSERT INTO public.registrations (
      user_id,
      course_id,
      tenant_id,
      status,
      is_waitlist,
      waitlist_position
    )
    VALUES (
      v_user_id,
      p_course_id,
      v_tenant_id,
      'registered',
      false,
      NULL
    )
    RETURNING id INTO v_reg_id;

    IF v_want_pass THEN
      PERFORM yogaflow_private.redeem_pass(v_reg_id, v_pass_id, v_user_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM IN (
      'PASS_EMPTY', 'PASS_EXPIRED', 'PASS_MISMATCH',
      'NOT_PASS_ELIGIBLE', 'NOT_OPEN'
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'message', CASE SQLERRM
          WHEN 'PASS_EMPTY' THEN 'Deine Karte ist aufgebraucht.'
          WHEN 'PASS_EXPIRED' THEN 'Deine Karte gilt nicht für diesen Kurstag.'
          WHEN 'NOT_PASS_ELIGIBLE' THEN 'In diesem Kurs kannst du keine Karte nutzen.'
          ELSE 'Die Karte konnte nicht eingelöst werden.'
        END
      );
    END IF;
    RAISE;
  END;

  SELECT coverage_status::text INTO v_coverage
  FROM public.registrations WHERE id = v_reg_id;

  IF v_coverage = 'pass' THEN
    v_remaining := yogaflow_private.pass_remaining(v_pass_id);
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Erfolgreich angemeldet.',
      'is_waitlist', false,
      'coverage', 'pass',
      'pass_remaining', v_remaining,
      'status', 'registered',
      'registration_id', v_reg_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Erfolgreich angemeldet.',
    'is_waitlist', false,
    'coverage', COALESCE(v_coverage, 'open'),
    'status', 'registered',
    'registration_id', v_reg_id
  );
END;
$function$;

COMMENT ON FUNCTION public.register_for_course(uuid, boolean) IS
  'Selbstanmeldung. Bei online_payment_required und ohne Karte → pending_payment (checkout, 15 Min).';

REVOKE ALL ON FUNCTION public.register_for_course(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_for_course(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Outbox: kind payment_succeeded, payment_refunded
-- ---------------------------------------------------------------------------

ALTER TABLE public.email_deliveries
  DROP CONSTRAINT IF EXISTS email_deliveries_kind_check;

ALTER TABLE public.email_deliveries
  ADD CONSTRAINT email_deliveries_kind_check
  CHECK (kind IN (
    'waitlist_promoted_payment_required',
    'payment_succeeded',
    'payment_refunded'
  ));

-- ---------------------------------------------------------------------------
-- 5. prepare_online_payment
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.prepare_online_payment(
  p_registration_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_reg public.registrations%ROWTYPE;
  v_attempt public.payment_attempts%ROWTYPE;
  v_account_ref text;
  v_livemode boolean;
  v_attempt_id uuid;
BEGIN
  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = p_registration_id
  FOR UPDATE;

  IF NOT FOUND OR v_reg.user_id IS DISTINCT FROM p_user_id THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF v_reg.status IS DISTINCT FROM 'pending_payment'::public.registration_status THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_PENDING');
  END IF;

  IF v_reg.hold_expires_at IS NULL OR v_reg.hold_expires_at <= pg_catalog.now() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'HOLD_EXPIRED');
  END IF;

  IF NOT yogaflow_private.online_payments_effective(v_reg.tenant_id) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ONLINE_DISABLED');
  END IF;

  SELECT pa.provider_ref, pa.livemode
    INTO v_account_ref, v_livemode
  FROM public.provider_accounts pa
  WHERE pa.tenant_id = v_reg.tenant_id
    AND pa.provider = 'stripe'::public.payment_provider
    AND pa.disconnected_at IS NULL
  ORDER BY pa.created_at DESC
  LIMIT 1;

  IF v_account_ref IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ONLINE_DISABLED');
  END IF;

  SELECT * INTO v_attempt
  FROM public.payment_attempts a
  WHERE a.registration_id = p_registration_id
    AND a.status IN ('initiated', 'processing')
  ORDER BY a.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'attempt_id', v_attempt.id,
      'amount_cents', v_attempt.amount_cents,
      'currency', v_attempt.currency,
      'account_ref', v_account_ref,
      'provider_ref', v_attempt.provider_ref,
      'hold_expires_at', v_reg.hold_expires_at,
      'livemode', v_attempt.livemode
    );
  END IF;

  v_attempt_id := yogaflow_private.create_payment_attempt(
    p_registration_id,
    'stripe'::public.payment_provider,
    v_livemode
  );

  SELECT * INTO v_attempt
  FROM public.payment_attempts
  WHERE id = v_attempt_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'attempt_id', v_attempt.id,
    'amount_cents', v_attempt.amount_cents,
    'currency', v_attempt.currency,
    'account_ref', v_account_ref,
    'provider_ref', v_attempt.provider_ref,
    'hold_expires_at', v_reg.hold_expires_at,
    'livemode', v_attempt.livemode
  );
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.prepare_online_payment(uuid, uuid) IS
  'Checkout: aktiven Versuch zurückgeben oder anlegen. account_ref nur für Edge Function.';

REVOKE ALL ON FUNCTION yogaflow_private.prepare_online_payment(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prepare_online_payment(
  p_registration_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT yogaflow_private.prepare_online_payment(p_registration_id, p_user_id);
$function$;

REVOKE ALL ON FUNCTION public.prepare_online_payment(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_online_payment(uuid, uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 6. attach_payment_ref
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.attach_payment_ref(
  p_attempt_id uuid,
  p_provider_ref text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_row public.payment_attempts%ROWTYPE;
BEGIN
  IF p_provider_ref IS NULL OR pg_catalog.btrim(p_provider_ref) = '' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_REF');
  END IF;

  PERFORM pg_catalog.set_config('yogaflow.allow_payment_attempt_change', 'on', true);

  SELECT * INTO v_row
  FROM public.payment_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_row.provider_ref IS NOT NULL THEN
    IF v_row.provider_ref = p_provider_ref THEN
      RETURN pg_catalog.jsonb_build_object('success', true, 'provider_ref', v_row.provider_ref);
    END IF;
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'REF_ALREADY_SET');
  END IF;

  UPDATE public.payment_attempts
  SET provider_ref = p_provider_ref
  WHERE id = p_attempt_id;

  RETURN pg_catalog.jsonb_build_object('success', true, 'provider_ref', p_provider_ref);
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.attach_payment_ref(uuid, text) IS
  'Setzt provider_ref (pi_…) genau einmal; gleicher Wert idempotent.';

REVOKE ALL ON FUNCTION yogaflow_private.attach_payment_ref(uuid, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.attach_payment_ref(
  p_attempt_id uuid,
  p_provider_ref text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT yogaflow_private.attach_payment_ref(p_attempt_id, p_provider_ref);
$function$;

REVOKE ALL ON FUNCTION public.attach_payment_ref(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_payment_ref(uuid, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 7. check_before_confirm (C10)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.check_before_confirm(
  p_attempt_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_attempt public.payment_attempts%ROWTYPE;
  v_reg public.registrations%ROWTYPE;
BEGIN
  SELECT * INTO v_attempt
  FROM public.payment_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ATTEMPT_NOT_ACTIVE');
  END IF;

  IF v_attempt.status NOT IN ('initiated', 'processing') THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ATTEMPT_NOT_ACTIVE');
  END IF;

  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = v_attempt.registration_id
  FOR UPDATE;

  IF NOT FOUND OR v_reg.user_id IS DISTINCT FROM p_user_id THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF v_reg.status IS DISTINCT FROM 'pending_payment'::public.registration_status THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_PENDING');
  END IF;

  IF v_reg.hold_expires_at IS NULL
     OR v_reg.hold_expires_at <= pg_catalog.now() + interval '1 minute'
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'HOLD_EXPIRED');
  END IF;

  IF v_attempt.status = 'initiated' THEN
    PERFORM yogaflow_private.set_payment_attempt_status(
      p_attempt_id, 'processing', NULL, NULL
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'attempt_id', p_attempt_id,
    'status', 'processing',
    'hold_expires_at', v_reg.hold_expires_at
  );
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.check_before_confirm(uuid, uuid) IS
  'C10: vor Stripe-Confirm — Versuch aktiv, Hold ≥ 1 Min, dann processing.';

REVOKE ALL ON FUNCTION yogaflow_private.check_before_confirm(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_before_confirm(
  p_attempt_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT yogaflow_private.check_before_confirm(p_attempt_id, p_user_id);
$function$;

REVOKE ALL ON FUNCTION public.check_before_confirm(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_before_confirm(uuid, uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 8. complete_online_payment — ein Abschluss-Schritt
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.complete_online_payment(
  p_provider_ref text,
  p_amount_cents integer,
  p_currency text,
  p_received_at timestamptz,
  p_livemode boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_attempt public.payment_attempts%ROWTYPE;
  v_reg public.registrations%ROWTYPE;
  v_course public.courses%ROWTYPE;
  v_existing public.payments%ROWTYPE;
  v_payment_id uuid;
  v_event_id uuid;
  v_new_reg_id uuid;
  v_reason text;
  v_notification_body text;
  v_seat_free boolean;
  v_not_started boolean;
  v_already_booked boolean;
  v_other_id uuid;
BEGIN
  IF p_provider_ref IS NULL OR pg_catalog.btrim(p_provider_ref) = '' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ATTEMPT_NOT_FOUND');
  END IF;

  -- Idempotent: Zahlungszeile mit (stripe, ref) schon da.
  SELECT * INTO v_existing
  FROM public.payments
  WHERE provider = 'stripe'::public.payment_provider
    AND provider_ref = p_provider_ref
  LIMIT 1;

  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'code', 'ALREADY_COMPLETED',
      'payment_id', v_existing.id
    );
  END IF;

  SELECT * INTO v_attempt
  FROM public.payment_attempts
  WHERE provider = 'stripe'::public.payment_provider
    AND provider_ref = p_provider_ref
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ATTEMPT_NOT_FOUND');
  END IF;

  IF v_attempt.livemode IS DISTINCT FROM COALESCE(p_livemode, false) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'LIVEMODE_MISMATCH');
  END IF;

  IF v_attempt.amount_cents IS DISTINCT FROM p_amount_cents
     OR upper(COALESCE(p_currency, '')) IS DISTINCT FROM upper(v_attempt.currency)
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'AMOUNT_MISMATCH');
  END IF;

  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = v_attempt.registration_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ATTEMPT_NOT_FOUND');
  END IF;

  SELECT * INTO v_course
  FROM public.courses
  WHERE id = v_reg.course_id
  FOR UPDATE;

  PERFORM pg_catalog.set_config('yogaflow.allow_payment_attempt_change', 'on', true);

  -- Normalfall (K4): Buchung noch pending_payment — auch bei Versuch failed/canceled.
  IF v_reg.status = 'pending_payment'::public.registration_status THEN
    INSERT INTO public.payments (
      tenant_id,
      subject_type,
      subject_id,
      registration_id,
      provider,
      provider_ref,
      method,
      status,
      amount_cents,
      currency,
      received_at,
      recorded_by
    ) VALUES (
      v_reg.tenant_id,
      'registration',
      v_reg.id,
      v_reg.id,
      'stripe'::public.payment_provider,
      p_provider_ref,
      'card'::public.payment_method,
      'succeeded'::public.payment_status,
      p_amount_cents,
      upper(COALESCE(p_currency, 'EUR')),
      COALESCE(p_received_at, pg_catalog.now()),
      NULL
    )
    RETURNING id INTO v_payment_id;

    IF v_attempt.status IN ('initiated', 'processing') THEN
      UPDATE public.payment_attempts
      SET
        status = 'succeeded',
        payment_id = v_payment_id
      WHERE id = v_attempt.id;
    ELSE
      -- failed/canceled: Status bleibt, nur payment_id (GUC).
      UPDATE public.payment_attempts
      SET payment_id = v_payment_id
      WHERE id = v_attempt.id;
    END IF;

    -- Andere aktive Versuche derselben Buchung → SUPERSEDED.
    FOR v_other_id IN
      SELECT a.id
      FROM public.payment_attempts a
      WHERE a.registration_id = v_reg.id
        AND a.id IS DISTINCT FROM v_attempt.id
        AND a.status IN ('initiated', 'processing')
      ORDER BY a.id
    LOOP
      PERFORM yogaflow_private.set_payment_attempt_status(
        v_other_id, 'canceled', 'SUPERSEDED', NULL
      );
    END LOOP;

    UPDATE public.registrations
    SET
      status = 'registered'::public.registration_status,
      coverage_status = 'paid'::public.registration_coverage_status,
      hold_expires_at = NULL,
      hold_reason = NULL,
      is_waitlist = false,
      waitlist_position = NULL
    WHERE id = v_reg.id;

    v_event_id := yogaflow_private.insert_event(
      v_reg.tenant_id,
      'payment.recorded',
      'payment',
      v_payment_id,
      pg_catalog.jsonb_build_object(
        'payment_id', v_payment_id,
        'registration_id', v_reg.id,
        'amount_cents', p_amount_cents,
        'currency', upper(COALESCE(p_currency, 'EUR')),
        'method', 'card',
        'provider', 'stripe',
        'received_at', COALESCE(p_received_at, pg_catalog.now())
      ),
      pg_catalog.gen_random_uuid()
    );

    PERFORM yogaflow_private.insert_event(
      v_reg.tenant_id,
      'registration.payment_completed',
      'registration',
      v_reg.id,
      pg_catalog.jsonb_build_object(
        'registration_id', v_reg.id,
        'payment_id', v_payment_id,
        'course_id', v_reg.course_id
      ),
      pg_catalog.gen_random_uuid()
    );

    PERFORM yogaflow_private.insert_audit(
      v_reg.tenant_id,
      NULL,
      'payment.recorded',
      'payments',
      v_payment_id,
      ARRAY[
        'amount_cents', 'currency', 'method', 'provider',
        'status', 'received_at', 'registration_id', 'provider_ref'
      ]::text[],
      v_event_id
    );

    PERFORM yogaflow_private.insert_audit(
      v_reg.tenant_id,
      NULL,
      'payment.recorded',
      'registrations',
      v_reg.id,
      ARRAY['status', 'coverage_status', 'hold_expires_at', 'hold_reason']::text[],
      v_event_id
    );

    v_notification_body := pg_catalog.format(
      'Zahlung für „%s“ am %s um %s bestätigt.',
      v_course.title,
      pg_catalog.to_char(v_course.date, 'DD.MM.YYYY'),
      pg_catalog.to_char(v_course.time, 'HH24:MI')
    );

    INSERT INTO public.user_notifications (
      tenant_id, user_id, type, body, course_id, action_path, metadata
    ) VALUES (
      v_reg.tenant_id,
      v_reg.user_id,
      'payment_succeeded',
      v_notification_body,
      v_reg.course_id,
      '/my-registrations',
      pg_catalog.jsonb_build_object(
        'payment_id', v_payment_id,
        'registration_id', v_reg.id
      )
    );

    INSERT INTO public.email_deliveries (
      tenant_id, event_id, kind, registration_id, status, next_attempt_at
    ) VALUES (
      v_reg.tenant_id,
      v_event_id,
      'payment_succeeded',
      v_reg.id,
      'pending',
      pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'code', 'COMPLETED',
      'payment_id', v_payment_id,
      'registration_id', v_reg.id
    );
  END IF;

  -- Spätfall C4/K4: Buchung nicht mehr pending.
  -- Versuch failed wie canceled: Zahlung verbuchen, payment_id setzen, Status bleibt.
  -- payments_immutable: registration_id/subject_id nicht nachträglich änderbar
  -- → Zahlung direkt an neue Buchung (RESTORED) bzw. alte (REFUND_REQUIRED).

  v_not_started := v_course.id IS NOT NULL
    AND v_course.status = 'active'
    AND (v_course.date + COALESCE(v_course.time, TIME '00:00:00'))
          AT TIME ZONE 'Europe/Berlin' > pg_catalog.now();

  -- Doppelzahlung auf dieselbe (schon registered) Buchung → ALREADY_BOOKED.
  v_already_booked := (
      v_reg.status = 'registered'::public.registration_status
      AND v_reg.cancellation_timestamp IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.registrations r
      WHERE r.course_id = v_reg.course_id
        AND r.user_id = v_reg.user_id
        AND r.id IS DISTINCT FROM v_reg.id
        AND r.cancellation_timestamp IS NULL
        AND r.status IN (
          'registered'::public.registration_status,
          'pending_payment'::public.registration_status,
          'waitlist'::public.registration_status
        )
    );

  v_seat_free := yogaflow_private.course_occupied_seats(v_reg.course_id)
    < COALESCE(v_course.max_participants, 0);

  IF v_not_started AND NOT v_already_booked AND v_seat_free THEN
    INSERT INTO public.registrations (
      user_id,
      course_id,
      tenant_id,
      status,
      is_waitlist,
      waitlist_position,
      coverage_status
    ) VALUES (
      v_reg.user_id,
      v_reg.course_id,
      v_reg.tenant_id,
      'registered'::public.registration_status,
      false,
      NULL,
      'paid'::public.registration_coverage_status
    )
    RETURNING id INTO v_new_reg_id;

    INSERT INTO public.payments (
      tenant_id,
      subject_type,
      subject_id,
      registration_id,
      provider,
      provider_ref,
      method,
      status,
      amount_cents,
      currency,
      received_at,
      recorded_by
    ) VALUES (
      v_reg.tenant_id,
      'registration',
      v_new_reg_id,
      v_new_reg_id,
      'stripe'::public.payment_provider,
      p_provider_ref,
      'card'::public.payment_method,
      'succeeded'::public.payment_status,
      p_amount_cents,
      upper(COALESCE(p_currency, 'EUR')),
      COALESCE(p_received_at, pg_catalog.now()),
      NULL
    )
    RETURNING id INTO v_payment_id;

    IF v_attempt.status IN ('initiated', 'processing') THEN
      UPDATE public.payment_attempts
      SET
        status = 'canceled',
        failure_code = COALESCE(failure_code, 'HOLD_EXPIRED'),
        payment_id = v_payment_id
      WHERE id = v_attempt.id;
    ELSE
      UPDATE public.payment_attempts
      SET payment_id = v_payment_id
      WHERE id = v_attempt.id;
    END IF;

    v_event_id := yogaflow_private.insert_event(
      v_reg.tenant_id,
      'payment.recorded',
      'payment',
      v_payment_id,
      pg_catalog.jsonb_build_object(
        'payment_id', v_payment_id,
        'registration_id', v_new_reg_id,
        'amount_cents', p_amount_cents,
        'currency', upper(COALESCE(p_currency, 'EUR')),
        'method', 'card',
        'provider', 'stripe',
        'received_at', COALESCE(p_received_at, pg_catalog.now())
      ),
      pg_catalog.gen_random_uuid()
    );

    PERFORM yogaflow_private.insert_audit(
      v_reg.tenant_id,
      NULL,
      'payment.recorded',
      'payments',
      v_payment_id,
      ARRAY[
        'amount_cents', 'currency', 'method', 'provider',
        'status', 'received_at', 'registration_id', 'provider_ref'
      ]::text[],
      v_event_id
    );

    PERFORM yogaflow_private.insert_event(
      v_reg.tenant_id,
      'registration.restored_after_payment',
      'registration',
      v_new_reg_id,
      pg_catalog.jsonb_build_object(
        'registration_id', v_new_reg_id,
        'payment_id', v_payment_id,
        'previous_registration_id', v_reg.id,
        'course_id', v_reg.course_id
      ),
      pg_catalog.gen_random_uuid()
    );

    v_notification_body := pg_catalog.format(
      'Zahlung für „%s“ am %s um %s bestätigt.',
      v_course.title,
      pg_catalog.to_char(v_course.date, 'DD.MM.YYYY'),
      pg_catalog.to_char(v_course.time, 'HH24:MI')
    );

    INSERT INTO public.user_notifications (
      tenant_id, user_id, type, body, course_id, action_path, metadata
    ) VALUES (
      v_reg.tenant_id,
      v_reg.user_id,
      'payment_succeeded',
      v_notification_body,
      v_reg.course_id,
      '/my-registrations',
      pg_catalog.jsonb_build_object(
        'payment_id', v_payment_id,
        'registration_id', v_new_reg_id
      )
    );

    INSERT INTO public.email_deliveries (
      tenant_id, event_id, kind, registration_id, status, next_attempt_at
    ) VALUES (
      v_reg.tenant_id,
      v_event_id,
      'payment_succeeded',
      v_new_reg_id,
      'pending',
      pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'code', 'RESTORED',
      'payment_id', v_payment_id,
      'registration_id', v_new_reg_id
    );
  END IF;

  IF NOT v_not_started THEN
    v_reason := 'COURSE_NOT_ACTIVE';
  ELSIF v_already_booked THEN
    v_reason := 'ALREADY_BOOKED';
  ELSE
    v_reason := 'NO_SEAT';
  END IF;

  INSERT INTO public.payments (
    tenant_id,
    subject_type,
    subject_id,
    registration_id,
    provider,
    provider_ref,
    method,
    status,
    amount_cents,
    currency,
    received_at,
    recorded_by
  ) VALUES (
    v_reg.tenant_id,
    'registration',
    v_reg.id,
    v_reg.id,
    'stripe'::public.payment_provider,
    p_provider_ref,
    'card'::public.payment_method,
    'succeeded'::public.payment_status,
    p_amount_cents,
    upper(COALESCE(p_currency, 'EUR')),
    COALESCE(p_received_at, pg_catalog.now()),
    NULL
  )
  RETURNING id INTO v_payment_id;

  IF v_attempt.status IN ('initiated', 'processing') THEN
    UPDATE public.payment_attempts
    SET
      status = 'canceled',
      failure_code = COALESCE(failure_code, 'HOLD_EXPIRED'),
      payment_id = v_payment_id
    WHERE id = v_attempt.id;
  ELSE
    UPDATE public.payment_attempts
    SET payment_id = v_payment_id
    WHERE id = v_attempt.id;
  END IF;

  v_event_id := yogaflow_private.insert_event(
    v_reg.tenant_id,
    'payment.recorded',
    'payment',
    v_payment_id,
    pg_catalog.jsonb_build_object(
      'payment_id', v_payment_id,
      'registration_id', v_reg.id,
      'amount_cents', p_amount_cents,
      'currency', upper(COALESCE(p_currency, 'EUR')),
      'method', 'card',
      'provider', 'stripe',
      'received_at', COALESCE(p_received_at, pg_catalog.now())
    ),
    pg_catalog.gen_random_uuid()
  );

  PERFORM yogaflow_private.insert_audit(
    v_reg.tenant_id,
    NULL,
    'payment.recorded',
    'payments',
    v_payment_id,
    ARRAY[
      'amount_cents', 'currency', 'method', 'provider',
      'status', 'received_at', 'registration_id', 'provider_ref'
    ]::text[],
    v_event_id
  );

  PERFORM yogaflow_private.insert_event(
    v_reg.tenant_id,
    'payment.refund_required',
    'payment',
    v_payment_id,
    pg_catalog.jsonb_build_object(
      'payment_id', v_payment_id,
      'registration_id', v_reg.id,
      'course_id', v_reg.course_id,
      'reason', v_reason
    ),
    pg_catalog.gen_random_uuid()
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'code', 'REFUND_REQUIRED',
    'payment_id', v_payment_id,
    'reason', v_reason
  );
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.complete_online_payment(text, integer, text, timestamptz, boolean) IS
  'Ein Abschluss: COMPLETED (auch nach failed, K4) / RESTORED / REFUND_REQUIRED / ALREADY_COMPLETED. Andere aktive Versuche → SUPERSEDED.';

REVOKE ALL ON FUNCTION yogaflow_private.complete_online_payment(text, integer, text, timestamptz, boolean)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.complete_online_payment(
  p_provider_ref text,
  p_amount_cents integer,
  p_currency text,
  p_received_at timestamptz,
  p_livemode boolean
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT yogaflow_private.complete_online_payment(
    p_provider_ref, p_amount_cents, p_currency, p_received_at, p_livemode
  );
$function$;

REVOKE ALL ON FUNCTION public.complete_online_payment(text, integer, text, timestamptz, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_online_payment(text, integer, text, timestamptz, boolean)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 9. record_online_refund
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.record_online_refund(
  p_payment_id uuid,
  p_refund_ref text,
  p_amount_cents integer,
  p_received_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_orig public.payments%ROWTYPE;
  v_existing public.payments%ROWTYPE;
  v_reg public.registrations%ROWTYPE;
  v_course public.courses%ROWTYPE;
  v_new_id uuid;
  v_amount integer;
  v_event_id uuid;
  v_notification_body text;
BEGIN
  IF p_refund_ref IS NULL OR pg_catalog.btrim(p_refund_ref) = '' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_REF');
  END IF;

  SELECT * INTO v_existing
  FROM public.payments
  WHERE provider = 'stripe'::public.payment_provider
    AND provider_ref = p_refund_ref
  LIMIT 1;

  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'code', 'ALREADY_REFUNDED',
      'payment_id', v_existing.id
    );
  END IF;

  SELECT * INTO v_orig
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_orig.provider IS DISTINCT FROM 'stripe'::public.payment_provider
     OR v_orig.reverses_payment_id IS NOT NULL
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payments rev WHERE rev.reverses_payment_id = v_orig.id
  ) THEN
    SELECT * INTO v_existing
    FROM public.payments
    WHERE reverses_payment_id = v_orig.id
    LIMIT 1;
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'code', 'ALREADY_REFUNDED',
      'payment_id', v_existing.id
    );
  END IF;

  v_amount := -GREATEST(COALESCE(p_amount_cents, v_orig.amount_cents), 0);
  IF v_amount >= 0 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
  END IF;
  IF abs(v_amount) > v_orig.amount_cents THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
  END IF;

  INSERT INTO public.payments (
    tenant_id,
    subject_type,
    subject_id,
    registration_id,
    provider,
    provider_ref,
    method,
    status,
    amount_cents,
    currency,
    reverses_payment_id,
    received_at,
    recorded_by
  ) VALUES (
    v_orig.tenant_id,
    v_orig.subject_type,
    v_orig.subject_id,
    v_orig.registration_id,
    'stripe'::public.payment_provider,
    p_refund_ref,
    v_orig.method,
    'succeeded'::public.payment_status,
    v_amount,
    v_orig.currency,
    v_orig.id,
    COALESCE(p_received_at, pg_catalog.now()),
    NULL
  )
  RETURNING id INTO v_new_id;

  v_event_id := yogaflow_private.insert_event(
    v_orig.tenant_id,
    'payment.reversed',
    'payment',
    v_new_id,
    pg_catalog.jsonb_build_object(
      'payment_id', v_new_id,
      'registration_id', v_orig.registration_id,
      'amount_cents', v_amount,
      'currency', v_orig.currency,
      'method', v_orig.method::text,
      'provider', 'stripe',
      'received_at', COALESCE(p_received_at, pg_catalog.now()),
      'reverses_payment_id', v_orig.id
    ),
    pg_catalog.gen_random_uuid()
  );

  PERFORM yogaflow_private.insert_audit(
    v_orig.tenant_id,
    NULL,
    'payment.reversed',
    'payments',
    v_new_id,
    ARRAY[
      'amount_cents', 'method', 'status', 'reverses_payment_id',
      'received_at', 'provider_ref'
    ]::text[],
    v_event_id
  );

  IF v_orig.registration_id IS NOT NULL THEN
    SELECT * INTO v_reg FROM public.registrations WHERE id = v_orig.registration_id;
    IF v_reg.id IS NOT NULL THEN
      SELECT * INTO v_course FROM public.courses WHERE id = v_reg.course_id;
      IF v_course.id IS NOT NULL THEN
        v_notification_body := pg_catalog.format(
          'Erstattung für „%s“ am %s um %s ist unterwegs.',
          v_course.title,
          pg_catalog.to_char(v_course.date, 'DD.MM.YYYY'),
          pg_catalog.to_char(v_course.time, 'HH24:MI')
        );

        INSERT INTO public.user_notifications (
          tenant_id, user_id, type, body, course_id, action_path, metadata
        ) VALUES (
          v_orig.tenant_id,
          v_reg.user_id,
          'payment_refunded',
          v_notification_body,
          v_reg.course_id,
          '/my-registrations',
          pg_catalog.jsonb_build_object(
            'payment_id', v_new_id,
            'reverses_payment_id', v_orig.id
          )
        );
      END IF;
    END IF;

    INSERT INTO public.email_deliveries (
      tenant_id, event_id, kind, registration_id, status, next_attempt_at
    ) VALUES (
      v_orig.tenant_id,
      v_event_id,
      'payment_refunded',
      v_orig.registration_id,
      'pending',
      pg_catalog.now()
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'code', 'REFUNDED',
    'payment_id', v_new_id,
    'amount_cents', v_amount
  );
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.record_online_refund(uuid, text, integer, timestamptz) IS
  'Gegenzeile re_…; Event payment.reversed; Outbox payment_refunded; Glocke.';

REVOKE ALL ON FUNCTION yogaflow_private.record_online_refund(uuid, text, integer, timestamptz)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_online_refund(
  p_payment_id uuid,
  p_refund_ref text,
  p_amount_cents integer,
  p_received_at timestamptz
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT yogaflow_private.record_online_refund(
    p_payment_id, p_refund_ref, p_amount_cents, p_received_at
  );
$function$;

REVOKE ALL ON FUNCTION public.record_online_refund(uuid, text, integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_online_refund(uuid, text, integer, timestamptz)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 10. mark_online_payment_failed
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.mark_online_payment_failed(
  p_provider_ref text,
  p_failure_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_attempt public.payment_attempts%ROWTYPE;
  v_code text;
BEGIN
  IF p_provider_ref IS NULL OR pg_catalog.btrim(p_provider_ref) = '' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ATTEMPT_NOT_FOUND');
  END IF;

  SELECT * INTO v_attempt
  FROM public.payment_attempts
  WHERE provider = 'stripe'::public.payment_provider
    AND provider_ref = p_provider_ref
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ATTEMPT_NOT_FOUND');
  END IF;

  IF v_attempt.status IN ('failed', 'canceled', 'succeeded') THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'status', v_attempt.status,
      'attempt_id', v_attempt.id
    );
  END IF;

  v_code := CASE
    WHEN p_failure_code ~ '^[A-Z_]{3,64}$' THEN p_failure_code
    ELSE 'PAYMENT_FAILED'
  END;

  PERFORM yogaflow_private.set_payment_attempt_status(
    v_attempt.id, 'failed', v_code, NULL
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'status', 'failed',
    'attempt_id', v_attempt.id,
    'failure_code', v_code
  );
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.mark_online_payment_failed(text, text) IS
  'Versuch → failed; Reservierung bleibt. Schon Endzustand → ok ohne Wirkung.';

REVOKE ALL ON FUNCTION yogaflow_private.mark_online_payment_failed(text, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_online_payment_failed(
  p_provider_ref text,
  p_failure_code text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT yogaflow_private.mark_online_payment_failed(p_provider_ref, p_failure_code);
$function$;

REVOKE ALL ON FUNCTION public.mark_online_payment_failed(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_online_payment_failed(text, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 11. Selbstprüfung
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_def text;
  v_priv text;
  v_fn text;
  v_names text[] := ARRAY[
    'prepare_online_payment',
    'attach_payment_ref',
    'check_before_confirm',
    'complete_online_payment',
    'record_online_refund',
    'mark_online_payment_failed'
  ];
BEGIN
  IF yogaflow_private.ledger_money_account('card'::public.payment_method)
     IS DISTINCT FROM 'psp_clearing'
  THEN
    RAISE EXCEPTION 'Selbstprüfung: ledger_money_account(card) != psp_clearing';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'register_for_course';

  IF v_def IS NULL
     OR v_def NOT LIKE '%online_payment_required%'
     OR v_def NOT LIKE '%create_pending_registration%'
  THEN
    RAISE EXCEPTION 'Selbstprüfung: register_for_course ohne Online-Pflicht-Pfad';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'yogaflow_private' AND p.proname = 'payment_attempts_guard';

  IF v_def IS NULL
     OR v_def NOT LIKE '%succeeded nur über Abschluss%'
     OR v_def NOT LIKE '%allow_payment_attempt_change%'
  THEN
    RAISE EXCEPTION 'Selbstprüfung: Guard ohne succeeded+GUC-Regel';
  END IF;
  -- Probelauf mit echten Zeilen weggelassen (bräuchte Fixture-FKs); Regel im Quelltext geprüft.

  FOREACH v_fn IN ARRAY v_names LOOP
    SELECT p.prosecdef::text,
           pg_get_functiondef(p.oid)
      INTO v_priv, v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'yogaflow_private' AND p.proname = v_fn
    LIMIT 1;

    IF v_priv IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Selbstprüfung: % nicht SECURITY DEFINER', v_fn;
    END IF;
    IF v_def NOT LIKE '%SET search_path TO ''''%'
       AND v_def NOT LIKE '%SET search_path = ''''%'
    THEN
      RAISE EXCEPTION 'Selbstprüfung: % search_path nicht leer', v_fn;
    END IF;

    IF has_function_privilege('anon', (
         SELECT p.oid FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = v_fn
         LIMIT 1
       ), 'EXECUTE')
       OR has_function_privilege('authenticated', (
         SELECT p.oid FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = v_fn
         LIMIT 1
       ), 'EXECUTE')
    THEN
      RAISE EXCEPTION 'Selbstprüfung: public.% ausführbar für anon/authenticated', v_fn;
    END IF;
  END LOOP;
END;
$$;
