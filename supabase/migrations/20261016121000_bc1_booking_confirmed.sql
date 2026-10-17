-- BC-1: Buchungsbestätigung ohne Online-Zahlung (booking_confirmed) + AGB-Vorlage v3.
-- allow: enqueue_booking_confirmed,trg_maybe_enqueue_booking_confirmed,register_for_course,promote_from_waitlist,admin_register_user_for_course
--
-- Soft-Cancel (A1): Abmelden setzt status=cancelled; erneute Buchung legt eine
-- neue registrations-Zeile an (partieller Unique nur für aktive Status).
-- Daher reicht Unique auf (registration_id) WHERE kind='booking_confirmed'.
--
-- Enqueue nur wenn RPC set_config('yogaflow.enqueue_booking_confirmed','on')
-- gesetzt hat — Seeds/Service-INSERTs und Online-Fulfillment (coverage=paid)
-- erzeugen keine Zeile. Kein Backfill.

-- ---------------------------------------------------------------------------
-- 1. Outbox: kind + Shape + Unique
-- ---------------------------------------------------------------------------

ALTER TABLE public.email_deliveries
  DROP CONSTRAINT IF EXISTS email_deliveries_kind_check;

ALTER TABLE public.email_deliveries
  ADD CONSTRAINT email_deliveries_kind_check
  CHECK (kind IN (
    'waitlist_promoted_payment_required',
    'payment_succeeded',
    'payment_refunded',
    'booking_confirmed',
    'pass_purchased',
    'pass_expiring_30',
    'pass_expiring_7',
    'pass_units_low',
    'pass_withdrawal_received',
    'pass_withdrawal_refunded'
  ));

ALTER TABLE public.email_deliveries
  DROP CONSTRAINT IF EXISTS email_deliveries_subject_shape_check;

ALTER TABLE public.email_deliveries
  ADD CONSTRAINT email_deliveries_subject_shape_check
  CHECK (
    (
      kind IN (
        'waitlist_promoted_payment_required',
        'payment_succeeded',
        'payment_refunded',
        'booking_confirmed'
      )
      AND registration_id IS NOT NULL
      AND pass_id IS NULL
    )
    OR (
      kind IN (
        'pass_purchased',
        'pass_expiring_30',
        'pass_expiring_7',
        'pass_units_low',
        'pass_withdrawal_received',
        'pass_withdrawal_refunded'
      )
      AND pass_id IS NOT NULL
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS email_deliveries_booking_confirmed_reg_unique
  ON public.email_deliveries (registration_id)
  WHERE (kind = 'booking_confirmed');

-- ---------------------------------------------------------------------------
-- 2. Enqueue-Helfer
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.enqueue_booking_confirmed(p_registration_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_reg public.registrations%ROWTYPE;
  v_event uuid;
BEGIN
  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = p_registration_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_reg.status IS DISTINCT FROM 'registered'::public.registration_status
     OR v_reg.cancellation_timestamp IS NOT NULL
  THEN
    RETURN;
  END IF;

  -- Online-Zahlung: Fulfillment setzt registered+paid und schreibt payment_succeeded.
  IF v_reg.coverage_status IS NOT DISTINCT FROM 'paid'::public.registration_coverage_status THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.email_deliveries d
    WHERE d.kind = 'booking_confirmed'
      AND d.registration_id = p_registration_id
  ) THEN
    RETURN;
  END IF;

  v_event := yogaflow_private.insert_event(
    v_reg.tenant_id,
    'booking.confirmed',
    'registration',
    p_registration_id,
    pg_catalog.jsonb_build_object(
      'registration_id', p_registration_id,
      'coverage_status', v_reg.coverage_status,
      'price_cents_at_booking', v_reg.price_cents_at_booking
    ),
    p_registration_id
  );

  BEGIN
    INSERT INTO public.email_deliveries (
      tenant_id, event_id, kind, registration_id, status, next_attempt_at
    ) VALUES (
      v_reg.tenant_id,
      v_event,
      'booking_confirmed',
      p_registration_id,
      'pending',
      pg_catalog.now()
    )
    ON CONFLICT (registration_id) WHERE (kind = 'booking_confirmed')
    DO NOTHING;
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.enqueue_booking_confirmed(uuid) IS
  'BC-1: Outbox booking_confirmed (höchstens eine Zeile je registration_id).';

REVOKE ALL ON FUNCTION yogaflow_private.enqueue_booking_confirmed(uuid)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Trigger (nur mit Session-Schalter aus Buchungs-RPCs)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.trg_maybe_enqueue_booking_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF COALESCE(
    pg_catalog.current_setting('yogaflow.enqueue_booking_confirmed', true),
    'off'
  ) IS DISTINCT FROM 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM 'registered'::public.registration_status
     OR NEW.cancellation_timestamp IS NOT NULL
     OR NEW.coverage_status IS NOT DISTINCT FROM 'paid'::public.registration_coverage_status
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT'
     OR (
       TG_OP = 'UPDATE'
       AND OLD.status IS DISTINCT FROM 'registered'::public.registration_status
     )
  THEN
    PERFORM yogaflow_private.enqueue_booking_confirmed(NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.trg_maybe_enqueue_booking_confirmed()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS registrations_enqueue_booking_confirmed
  ON public.registrations;
CREATE TRIGGER registrations_enqueue_booking_confirmed
  AFTER INSERT OR UPDATE OF status
  ON public.registrations
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.trg_maybe_enqueue_booking_confirmed();

-- ---------------------------------------------------------------------------
-- 4. Session-Schalter in Buchungs-RPCs (Live-Körper + eine Zeile)
-- ---------------------------------------------------------------------------

DO $patch$
DECLARE
  v_def text;
BEGIN
  -- register_for_course
  v_def := pg_catalog.pg_get_functiondef(
    'public.register_for_course(uuid, boolean, text)'::regprocedure
  );
  IF position('yogaflow.enqueue_booking_confirmed' IN v_def) = 0 THEN
    IF position(
      E'BEGIN\n  IF v_user_id IS NULL THEN' IN v_def
    ) = 0 THEN
      RAISE EXCEPTION 'BC-1: register_for_course Anker fehlt';
    END IF;
    v_def := replace(
      v_def,
      E'BEGIN\n  IF v_user_id IS NULL THEN',
      E'BEGIN\n  PERFORM pg_catalog.set_config(''yogaflow.enqueue_booking_confirmed'', ''on'', true);\n\n  IF v_user_id IS NULL THEN'
    );
    EXECUTE v_def;
  END IF;

  -- promote_from_waitlist
  v_def := pg_catalog.pg_get_functiondef(
    'public.promote_from_waitlist(uuid)'::regprocedure
  );
  IF position('yogaflow.enqueue_booking_confirmed' IN v_def) = 0 THEN
    IF position(
      E'BEGIN\n  SELECT max_participants, title, date, time, price, tenant_id, status' IN v_def
    ) = 0 THEN
      RAISE EXCEPTION 'BC-1: promote_from_waitlist Anker fehlt';
    END IF;
    v_def := replace(
      v_def,
      E'BEGIN\n  SELECT max_participants, title, date, time, price, tenant_id, status',
      E'BEGIN\n  PERFORM pg_catalog.set_config(''yogaflow.enqueue_booking_confirmed'', ''on'', true);\n\n  SELECT max_participants, title, date, time, price, tenant_id, status'
    );
    EXECUTE v_def;
  END IF;

  -- admin_register_user_for_course
  v_def := pg_catalog.pg_get_functiondef(
    'public.admin_register_user_for_course(uuid, uuid, text)'::regprocedure
  );
  IF position('yogaflow.enqueue_booking_confirmed' IN v_def) = 0 THEN
    IF position(
      E'BEGIN\n  v_actor_id := yogaflow_private.get_my_member_id();' IN v_def
    ) = 0 THEN
      RAISE EXCEPTION 'BC-1: admin_register Anker fehlt';
    END IF;
    v_def := replace(
      v_def,
      E'BEGIN\n  v_actor_id := yogaflow_private.get_my_member_id();',
      E'BEGIN\n  PERFORM pg_catalog.set_config(''yogaflow.enqueue_booking_confirmed'', ''on'', true);\n\n  v_actor_id := yogaflow_private.get_my_member_id();'
    );
    EXECUTE v_def;
  END IF;
END;
$patch$;

-- ---------------------------------------------------------------------------
-- 5. AGB-Vorlage v3 als aktuelle Studio-Vorlage (Banner L3; keine Auto-Freigabe)
-- ---------------------------------------------------------------------------

INSERT INTO public.legal_document_versions (document, version, content_hash)
VALUES (
  'studio_terms_tpl',
  '2026-10-16',
  '156ee1c13e1ea1b839a5adaf48a502e67f14115b29eba4e12f2dbae40ce04f18'
)
ON CONFLICT (document) DO UPDATE
SET
  version = EXCLUDED.version,
  content_hash = EXCLUDED.content_hash,
  updated_at = pg_catalog.now();

-- ---------------------------------------------------------------------------
-- 6. Self-check
-- ---------------------------------------------------------------------------

DO $check$
DECLARE
  v_def text;
BEGIN
  IF to_regprocedure('yogaflow_private.enqueue_booking_confirmed(uuid)') IS NULL THEN
    RAISE EXCEPTION 'BC-1: enqueue_booking_confirmed fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'email_deliveries_booking_confirmed_reg_unique'
  ) THEN
    RAISE EXCEPTION 'BC-1: Unique-Index fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.legal_document_versions
    WHERE document = 'studio_terms_tpl'
      AND version = '2026-10-16'
      AND content_hash = '156ee1c13e1ea1b839a5adaf48a502e67f14115b29eba4e12f2dbae40ce04f18'
  ) THEN
    RAISE EXCEPTION 'BC-1: studio_terms_tpl v3 Hash falsch';
  END IF;

  v_def := pg_catalog.pg_get_functiondef(
    'public.register_for_course(uuid, boolean, text)'::regprocedure
  );
  IF position('yogaflow.enqueue_booking_confirmed' IN v_def) = 0 THEN
    RAISE EXCEPTION 'BC-1: register_for_course ohne Schalter';
  END IF;

  v_def := pg_catalog.pg_get_functiondef(
    'public.promote_from_waitlist(uuid)'::regprocedure
  );
  IF position('yogaflow.enqueue_booking_confirmed' IN v_def) = 0 THEN
    RAISE EXCEPTION 'BC-1: promote_from_waitlist ohne Schalter';
  END IF;

  v_def := pg_catalog.pg_get_functiondef(
    'public.admin_register_user_for_course(uuid, uuid, text)'::regprocedure
  );
  IF position('yogaflow.enqueue_booking_confirmed' IN v_def) = 0 THEN
    RAISE EXCEPTION 'BC-1: admin_register ohne Schalter';
  END IF;

  IF has_function_privilege(
    'anon', 'yogaflow_private.enqueue_booking_confirmed(uuid)', 'EXECUTE'
  ) OR has_function_privilege(
    'authenticated', 'yogaflow_private.enqueue_booking_confirmed(uuid)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'BC-1: enqueue_booking_confirmed darf nicht für anon/authenticated';
  END IF;
END;
$check$;
