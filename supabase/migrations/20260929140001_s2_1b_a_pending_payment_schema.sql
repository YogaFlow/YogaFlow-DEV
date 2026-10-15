-- 2.1b-a — pending_payment, payment_attempts, zentrale Platzzählung, Expire-Job.
--
-- Bezug: Inventur 2.1b, Entscheidungen R1–R10 (Julius 29.09.2026).
-- Enum-Wert kommt aus 20260929140000; hier erst Nutzung.
--
-- Bewusst nicht: E2-Verzweigung in promote_from_waitlist (2.1b-b),
-- succeeded→payments (2.2a), Stripe, Hauptbuch-card-Fix.
--
-- Rückweg (nach dieser Datei; Enum-Wert bleibt ungenutzt):
--   SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'yogaflow_expire_payment_holds';
--   DROP FUNCTION IF EXISTS public.expire_payment_holds();
--   DROP FUNCTION IF EXISTS yogaflow_private.expire_payment_holds();
--   DROP FUNCTION IF EXISTS public.create_payment_attempt(uuid, public.payment_provider, boolean);
--   DROP FUNCTION IF EXISTS yogaflow_private.create_payment_attempt(uuid, public.payment_provider, boolean);
--   DROP FUNCTION IF EXISTS public.create_pending_registration(uuid, uuid, text, timestamptz);
--   DROP FUNCTION IF EXISTS yogaflow_private.create_pending_registration(uuid, uuid, text, timestamptz);
--   DROP FUNCTION IF EXISTS public.set_payment_attempt_status(uuid, text, text, text);
--   DROP FUNCTION IF EXISTS yogaflow_private.set_payment_attempt_status(uuid, text, text, text);
--   DROP FUNCTION IF EXISTS yogaflow_private.cancel_payment_attempts_for_registration(uuid, text);
--   DROP FUNCTION IF EXISTS public.online_payment_required(uuid);
--   DROP FUNCTION IF EXISTS public.online_payments_effective(uuid);
--   DROP FUNCTION IF EXISTS yogaflow_private.online_payment_required(uuid);
--   DROP FUNCTION IF EXISTS yogaflow_private.online_payments_effective(uuid);
--   DROP FUNCTION IF EXISTS yogaflow_private.course_occupied_seats(uuid);
--   DROP TRIGGER IF EXISTS payment_attempts_guard ON public.payment_attempts;
--   DROP TRIGGER IF EXISTS payment_attempts_no_delete ON public.payment_attempts;
--   DROP FUNCTION IF EXISTS yogaflow_private.payment_attempts_guard();
--   DROP FUNCTION IF EXISTS yogaflow_private.payment_attempts_no_delete();
--   DROP TABLE IF EXISTS public.payment_attempts;
--   DROP INDEX IF EXISTS public.payments_provider_ref_unique;
--   -- Vorherige Funktionskörper aus 20260928* wiederherstellen.
--   DROP INDEX IF EXISTS public.registrations_pending_hold_expires_idx;
--   DROP INDEX IF EXISTS public.registrations_active_course_user_key;
--   CREATE UNIQUE INDEX registrations_active_course_user_key
--     ON public.registrations (course_id, user_id)
--     WHERE status IN ('registered', 'waitlist');
--   ALTER TABLE public.registrations DROP CONSTRAINT IF EXISTS registrations_pending_hold,
--     DROP CONSTRAINT IF EXISTS registrations_pending_open,
--     DROP CONSTRAINT IF EXISTS registrations_hold_reason_check,
--     DROP CONSTRAINT IF EXISTS registrations_cancel_reason_check;
--   -- cancel_reason-CHECK ohne payment_expired wiederherstellen (4.3-Fassung).
--   DROP TRIGGER IF EXISTS registrations_set_cancelled_from_status ON public.registrations;
--   DROP FUNCTION IF EXISTS yogaflow_private.registrations_set_cancelled_from_status();
--   ALTER TABLE public.registrations
--     DROP COLUMN IF EXISTS hold_expires_at,
--     DROP COLUMN IF EXISTS hold_reason,
--     DROP COLUMN IF EXISTS cancelled_from_status;

-- ===========================================================================
-- 1. registrations: Hold-Spalten, cancelled_from_status, CHECKs, Indizes
-- ===========================================================================

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS hold_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_from_status public.registration_status;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registrations_hold_reason_check'
      AND conrelid = 'public.registrations'::regclass
  ) THEN
    ALTER TABLE public.registrations
      ADD CONSTRAINT registrations_hold_reason_check
      CHECK (
        hold_reason IS NULL
        OR hold_reason IN ('checkout', 'promotion')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registrations_pending_hold'
      AND conrelid = 'public.registrations'::regclass
  ) THEN
    ALTER TABLE public.registrations
      ADD CONSTRAINT registrations_pending_hold
      CHECK (
        status <> 'pending_payment'::public.registration_status
        OR (hold_expires_at IS NOT NULL AND hold_reason IS NOT NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registrations_pending_open'
      AND conrelid = 'public.registrations'::regclass
  ) THEN
    ALTER TABLE public.registrations
      ADD CONSTRAINT registrations_pending_open
      CHECK (
        status <> 'pending_payment'::public.registration_status
        OR coverage_status = 'open'::public.registration_coverage_status
      );
  END IF;
END;
$$;

ALTER TABLE public.registrations
  DROP CONSTRAINT IF EXISTS registrations_cancel_reason_check;

ALTER TABLE public.registrations
  ADD CONSTRAINT registrations_cancel_reason_check
  CHECK (
    cancel_reason IS NULL
    OR cancel_reason IN (
      'participant',
      'studio',
      'course_cancelled',
      'promotion_expired',
      'payment_expired',
      'role_change',
      'legacy_closed',
      'member_removed'
    )
  );

DROP INDEX IF EXISTS public.registrations_active_course_user_key;
CREATE UNIQUE INDEX registrations_active_course_user_key
  ON public.registrations (course_id, user_id)
  WHERE status IN (
    'registered'::public.registration_status,
    'waitlist'::public.registration_status,
    'pending_payment'::public.registration_status
  );

CREATE INDEX IF NOT EXISTS registrations_pending_hold_expires_idx
  ON public.registrations (hold_expires_at)
  WHERE status = 'pending_payment'::public.registration_status;

COMMENT ON COLUMN public.registrations.hold_expires_at IS
  'Ablauf der Reservierung bei pending_payment. Bleibt nach Übergang erhalten (Verlauf).';
COMMENT ON COLUMN public.registrations.hold_reason IS
  'checkout | promotion. Bleibt nach Übergang erhalten (Verlauf).';
COMMENT ON COLUMN public.registrations.cancelled_from_status IS
  'Status vor dem Übergang nach cancelled. NULL = Altbestand / unbekannt. Für uncancel (R5).';

CREATE OR REPLACE FUNCTION yogaflow_private.registrations_set_cancelled_from_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.status = 'cancelled'::public.registration_status
     AND OLD.status IS DISTINCT FROM 'cancelled'::public.registration_status
  THEN
    NEW.cancelled_from_status := OLD.status;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS registrations_set_cancelled_from_status ON public.registrations;
CREATE TRIGGER registrations_set_cancelled_from_status
  BEFORE UPDATE OF status ON public.registrations
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.registrations_set_cancelled_from_status();

REVOKE ALL ON FUNCTION yogaflow_private.registrations_set_cancelled_from_status()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS promote_waitlist_after_registered_cancel ON public.registrations;
CREATE TRIGGER promote_waitlist_after_registered_cancel
  AFTER UPDATE OF status ON public.registrations
  FOR EACH ROW
  WHEN (
    OLD.status IN (
      'registered'::public.registration_status,
      'pending_payment'::public.registration_status
    )
    AND NEW.status = 'cancelled'::public.registration_status
  )
  EXECUTE FUNCTION public.trg_promote_waitlist_after_registered_delete();

-- ===========================================================================
-- 2. Zentrale Platzzählung (R7)
-- ===========================================================================

CREATE OR REPLACE FUNCTION yogaflow_private.course_occupied_seats(p_course uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(pg_catalog.count(*), 0)::integer
  FROM public.registrations r
  WHERE r.course_id = p_course
    AND r.status IN (
      'registered'::public.registration_status,
      'pending_payment'::public.registration_status
    )
    AND r.is_waitlist = false
    AND r.cancellation_timestamp IS NULL;
$function$;

COMMENT ON FUNCTION yogaflow_private.course_occupied_seats(uuid) IS
  'Belegte Plätze: registered und pending_payment (R1). Warteliste zählt nicht.';

REVOKE ALL ON FUNCTION yogaflow_private.course_occupied_seats(uuid)
  FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 3. P10-Helfer (R10)
-- ===========================================================================

CREATE OR REPLACE FUNCTION yogaflow_private.online_payments_effective(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT yogaflow_private.platform_flag('online_payments')
     AND COALESCE(
       (SELECT s.online_payments_enabled
          FROM public.tenant_payment_settings s
         WHERE s.tenant_id = p_tenant),
       false
     );
$function$;

COMMENT ON FUNCTION yogaflow_private.online_payments_effective(uuid) IS
  'P10: Plattform- und Studio-Schalter beide an. Vorgezogen aus 2.2 für 2.1b.';

REVOKE ALL ON FUNCTION yogaflow_private.online_payments_effective(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION yogaflow_private.online_payment_required(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT yogaflow_private.online_payments_effective(p_tenant)
     AND NOT COALESCE(
       (SELECT s.allow_onsite_payment
          FROM public.tenant_payment_settings s
         WHERE s.tenant_id = p_tenant),
       true
     );
$function$;

COMMENT ON FUNCTION yogaflow_private.online_payment_required(uuid) IS
  'Online wirksam an und Vor-Ort aus (P9/P10).';

REVOKE ALL ON FUNCTION yogaflow_private.online_payment_required(uuid)
  FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 4. Tabelle payment_attempts (Variante D)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  subject_type text NOT NULL,
  registration_id uuid REFERENCES public.registrations (id) ON DELETE RESTRICT,
  provider public.payment_provider NOT NULL,
  provider_ref text,
  method public.payment_method NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  status text NOT NULL,
  failure_code text,
  idempotency_key text NOT NULL,
  payment_id uuid REFERENCES public.payments (id) ON DELETE RESTRICT,
  livemode boolean NOT NULL,
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_attempts_subject_type_check
    CHECK (subject_type IN ('registration')),
  CONSTRAINT payment_attempts_registration_subject_check
    CHECK ((subject_type = 'registration') = (registration_id IS NOT NULL)),
  CONSTRAINT payment_attempts_provider_not_manual
    CHECK (provider <> 'manual'::public.payment_provider),
  CONSTRAINT payment_attempts_method_card
    CHECK (method = 'card'::public.payment_method),
  CONSTRAINT payment_attempts_amount_positive
    CHECK (amount_cents > 0),
  CONSTRAINT payment_attempts_currency_eur
    CHECK (currency = 'EUR'),
  CONSTRAINT payment_attempts_status_check
    CHECK (status IN ('initiated', 'processing', 'succeeded', 'failed', 'canceled')),
  CONSTRAINT payment_attempts_failure_code_format
    CHECK (failure_code IS NULL OR failure_code ~ '^[A-Z_]{3,64}$'),
  CONSTRAINT payment_attempts_idempotency_key_unique UNIQUE (idempotency_key),
  CONSTRAINT payment_attempts_succeeded_iff_payment
    CHECK ((status = 'succeeded') = (payment_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_provider_ref_unique
  ON public.payment_attempts (provider, provider_ref)
  WHERE provider_ref IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_one_active_per_registration
  ON public.payment_attempts (registration_id)
  WHERE status IN ('initiated', 'processing');

CREATE INDEX IF NOT EXISTS payment_attempts_tenant_idx
  ON public.payment_attempts (tenant_id);

CREATE INDEX IF NOT EXISTS payment_attempts_registration_idx
  ON public.payment_attempts (registration_id);

COMMENT ON TABLE public.payment_attempts IS
  'Online-Zahlungsversuche (Variante D). Zustand an der Zeile; Verlauf über Events. succeeded erst in 2.2a.';

ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_attempts_select ON public.payment_attempts;
CREATE POLICY payment_attempts_select
  ON public.payment_attempts
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT yogaflow_private.get_my_tenant_id())
    AND (SELECT yogaflow_private.is_tenant_manager())
  );

REVOKE ALL ON TABLE public.payment_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.payment_attempts TO authenticated;

CREATE OR REPLACE FUNCTION yogaflow_private.payment_attempts_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF pg_catalog.current_setting('yogaflow.allow_payment_delete', true) = 'on'
     AND current_user::text NOT IN ('anon', 'authenticated')
  THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'payment_attempts: DELETE nicht erlaubt'
    USING ERRCODE = '42501';
END;
$function$;

CREATE TRIGGER payment_attempts_no_delete
  BEFORE DELETE ON public.payment_attempts
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.payment_attempts_no_delete();

CREATE OR REPLACE FUNCTION yogaflow_private.payment_attempts_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
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

    IF NEW.status = 'succeeded' THEN
      RAISE EXCEPTION 'payment_attempts: succeeded erst in 2.2a'
        USING ERRCODE = '22023';
    END IF;

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
    ELSIF OLD.status IS NOT DISTINCT FROM NEW.status THEN
      v_allowed := true;
    END IF;

    IF NOT v_allowed THEN
      RAISE EXCEPTION 'payment_attempts: Übergang % → % nicht erlaubt', OLD.status, NEW.status
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

CREATE TRIGGER payment_attempts_guard
  BEFORE UPDATE ON public.payment_attempts
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.payment_attempts_guard();

REVOKE ALL ON FUNCTION yogaflow_private.payment_attempts_no_delete()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION yogaflow_private.payment_attempts_guard()
  FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 5. payments: partial unique (provider, provider_ref) für 2.2
-- ===========================================================================

DO $$
DECLARE
  v_dup integer;
BEGIN
  SELECT count(*)::integer INTO v_dup
  FROM (
    SELECT provider, provider_ref
    FROM public.payments
    WHERE provider <> 'manual'::public.payment_provider
      AND provider_ref IS NOT NULL
    GROUP BY provider, provider_ref
    HAVING count(*) > 1
  ) d;
  IF v_dup <> 0 THEN
    RAISE EXCEPTION '2.1b-a: % doppelte (provider, provider_ref) in payments', v_dup;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_ref_unique
  ON public.payments (provider, provider_ref)
  WHERE provider <> 'manual'::public.payment_provider
    AND provider_ref IS NOT NULL;

-- ===========================================================================
-- 6. Attempts stornieren / Status setzen
-- ===========================================================================

CREATE OR REPLACE FUNCTION yogaflow_private.set_payment_attempt_status(
  p_attempt_id uuid,
  p_status text,
  p_failure_code text DEFAULT NULL,
  p_provider_ref text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row public.payment_attempts%ROWTYPE;
  v_event_id uuid;
BEGIN
  PERFORM pg_catalog.set_config('yogaflow.allow_payment_attempt_change', 'on', true);

  SELECT * INTO v_row
  FROM public.payment_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.payment_attempts
  SET
    status = p_status,
    failure_code = COALESCE(p_failure_code, failure_code),
    provider_ref = COALESCE(p_provider_ref, provider_ref)
  WHERE id = p_attempt_id;

  v_event_id := yogaflow_private.insert_event(
    v_row.tenant_id,
    CASE p_status
      WHEN 'processing' THEN 'payment_attempt.processing'
      WHEN 'failed' THEN 'payment_attempt.failed'
      WHEN 'canceled' THEN 'payment_attempt.canceled'
      ELSE 'payment_attempt.updated'
    END,
    'payment_attempt',
    p_attempt_id,
    pg_catalog.jsonb_build_object(
      'attempt_id', p_attempt_id,
      'registration_id', v_row.registration_id,
      'from_status', v_row.status,
      'to_status', p_status,
      'failure_code', p_failure_code
    ),
    pg_catalog.gen_random_uuid()
  );
  PERFORM v_event_id;
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.set_payment_attempt_status(uuid, text, text, text) IS
  'Erlaubte Zustandsübergänge an payment_attempts (R8/R9). succeeded abgelehnt vom Guard.';

REVOKE ALL ON FUNCTION yogaflow_private.set_payment_attempt_status(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_payment_attempt_status(
  p_attempt_id uuid,
  p_status text,
  p_failure_code text DEFAULT NULL,
  p_provider_ref text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT yogaflow_private.set_payment_attempt_status(
    p_attempt_id, p_status, p_failure_code, p_provider_ref
  );
$function$;

REVOKE ALL ON FUNCTION public.set_payment_attempt_status(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_payment_attempt_status(uuid, text, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION yogaflow_private.cancel_payment_attempts_for_registration(
  p_registration uuid,
  p_reason_code text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row public.payment_attempts%ROWTYPE;
  v_n integer := 0;
BEGIN
  FOR v_row IN
    SELECT *
    FROM public.payment_attempts
    WHERE registration_id = p_registration
      AND status IN ('initiated', 'processing')
    ORDER BY id
    FOR UPDATE
  LOOP
    PERFORM yogaflow_private.set_payment_attempt_status(
      v_row.id,
      'canceled',
      CASE
        WHEN p_reason_code ~ '^[A-Z_]{3,64}$' THEN p_reason_code
        ELSE 'CANCELED'
      END,
      NULL
    );
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.cancel_payment_attempts_for_registration(uuid, text) IS
  'Aktive Versuche einer Buchung → canceled. Ein Aufruf je Storno-Pfad (R5).';

REVOKE ALL ON FUNCTION yogaflow_private.cancel_payment_attempts_for_registration(uuid, text)
  FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 7. create_pending_registration / create_payment_attempt / expire
-- ===========================================================================

CREATE OR REPLACE FUNCTION yogaflow_private.create_pending_registration(
  p_course uuid,
  p_user uuid,
  p_hold_reason text,
  p_hold_expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_course public.courses%ROWTYPE;
  v_max integer;
  v_reg_id uuid;
  v_event_id uuid;
BEGIN
  -- p_hold_expires_at darf in der Vergangenheit liegen (nur Tests über service_role).
  IF p_hold_reason IS NULL OR p_hold_reason NOT IN ('checkout', 'promotion') THEN
    RAISE EXCEPTION 'INVALID_HOLD_REASON'
      USING ERRCODE = '22023';
  END IF;

  IF p_hold_expires_at IS NULL THEN
    RAISE EXCEPTION 'INVALID_HOLD_EXPIRES'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_course
  FROM public.courses
  WHERE id = p_course
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COURSE_NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_course.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'COURSE_NOT_AVAILABLE'
      USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_course.price, 0) = 0 THEN
    RAISE EXCEPTION 'NOT_REQUIRED'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.registrations r
    WHERE r.course_id = p_course
      AND r.user_id = p_user
      AND r.cancellation_timestamp IS NULL
      AND r.status IN (
        'registered'::public.registration_status,
        'waitlist'::public.registration_status,
        'pending_payment'::public.registration_status
      )
  ) THEN
    RAISE EXCEPTION 'ALREADY_REGISTERED'
      USING ERRCODE = '22023';
  END IF;

  v_max := v_course.max_participants;
  IF yogaflow_private.course_occupied_seats(p_course) >= v_max THEN
    RAISE EXCEPTION 'COURSE_FULL'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.registrations (
    user_id,
    course_id,
    tenant_id,
    status,
    is_waitlist,
    waitlist_position,
    coverage_status,
    hold_expires_at,
    hold_reason
  )
  VALUES (
    p_user,
    p_course,
    v_course.tenant_id,
    'pending_payment'::public.registration_status,
    false,
    NULL,
    'open'::public.registration_coverage_status,
    p_hold_expires_at,
    p_hold_reason
  )
  RETURNING id INTO v_reg_id;

  v_event_id := yogaflow_private.insert_event(
    v_course.tenant_id,
    'registration.pending_payment',
    'registration',
    v_reg_id,
    pg_catalog.jsonb_build_object(
      'registration_id', v_reg_id,
      'course_id', p_course,
      'user_id', p_user,
      'hold_reason', p_hold_reason,
      'hold_expires_at', p_hold_expires_at
    ),
    pg_catalog.gen_random_uuid()
  );

  PERFORM yogaflow_private.insert_audit(
    v_course.tenant_id,
    NULL,
    'registration.pending_payment',
    'registrations',
    v_reg_id,
    ARRAY['status', 'hold_expires_at', 'hold_reason', 'coverage_status']::text[],
    v_event_id
  );

  RETURN v_reg_id;
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.create_pending_registration(uuid, uuid, text, timestamptz) IS
  'Baustein Checkout (2.2) und Nachrücken (2.1b-b). hold_expires_at darf für Tests in der Vergangenheit liegen.';

REVOKE ALL ON FUNCTION yogaflow_private.create_pending_registration(uuid, uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_pending_registration(
  p_course uuid,
  p_user uuid,
  p_hold_reason text,
  p_hold_expires_at timestamptz
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT yogaflow_private.create_pending_registration(
    p_course, p_user, p_hold_reason, p_hold_expires_at
  );
$function$;

REVOKE ALL ON FUNCTION public.create_pending_registration(uuid, uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_pending_registration(uuid, uuid, text, timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION yogaflow_private.create_payment_attempt(
  p_registration uuid,
  p_provider public.payment_provider,
  p_livemode boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_reg public.registrations%ROWTYPE;
  v_id uuid;
  v_event_id uuid;
BEGIN
  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = p_registration
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_reg.status IS DISTINCT FROM 'pending_payment'::public.registration_status THEN
    RAISE EXCEPTION 'NOT_PENDING'
      USING ERRCODE = '22023';
  END IF;

  IF v_reg.hold_expires_at IS NULL OR v_reg.hold_expires_at <= pg_catalog.now() THEN
    RAISE EXCEPTION 'HOLD_EXPIRED'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.payment_attempts a
    WHERE a.registration_id = p_registration
      AND a.status IN ('initiated', 'processing')
  ) THEN
    RAISE EXCEPTION 'ACTIVE_ATTEMPT_EXISTS'
      USING ERRCODE = '22023';
  END IF;

  IF p_provider = 'manual'::public.payment_provider THEN
    RAISE EXCEPTION 'INVALID_PROVIDER'
      USING ERRCODE = '22023';
  END IF;

  IF v_reg.price_cents_at_booking IS NULL OR v_reg.price_cents_at_booking <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT'
      USING ERRCODE = '22023';
  END IF;

  v_id := pg_catalog.gen_random_uuid();

  INSERT INTO public.payment_attempts (
    id,
    tenant_id,
    subject_type,
    registration_id,
    provider,
    method,
    amount_cents,
    currency,
    status,
    idempotency_key,
    livemode,
    created_by
  )
  VALUES (
    v_id,
    v_reg.tenant_id,
    'registration',
    p_registration,
    p_provider,
    'card'::public.payment_method,
    v_reg.price_cents_at_booking,
    COALESCE(v_reg.currency, 'EUR'),
    'initiated',
    v_id::text,
    p_livemode,
    yogaflow_private.get_my_member_id()
  );

  v_event_id := yogaflow_private.insert_event(
    v_reg.tenant_id,
    'payment_attempt.created',
    'payment_attempt',
    v_id,
    pg_catalog.jsonb_build_object(
      'attempt_id', v_id,
      'registration_id', p_registration,
      'amount_cents', v_reg.price_cents_at_booking,
      'provider', p_provider::text,
      'livemode', p_livemode
    ),
    pg_catalog.gen_random_uuid()
  );
  PERFORM v_event_id;

  RETURN v_id;
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.create_payment_attempt(uuid, public.payment_provider, boolean) IS
  'Legt einen initiated-Versuch an. Betrag aus price_cents_at_booking. Idempotency = Versuchs-ID.';

REVOKE ALL ON FUNCTION yogaflow_private.create_payment_attempt(uuid, public.payment_provider, boolean)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_payment_attempt(
  p_registration uuid,
  p_provider public.payment_provider,
  p_livemode boolean
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT yogaflow_private.create_payment_attempt(p_registration, p_provider, p_livemode);
$function$;

REVOKE ALL ON FUNCTION public.create_payment_attempt(uuid, public.payment_provider, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_payment_attempt(uuid, public.payment_provider, boolean)
  TO service_role;

CREATE OR REPLACE FUNCTION yogaflow_private.expire_payment_holds()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_reg public.registrations%ROWTYPE;
  v_n integer := 0;
  v_reason text;
  v_event_id uuid;
BEGIN
  FOR v_reg IN
    SELECT *
    FROM public.registrations
    WHERE status = 'pending_payment'::public.registration_status
      AND hold_expires_at IS NOT NULL
      AND hold_expires_at <= pg_catalog.now()
    ORDER BY hold_expires_at ASC, id ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    v_reason := CASE v_reg.hold_reason
      WHEN 'promotion' THEN 'promotion_expired'
      ELSE 'payment_expired'
    END;

    PERFORM yogaflow_private.cancel_payment_attempts_for_registration(
      v_reg.id, 'HOLD_EXPIRED'
    );

    UPDATE public.registrations
    SET
      status = 'cancelled'::public.registration_status,
      cancellation_timestamp = pg_catalog.now(),
      cancelled_by = NULL,
      cancel_reason = v_reason,
      waitlist_position = NULL
    WHERE id = v_reg.id;

    v_event_id := yogaflow_private.insert_event(
      v_reg.tenant_id,
      'registration.hold_expired',
      'registration',
      v_reg.id,
      pg_catalog.jsonb_build_object(
        'registration_id', v_reg.id,
        'course_id', v_reg.course_id,
        'hold_reason', v_reg.hold_reason,
        'cancel_reason', v_reason
      ),
      pg_catalog.gen_random_uuid()
    );
    PERFORM v_event_id;

    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.expire_payment_holds() IS
  'Gibt abgelaufene pending_payment frei (R4). Nachrücken über Trigger. Idempotent.';

REVOKE ALL ON FUNCTION yogaflow_private.expire_payment_holds()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION yogaflow_private.expire_payment_holds()
  TO service_role;

CREATE OR REPLACE FUNCTION public.expire_payment_holds()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT yogaflow_private.expire_payment_holds();
$function$;

COMMENT ON FUNCTION public.expire_payment_holds() IS
  'Alias für yogaflow_private.expire_payment_holds. Nur service_role/postgres.';

REVOKE ALL ON FUNCTION public.expire_payment_holds()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_payment_holds()
  TO service_role;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'yogaflow_expire_payment_holds'
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'yogaflow_expire_payment_holds',
    '* * * * *',
    $cron$SELECT yogaflow_private.expire_payment_holds();$cron$
  );
END;
$$;

-- ===========================================================================
-- 8. get_course_participant_counts — occupied seats via Helfer
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.get_course_participant_counts(p_course_ids uuid[])
RETURNS TABLE (
  course_id uuid,
  registered_count bigint,
  waitlist_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  v_tenant := yogaflow_private.get_my_tenant_id();

  IF v_tenant IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id AS course_id,
    yogaflow_private.course_occupied_seats(c.id)::bigint AS registered_count,
    COUNT(r.id) FILTER (
      WHERE r.is_waitlist = true
        AND r.cancellation_timestamp IS NULL
    ) AS waitlist_count
  FROM public.courses c
  LEFT JOIN public.registrations r ON r.course_id = c.id
  WHERE c.id = ANY(p_course_ids)
    AND c.tenant_id = v_tenant
  GROUP BY c.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_course_participant_counts(uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_course_participant_counts(uuid[])
  TO authenticated;

-- ===========================================================================
-- 9. Geänderte RPCs (Basis: neueste Definitionen)
-- ===========================================================================

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
    );

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Du wurdest auf die Warteliste gesetzt.',
      'waitlist_position', v_next_position,
      'is_waitlist', true,
      'coverage', CASE WHEN v_free THEN 'not_required' ELSE 'open' END
    );
  END IF;

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
      'pass_remaining', v_remaining
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Erfolgreich angemeldet.',
    'is_waitlist', false,
    'coverage', COALESCE(v_coverage, 'open')
  );
END;
$function$;

COMMENT ON FUNCTION public.register_for_course(uuid, boolean) IS
  'Selbstanmeldung. p_use_pass: mit Karte einlösen (Platz) bzw. coverage_intent auf Warteliste. Kostenlos ignoriert den Wunsch (W12). Platzzählung über course_occupied_seats (2.1b-a).';

REVOKE ALL ON FUNCTION public.register_for_course(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_for_course(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_register_user_for_course(
  p_user_id uuid,
  p_course_id uuid,
  p_coverage text DEFAULT 'open'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor_id           uuid;
  v_actor_role         text;
  v_actor_tenant       uuid;
  v_course_tenant      uuid;
  v_teacher_id         uuid;
  v_max_participants   integer;
  v_course_date        date;
  v_course_title       text;
  v_course_time        time;
  v_course_status      text;
  v_course_price       numeric;
  v_current_count      integer;
  v_next_position      integer;
  v_notification_body  text;
  v_coverage           text;
  v_free               boolean;
  v_reg_id             uuid;
  v_pass_id            uuid;
  v_remaining          integer;
  v_pay                jsonb;
BEGIN
  v_actor_id := yogaflow_private.get_my_member_id();
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT role, tenant_id INTO v_actor_role, v_actor_tenant
  FROM public.users WHERE id = v_actor_id;

  IF v_actor_role NOT IN ('owner', 'admin', 'teacher') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions');
  END IF;

  SELECT tenant_id, teacher_id, max_participants, date, title, time, status, price
  INTO v_course_tenant, v_teacher_id, v_max_participants, v_course_date,
       v_course_title, v_course_time, v_course_status, v_course_price
  FROM public.courses WHERE id = p_course_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Course not found');
  END IF;

  IF v_course_tenant IS DISTINCT FROM v_actor_tenant THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cross-tenant operation not allowed');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_user_id
      AND tenant_id = v_actor_tenant
      AND anonymized_at IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'MEMBER_REMOVED');
  END IF;

  IF v_course_status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'COURSE_NOT_AVAILABLE');
  END IF;

  IF v_actor_role = 'teacher' AND v_teacher_id IS DISTINCT FROM v_actor_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Teachers can only add participants to their own courses');
  END IF;

  IF p_user_id IS NOT DISTINCT FROM v_teacher_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Course teachers cannot be added as participants to their own course');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_user_id
      AND tenant_id = v_actor_tenant
      AND role IN ('user', 'teacher')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user not found or not a participant');
  END IF;

  IF v_course_date < CURRENT_DATE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot register for past courses');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.registrations
    WHERE course_id = p_course_id
      AND user_id = p_user_id
      AND cancellation_timestamp IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_registered');
  END IF;

  v_free := (COALESCE(v_course_price, 0) = 0);
  v_coverage := COALESCE(NULLIF(pg_catalog.btrim(p_coverage), ''), 'open');

  IF NOT v_free AND v_coverage NOT IN (
    'open', 'pass', 'cash', 'paypal_manual', 'bank_transfer'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_COVERAGE');
  END IF;

  -- W12
  IF v_free THEN
    v_coverage := 'open';
  END IF;

  v_current_count := yogaflow_private.course_occupied_seats(p_course_id);

  IF v_current_count >= v_max_participants THEN
    -- W13: Warteliste nur open oder pass-Intent; keine Zahlart
    IF v_coverage IN ('cash', 'paypal_manual', 'bank_transfer') THEN
      RETURN jsonb_build_object('success', false, 'error', 'WAITLIST_NO_PAYMENT');
    END IF;

    SELECT COUNT(*)::integer + 1 INTO v_next_position
    FROM public.registrations
    WHERE course_id = p_course_id
      AND is_waitlist = true
      AND status = 'waitlist'
      AND cancellation_timestamp IS NULL;

    INSERT INTO public.registrations (
      user_id, course_id, tenant_id, status, is_waitlist, waitlist_position,
      coverage_intent
    )
    VALUES (
      p_user_id, p_course_id, v_actor_tenant, 'waitlist', true, v_next_position,
      CASE WHEN v_coverage = 'pass' THEN 'pass' ELSE NULL END
    );

    v_notification_body := format(
      'Du wurdest für den Kurs "%s" auf die Warteliste gesetzt (Platz %s).',
      v_course_title,
      v_next_position
    );

    INSERT INTO public.user_notifications (
      tenant_id, user_id, type, body, course_id, action_path, metadata
    ) VALUES (
      v_actor_tenant,
      p_user_id,
      'course_waitlisted',
      v_notification_body,
      p_course_id,
      '/my-courses',
      jsonb_build_object(
        'added_by_user_id', v_actor_id,
        'waitlist_position', v_next_position,
        'coverage_intent', CASE WHEN v_coverage = 'pass' THEN 'pass' ELSE NULL END
      )
    );

    RETURN jsonb_build_object(
      'success', true,
      'on_waitlist', true,
      'waitlist_position', v_next_position
    );
  END IF;

  IF v_coverage = 'pass' THEN
    v_pass_id := yogaflow_private.pick_pass_for_registration(p_user_id, p_course_id);
    IF v_pass_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'NO_VALID_PASS');
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.registrations (
      user_id, course_id, tenant_id, status, is_waitlist
    )
    VALUES (p_user_id, p_course_id, v_actor_tenant, 'registered', false)
    RETURNING id INTO v_reg_id;

    IF v_coverage = 'pass' THEN
      PERFORM yogaflow_private.redeem_pass(v_reg_id, v_pass_id, v_actor_id);
      v_remaining := yogaflow_private.pass_remaining(v_pass_id);
    ELSIF v_coverage IN ('cash', 'paypal_manual', 'bank_transfer') THEN
      v_pay := public.record_manual_payment(v_reg_id, v_coverage, NULL, NULL);
      IF COALESCE((v_pay ->> 'success')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION '%', COALESCE(v_pay ->> 'error', 'PAYMENT_FAILED');
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM IN (
      'PASS_EMPTY', 'PASS_EXPIRED', 'PASS_MISMATCH',
      'NOT_PASS_ELIGIBLE', 'NOT_OPEN',
      'FORBIDDEN', 'NOT_FOUND', 'CANCELLED', 'NOT_REGISTERED',
      'INVALID_METHOD', 'INVALID_AMOUNT', 'NOTE_REQUIRED'
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', SQLERRM);
    END IF;
    RAISE;
  END;

  IF v_coverage = 'pass' THEN
    v_notification_body := format(
      'Du wurdest zum Kurs "%s" am %s um %s hinzugefügt — mit deiner Karte (noch %s).',
      v_course_title,
      to_char(v_course_date, 'DD.MM.YYYY'),
      to_char(v_course_time, 'HH24:MI'),
      v_remaining
    );
  ELSE
    v_notification_body := format(
      'Du wurdest zum Kurs "%s" am %s um %s hinzugefügt.',
      v_course_title,
      to_char(v_course_date, 'DD.MM.YYYY'),
      to_char(v_course_time, 'HH24:MI')
    );
  END IF;

  INSERT INTO public.user_notifications (
    tenant_id, user_id, type, body, course_id, action_path, metadata
  ) VALUES (
    v_actor_tenant,
    p_user_id,
    'course_added',
    v_notification_body,
    p_course_id,
    '/my-courses',
    jsonb_build_object(
      'added_by_user_id', v_actor_id,
      'coverage', CASE
        WHEN v_free THEN 'not_required'
        WHEN v_coverage = 'pass' THEN 'pass'
        WHEN v_coverage IN ('cash', 'paypal_manual', 'bank_transfer') THEN 'paid'
        ELSE 'open'
      END
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'on_waitlist', false,
    'coverage', CASE
      WHEN v_free THEN 'not_required'
      WHEN v_coverage = 'pass' THEN 'pass'
      WHEN v_coverage IN ('cash', 'paypal_manual', 'bank_transfer') THEN 'paid'
      ELSE 'open'
    END,
    'pass_remaining', v_remaining
  );
END;
$function$;

COMMENT ON FUNCTION public.admin_register_user_for_course(uuid, uuid, text) IS
  'Studio trägt ein. p_coverage: open|pass|cash|paypal_manual|bank_transfer. Warteliste: nur open/pass-Intent (W13). Immer registered, nie pending_payment (R6). Platzzählung course_occupied_seats.';

REVOKE ALL ON FUNCTION public.admin_register_user_for_course(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_register_user_for_course(uuid, uuid, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.promote_from_waitlist(p_course_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_max_participants integer;
  v_current_count integer;
  v_next_user record;
  v_course_title text;
  v_course_date date;
  v_course_time time;
  v_tenant_id uuid;
  v_status text;
  v_notification_body text;
  v_pass_id uuid;
  v_remaining integer;
  v_redeem_ok boolean;
BEGIN
  SELECT max_participants, title, date, time, tenant_id, status
  INTO v_max_participants, v_course_title, v_course_date, v_course_time, v_tenant_id, v_status
  FROM public.courses
  WHERE id = p_course_id
  FOR UPDATE;

  IF NOT FOUND OR v_status IS DISTINCT FROM 'active' THEN
    RETURN;
  END IF;

  v_current_count := yogaflow_private.course_occupied_seats(p_course_id);

  WHILE v_current_count < v_max_participants LOOP
    SELECT id, user_id, waitlist_position, coverage_intent
      INTO v_next_user
    FROM public.registrations
    WHERE course_id = p_course_id
      AND is_waitlist = true
      AND status = 'waitlist'
      AND cancellation_timestamp IS NULL
    ORDER BY waitlist_position ASC
    LIMIT 1;

    EXIT WHEN v_next_user.id IS NULL;

    UPDATE public.registrations
    SET status = 'registered',
        is_waitlist = false,
        waitlist_position = NULL,
        registered_at = pg_catalog.now()
    WHERE id = v_next_user.id;

    v_redeem_ok := false;
    v_remaining := NULL;

    -- Diff A6-3: Intent pass → einlösen. Subtransaktion: Fehler darf die
    -- Abmeldung der anderen Person (Trigger-Aufrufer) nie abbrechen.
    IF v_next_user.coverage_intent IS NOT DISTINCT FROM 'pass' THEN
      BEGIN
        v_pass_id := yogaflow_private.pick_pass_for_registration(
          v_next_user.user_id, p_course_id
        );
        IF v_pass_id IS NOT NULL THEN
          -- Akteur NULL = System (pass_movements.actor_member_id / audit erlaubt NULL).
          PERFORM yogaflow_private.redeem_pass(
            v_next_user.id, v_pass_id, NULL
          );
          v_remaining := yogaflow_private.pass_remaining(v_pass_id);
          v_redeem_ok := true;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_redeem_ok := false;
        v_remaining := NULL;
      END;

      UPDATE public.registrations
      SET coverage_intent = NULL
      WHERE id = v_next_user.id;
    END IF;

    IF v_next_user.coverage_intent IS NOT DISTINCT FROM 'pass' AND NOT v_redeem_ok THEN
      v_notification_body :=
        'Du bist nachgerückt. Deine Karte konnte nicht genutzt werden, bitte bezahle vor Ort.';
    ELSE
      v_notification_body := pg_catalog.format(
        'Du hast einen Platz im Kurs „%s“ am %s um %s bekommen.',
        v_course_title,
        pg_catalog.to_char(v_course_date, 'DD.MM.YYYY'),
        pg_catalog.to_char(v_course_time, 'HH24:MI')
      );
      IF v_redeem_ok THEN
        v_notification_body := v_notification_body
          || pg_catalog.format(
            ' Mit deiner Karte bezahlt (noch %s).',
            v_remaining
          );
      END IF;
    END IF;

    INSERT INTO public.user_notifications (
      tenant_id,
      user_id,
      type,
      body,
      course_id,
      action_path,
      metadata
    ) VALUES (
      v_tenant_id,
      v_next_user.user_id,
      'waitlist_promoted',
      v_notification_body,
      p_course_id,
      '/my-courses',
      pg_catalog.jsonb_build_object('promoted_from_waitlist', true)
    );

    v_current_count := v_current_count + 1;
  END LOOP;

  PERFORM public.compact_waitlist_positions(p_course_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.promote_from_waitlist(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.unregister_from_course(
  p_course_id uuid,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := yogaflow_private.get_my_member_id();
  v_registration_status public.registration_status;
  v_waitlist_user_id uuid;
  v_course_date date;
  v_reg_id uuid;
  v_coverage public.registration_coverage_status;
  v_deadline timestamptz;
  v_pass_id uuid;
  v_pass_refunded boolean := false;
  v_pass_remaining integer;
  v_message text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Bitte melde dich an.'
    );
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id <> v_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Nicht autorisiert.'
    );
  END IF;

  -- Gleiche Sperrreihenfolge wie register_for_course (Kurs vor Anmeldung).
  -- Fehlt der Kurs, liefert die folgende Select wie bisher „Keine aktive Anmeldung“.
  SELECT date INTO v_course_date
  FROM public.courses
  WHERE id = p_course_id
  FOR UPDATE;

  IF v_course_date IS NOT NULL AND v_course_date < CURRENT_DATE THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Von vergangenen Kursen kann man sich nicht mehr abmelden.'
    );
  END IF;

  SELECT id, status, coverage_status, cancellation_deadline, pass_id
  INTO v_reg_id, v_registration_status, v_coverage, v_deadline, v_pass_id
  FROM public.registrations
  WHERE course_id = p_course_id
    AND user_id = v_user_id
    AND status IN ('registered', 'waitlist', 'pending_payment')
    AND cancellation_timestamp IS NULL;

  IF v_registration_status IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Keine aktive Anmeldung für diesen Kurs gefunden.'
    );
  END IF;

  IF v_registration_status IN ('registered', 'pending_payment') THEN
    SELECT user_id
    INTO v_waitlist_user_id
    FROM public.registrations
    WHERE course_id = p_course_id
      AND status = 'waitlist'
      AND cancellation_timestamp IS NULL
    ORDER BY waitlist_position ASC NULLS LAST, signup_timestamp ASC NULLS LAST, id ASC
    LIMIT 1;
  END IF;

  UPDATE public.registrations
  SET
    status = 'cancelled',
    cancellation_timestamp = now(),
    cancelled_by = v_user_id,
    cancel_reason = 'participant',
    waitlist_position = NULL
  WHERE id = v_reg_id;

  PERFORM yogaflow_private.cancel_payment_attempts_for_registration(
    v_reg_id, 'PARTICIPANT_CANCEL'
  );

  PERFORM public.compact_waitlist_positions(p_course_id);

  -- Diff A6-3: registered + Deckung pass → in der Frist (oder fehlende Frist) zurück.
  -- cancellation_deadline NULL bei pass sollte der Freeze-Trigger verhindern.
  -- Falls doch: kulant zurückbuchen (wie „in der Frist“), damit niemand die
  -- Einheit verliert wegen fehlendem Freeze.
  IF v_registration_status = 'registered'
     AND v_coverage = 'pass'::public.registration_coverage_status
     AND v_pass_id IS NOT NULL
  THEN
    IF v_deadline IS NULL OR now() < v_deadline THEN
      PERFORM yogaflow_private.reverse_redemption(
        v_reg_id, v_user_id, 'self_in_window'
      );
      v_pass_refunded := true;
      v_pass_remaining := yogaflow_private.pass_remaining(v_pass_id);
    END IF;
  END IF;

  IF v_waitlist_user_id IS NOT NULL THEN
    v_message := 'Abgemeldet. Ein Wartelisten-Teilnehmer wurde nachgerückt.';
  ELSE
    v_message := 'Erfolgreich abgemeldet.';
  END IF;

  IF v_coverage = 'pass'::public.registration_coverage_status
     AND v_registration_status = 'registered'
  THEN
    IF v_pass_refunded THEN
      v_message := v_message || ' Deine Karteneinheit ist zurückgebucht.';
    ELSE
      v_message := v_message || ' Die Frist ist vorbei, die Einheit bleibt verbraucht.';
    END IF;
  END IF;

  IF v_waitlist_user_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', v_message,
      'promoted_user_id', v_waitlist_user_id,
      'pass_refunded', v_pass_refunded,
      'pass_remaining', v_pass_remaining
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', v_message,
    'pass_refunded', v_pass_refunded,
    'pass_remaining', v_pass_remaining
  );
END;
$$;

REVOKE ALL ON FUNCTION public.unregister_from_course(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_from_course(uuid, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_unregister_user_from_course(
  p_user_id uuid,
  p_course_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor_id                 uuid;
  v_actor_role               text;
  v_actor_tenant             uuid;
  v_course_tenant            uuid;
  v_teacher_id               uuid;
  v_course_date              date;
  v_course_title             text;
  v_course_time              time;
  v_registration_status      public.registration_status;
  v_registration_is_waitlist boolean;
  v_was_registered           boolean;
  v_waitlist_user_id         uuid;
  v_notification_body        text;
  v_reg_id                   uuid;
  v_coverage                 public.registration_coverage_status;
  v_pass_id                  uuid;
  v_pass_refunded            boolean := false;
BEGIN
  v_actor_id := yogaflow_private.get_my_member_id();
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT role, tenant_id INTO v_actor_role, v_actor_tenant
  FROM public.users WHERE id = v_actor_id;

  IF v_actor_role NOT IN ('owner', 'admin', 'teacher') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions');
  END IF;

  SELECT tenant_id, teacher_id, date, title, time
  INTO v_course_tenant, v_teacher_id, v_course_date, v_course_title, v_course_time
  FROM public.courses
  WHERE id = p_course_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Course not found');
  END IF;

  IF v_course_tenant IS DISTINCT FROM v_actor_tenant THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cross-tenant operation not allowed');
  END IF;

  IF v_actor_role = 'teacher' AND v_teacher_id IS DISTINCT FROM v_actor_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Teachers can only unregister participants from their own courses');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_user_id
      AND tenant_id = v_actor_tenant
      AND role IN ('user', 'teacher')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user not found or not a participant');
  END IF;

  IF v_course_date < CURRENT_DATE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot unregister from past courses');
  END IF;

  SELECT id, status, is_waitlist, coverage_status, pass_id
  INTO v_reg_id, v_registration_status, v_registration_is_waitlist, v_coverage, v_pass_id
  FROM public.registrations
  WHERE course_id = p_course_id
    AND user_id = p_user_id
    AND status IN ('registered', 'waitlist', 'pending_payment')
    AND cancellation_timestamp IS NULL;

  IF v_registration_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_registered');
  END IF;

  IF v_actor_role = 'teacher'
     AND (v_registration_is_waitlist
          OR v_registration_status NOT IN (
            'registered'::public.registration_status,
            'pending_payment'::public.registration_status
          )) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Teachers can only unregister active participants from their own courses'
    );
  END IF;

  v_was_registered := (v_registration_status IN ('registered', 'pending_payment') AND NOT v_registration_is_waitlist);

  IF v_was_registered THEN
    SELECT user_id
    INTO v_waitlist_user_id
    FROM public.registrations
    WHERE course_id = p_course_id
      AND status = 'waitlist'
      AND is_waitlist = true
      AND cancellation_timestamp IS NULL
    ORDER BY waitlist_position ASC NULLS LAST, signup_timestamp ASC NULLS LAST, id ASC
    LIMIT 1;
  END IF;

  UPDATE public.registrations
  SET
    status = 'cancelled',
    cancellation_timestamp = now(),
    cancelled_by = v_actor_id,
    cancel_reason = 'studio',
    waitlist_position = NULL
  WHERE id = v_reg_id;

  PERFORM yogaflow_private.cancel_payment_attempts_for_registration(
    v_reg_id, 'STUDIO_CANCEL'
  );

  PERFORM public.compact_waitlist_positions(p_course_id);

  -- Diff A6-3: Deckung pass → immer zurück (W1), unabhängig von der Frist.
  IF v_coverage = 'pass'::public.registration_coverage_status
     AND v_pass_id IS NOT NULL
  THEN
    PERFORM yogaflow_private.reverse_redemption(
      v_reg_id, v_actor_id, 'studio_unregister'
    );
    v_pass_refunded := true;
  END IF;

  v_notification_body := format(
    'Du wurdest vom Kurs "%s" am %s um %s abgemeldet.',
    v_course_title,
    to_char(v_course_date, 'DD.MM.YYYY'),
    to_char(v_course_time, 'HH24:MI')
  );
  IF v_pass_refunded THEN
    v_notification_body := v_notification_body
      || ' Deine Karteneinheit ist zurückgebucht.';
  END IF;

  INSERT INTO public.user_notifications (
    tenant_id, user_id, type, body, course_id, action_path, metadata
  ) VALUES (
    v_actor_tenant,
    p_user_id,
    'course_removed',
    v_notification_body,
    p_course_id,
    '/my-courses',
    jsonb_build_object('removed_by_user_id', v_actor_id)
  );

  IF v_was_registered AND v_waitlist_user_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Teilnehmer abgemeldet. Ein Wartelisten-Teilnehmer wurde nachgerückt.',
      'promoted_user_id', v_waitlist_user_id,
      'pass_refunded', v_pass_refunded
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Teilnehmer erfolgreich abgemeldet.',
    'pass_refunded', v_pass_refunded
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_unregister_user_from_course(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unregister_user_from_course(uuid, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_course(
  p_course_id uuid,
  p_scope text DEFAULT 'single',
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid;
  v_tenant uuid;
  v_manager boolean;
  v_note text;
  v_anchor public.courses%ROWTYPE;
  v_course public.courses%ROWTYPE;
  v_ids uuid[];
  v_at timestamptz;
  v_cancelled integer;
  v_paid integer;
  v_body text;
  v_owner_body text;
  v_paid_sentence text;
  v_causation uuid := pg_catalog.gen_random_uuid();
  v_event_id uuid;
  v_canceled_ids uuid[] := '{}';
  v_cancelled_total integer := 0;
  v_paid_total integer := 0;
  v_pass_refunded integer := 0;
  v_pass_refunded_inactive integer := 0;
  v_pass_ref_course integer;
  v_pass_inactive_course integer;
  v_pass_user_ids uuid[];
  v_reg record;
  v_rev jsonb;
  v_e17 text;
BEGIN
  v_actor := yogaflow_private.get_my_member_id();
  v_tenant := yogaflow_private.get_my_tenant_id();
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF p_scope IS NULL OR p_scope NOT IN ('single', 'series_from_here') THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_SCOPE');
  END IF;

  v_note := NULLIF(pg_catalog.btrim(p_note), '');
  IF v_note IS NOT NULL AND pg_catalog.char_length(v_note) > 200 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOTE_TOO_LONG');
  END IF;

  SELECT *
    INTO v_anchor
  FROM public.courses
  WHERE id = p_course_id;

  IF NOT FOUND OR v_anchor.tenant_id IS DISTINCT FROM v_tenant THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  v_manager := yogaflow_private.is_tenant_manager();
  IF NOT v_manager AND NOT yogaflow_private.is_course_teacher(p_course_id) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF (v_anchor.date + COALESCE(v_anchor.time, TIME '00:00:00'))
       AT TIME ZONE 'Europe/Berlin' <= pg_catalog.now()
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ALREADY_STARTED');
  END IF;

  IF v_anchor.status = 'canceled' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ALREADY_CANCELED');
  END IF;

  IF v_anchor.status IS DISTINCT FROM 'active' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'COURSE_NOT_AVAILABLE');
  END IF;

  SELECT pg_catalog.array_agg(c.id ORDER BY c.id)
    INTO v_ids
  FROM public.courses c
  WHERE c.tenant_id = v_tenant
    AND c.status = 'active'
    AND (c.date + COALESCE(c.time, TIME '00:00:00'))
        >= (v_anchor.date + COALESCE(v_anchor.time, TIME '00:00:00'))
    AND (c.date + COALESCE(c.time, TIME '00:00:00'))
          AT TIME ZONE 'Europe/Berlin' > pg_catalog.now()
    AND (
      (p_scope = 'single' AND c.id = p_course_id)
      OR (
        p_scope = 'series_from_here'
        AND (
          (v_anchor.series_id IS NULL AND c.id = p_course_id)
          OR (v_anchor.series_id IS NOT NULL AND c.series_id = v_anchor.series_id)
        )
      )
    )
    AND (v_manager OR c.teacher_id = v_actor);

  IF v_ids IS NULL OR pg_catalog.array_length(v_ids, 1) IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  PERFORM 1
  FROM public.courses
  WHERE id = ANY (v_ids)
  ORDER BY id
  FOR UPDATE;

  PERFORM pg_catalog.set_config('yogaflow.allow_course_status', 'on', true);

  FOR v_course IN
    SELECT *
    FROM public.courses
    WHERE id = ANY (v_ids)
    ORDER BY id
  LOOP
    IF v_course.status IS DISTINCT FROM 'active' THEN
      CONTINUE;
    END IF;

    v_at := pg_catalog.clock_timestamp();

    SELECT count(*)::integer,
           count(*) FILTER (WHERE coverage_status = 'paid')::integer
      INTO v_cancelled, v_paid
    FROM public.registrations
    WHERE course_id = v_course.id
      AND status IN ('registered', 'waitlist', 'pending_payment')
      AND cancellation_timestamp IS NULL;

    UPDATE public.courses
    SET status = 'canceled',
        canceled_at = v_at,
        canceled_by = v_actor,
        cancel_note = v_note
    WHERE id = v_course.id;

    -- Aktive Online-Versuche der pending_payment-Buchungen zuerst beenden (R5).
    PERFORM yogaflow_private.cancel_payment_attempts_for_registration(r.id, 'COURSE_CANCELLED')
    FROM public.registrations r
    WHERE r.course_id = v_course.id
      AND r.status = 'pending_payment'::public.registration_status
      AND r.cancellation_timestamp IS NULL;

    UPDATE public.registrations
    SET status = 'cancelled',
        cancellation_timestamp = v_at,
        cancelled_by = v_actor,
        cancel_reason = 'course_cancelled',
        waitlist_position = NULL
    WHERE course_id = v_course.id
      AND status = 'waitlist'
      AND cancellation_timestamp IS NULL;

    UPDATE public.registrations
    SET status = 'cancelled',
        cancellation_timestamp = v_at,
        cancelled_by = v_actor,
        cancel_reason = 'course_cancelled',
        waitlist_position = NULL
    WHERE course_id = v_course.id
      AND status = 'registered'
      AND cancellation_timestamp IS NULL;

    UPDATE public.registrations
    SET status = 'cancelled',
        cancellation_timestamp = v_at,
        cancelled_by = v_actor,
        cancel_reason = 'course_cancelled',
        waitlist_position = NULL
    WHERE course_id = v_course.id
      AND status = 'pending_payment'::public.registration_status
      AND cancellation_timestamp IS NULL;

    -- A6: hier Karteneinlösungen dieses Kurses zurückbuchen (pass_movements redeem_reversal).
    -- Diff A6-3: reverse_redemption je pass-Buchung; E17 bei pass_inactive.
    v_pass_ref_course := 0;
    v_pass_inactive_course := 0;
    v_pass_user_ids := ARRAY[]::uuid[];

    FOR v_reg IN
      SELECT id, user_id, pass_id
      FROM public.registrations
      WHERE course_id = v_course.id
        AND cancel_reason = 'course_cancelled'
        AND cancellation_timestamp = v_at
        AND coverage_status = 'pass'::public.registration_coverage_status
        AND pass_id IS NOT NULL
      ORDER BY id
    LOOP
      v_rev := yogaflow_private.reverse_redemption(
        v_reg.id, v_actor, 'course_cancelled'
      );
      v_pass_ref_course := v_pass_ref_course + 1;
      v_pass_user_ids := v_pass_user_ids || v_reg.user_id;
      IF COALESCE((v_rev ->> 'pass_inactive')::boolean, false) THEN
        v_pass_inactive_course := v_pass_inactive_course + 1;
      END IF;
    END LOOP;

    v_pass_refunded := v_pass_refunded + v_pass_ref_course;
    v_pass_refunded_inactive := v_pass_refunded_inactive + v_pass_inactive_course;

    v_body := pg_catalog.format(
      'Der Kurs „%s“ am %s um %s fällt aus.',
      v_course.title,
      pg_catalog.to_char(v_course.date, 'DD.MM.YYYY'),
      pg_catalog.to_char(v_course.time, 'HH24:MI')
    );
    IF v_note IS NOT NULL THEN
      v_body := v_body || ' Grund: ' || v_note || '.';
    END IF;

    INSERT INTO public.user_notifications (
      tenant_id, user_id, type, body, course_id, action_path, metadata
    )
    SELECT v_course.tenant_id,
           r.user_id,
           'course_canceled',
           CASE
             WHEN r.user_id = ANY (v_pass_user_ids)
             THEN v_body || ' Deine Karteneinheit ist zurückgebucht.'
             ELSE v_body
           END,
           v_course.id,
           '/my-courses',
           pg_catalog.jsonb_build_object('scope', p_scope)
    FROM public.registrations r
    WHERE r.course_id = v_course.id
      AND r.cancel_reason = 'course_cancelled'
      AND r.cancellation_timestamp = v_at;

    IF NOT v_manager AND v_paid > 0 THEN
      v_paid_sentence := CASE
        WHEN v_paid = 1 THEN '1 Person hatte bereits bezahlt'
        ELSE v_paid::text || ' Personen hatten bereits bezahlt'
      END;
      v_owner_body := pg_catalog.format(
        '%s am %s abgesagt. %s.',
        v_course.title,
        pg_catalog.to_char(v_course.date, 'DD.MM.YYYY'),
        v_paid_sentence
      );

      INSERT INTO public.user_notifications (
        tenant_id, user_id, type, body, course_id, action_path, metadata
      )
      SELECT v_tenant,
             u.id,
             'course_canceled',
             v_owner_body,
             v_course.id,
             '/course/' || v_course.id::text || '/kassieren',
             pg_catalog.jsonb_build_object('paid_count', v_paid, 'for_managers', true)
      FROM public.users u
      WHERE u.tenant_id = v_tenant
        AND u.role IN ('owner', 'admin');
    END IF;

    -- E17: Einheiten auf abgelaufene/stornierte Karten zurückgebucht.
    IF v_pass_inactive_course > 0 THEN
      v_e17 := pg_catalog.format(
        '%s Einheiten wurden auf abgelaufene Karten zurückgebucht. Prüfe, ob du sie auf eine gültige Karte übertragen willst.',
        v_pass_inactive_course
      );
      INSERT INTO public.user_notifications (
        tenant_id, user_id, type, body, course_id, action_path, metadata
      )
      SELECT v_tenant,
             u.id,
             'course_canceled',
             v_e17,
             v_course.id,
             '/course/' || v_course.id::text || '/kassieren',
             pg_catalog.jsonb_build_object(
               'pass_refunded_inactive', v_pass_inactive_course,
               'for_managers', true
             )
      FROM public.users u
      WHERE u.tenant_id = v_tenant
        AND u.role IN ('owner', 'admin');
    END IF;

    v_event_id := yogaflow_private.insert_event(
      v_course.tenant_id,
      'course.canceled',
      'course',
      v_course.id,
      pg_catalog.jsonb_build_object(
        'course_id', v_course.id,
        'scope', p_scope,
        'cancelled_registrations', v_cancelled,
        'paid_registrations', v_paid,
        'pass_refunded', v_pass_ref_course,
        'pass_refunded_inactive', v_pass_inactive_course
      ),
      v_causation
    );

    PERFORM yogaflow_private.insert_audit(
      v_course.tenant_id,
      v_actor,
      'course.canceled',
      'courses',
      v_course.id,
      ARRAY['status', 'canceled_at', 'canceled_by', 'cancel_note']::text[],
      v_event_id
    );

    v_canceled_ids := v_canceled_ids || v_course.id;
    v_cancelled_total := v_cancelled_total + v_cancelled;
    v_paid_total := v_paid_total + v_paid;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'canceled_course_ids', to_jsonb(v_canceled_ids),
    'cancelled_registrations', v_cancelled_total,
    'paid_registrations', v_paid_total,
    'pass_refunded', v_pass_refunded,
    'pass_refunded_inactive', v_pass_refunded_inactive
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. uncancel_course — erneut einlösen (W7), Subtransaktion je Buchung
-- ---------------------------------------------------------------------------

COMMENT ON FUNCTION public.cancel_course(uuid, text, text) IS
  'Sagt Kurs(e) ab. Soft-Cancel registered/waitlist/pending_payment (2.1b-a). Versuche → canceled.';

REVOKE ALL ON FUNCTION public.cancel_course(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_course(uuid, text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.uncancel_course(
  p_course_id uuid,
  p_scope text DEFAULT 'single'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid;
  v_tenant uuid;
  v_manager boolean;
  v_anchor public.courses%ROWTYPE;
  v_course public.courses%ROWTYPE;
  v_ids uuid[];
  v_reg record;
  v_active integer;
  v_slots integer;
  v_kept integer;
  v_body text;
  v_causation uuid := pg_catalog.gen_random_uuid();
  v_event_id uuid;
  v_current uuid;
  v_conflict uuid;
  v_restored integer := 0;
  v_this integer := 0;
  v_uncanceled_ids uuid[] := '{}';
  v_overflow uuid[] := '{}';
  v_last_kind text;
  v_last_reason text;
  v_pass_id uuid;
  v_failed_open integer;
  v_on_waitlist boolean;
  v_owner_body text;
BEGIN
  v_actor := yogaflow_private.get_my_member_id();
  v_tenant := yogaflow_private.get_my_tenant_id();
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF p_scope IS NULL OR p_scope NOT IN ('single', 'series_from_here') THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_SCOPE');
  END IF;

  SELECT *
    INTO v_anchor
  FROM public.courses
  WHERE id = p_course_id;

  IF NOT FOUND OR v_anchor.tenant_id IS DISTINCT FROM v_tenant THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  v_manager := yogaflow_private.is_tenant_manager();
  IF NOT v_manager AND NOT yogaflow_private.is_course_teacher(p_course_id) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF (v_anchor.date + COALESCE(v_anchor.time, TIME '00:00:00'))
       AT TIME ZONE 'Europe/Berlin' <= pg_catalog.now()
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ALREADY_STARTED');
  END IF;

  IF v_anchor.status IS DISTINCT FROM 'canceled' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_CANCELED');
  END IF;

  SELECT pg_catalog.array_agg(c.id ORDER BY c.id)
    INTO v_ids
  FROM public.courses c
  WHERE c.tenant_id = v_tenant
    AND c.status = 'canceled'
    AND (c.date + COALESCE(c.time, TIME '00:00:00'))
        >= (v_anchor.date + COALESCE(v_anchor.time, TIME '00:00:00'))
    AND (c.date + COALESCE(c.time, TIME '00:00:00'))
          AT TIME ZONE 'Europe/Berlin' > pg_catalog.now()
    AND (
      (p_scope = 'single' AND c.id = p_course_id)
      OR (
        p_scope = 'series_from_here'
        AND (
          (v_anchor.series_id IS NULL AND c.id = p_course_id)
          OR (v_anchor.series_id IS NOT NULL AND c.series_id = v_anchor.series_id)
        )
      )
    )
    AND (v_manager OR c.teacher_id = v_actor);

  IF v_ids IS NULL OR pg_catalog.array_length(v_ids, 1) IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  PERFORM 1
  FROM public.courses
  WHERE id = ANY (v_ids)
  ORDER BY id
  FOR UPDATE;

  PERFORM pg_catalog.set_config('yogaflow.allow_course_status', 'on', true);

  BEGIN
    FOR v_course IN
      SELECT *
      FROM public.courses
      WHERE id = ANY (v_ids)
        AND status = 'canceled'
      ORDER BY id
    LOOP
      v_current := v_course.id;

      v_active := yogaflow_private.course_occupied_seats(v_course.id);

      v_slots := GREATEST(v_course.max_participants - v_active, 0);
      v_kept := 0;
      v_this := 0;
      v_failed_open := 0;

      UPDATE public.courses
      SET status = 'active',
          canceled_at = NULL,
          canceled_by = NULL,
          cancel_note = NULL
      WHERE id = v_course.id;

      FOR v_reg IN
        SELECT id, user_id, is_waitlist, cancelled_from_status
        FROM public.registrations
        WHERE course_id = v_course.id
          AND status = 'cancelled'
          AND cancel_reason = 'course_cancelled'
          AND cancellation_timestamp = v_course.canceled_at
          -- R5: frühere pending_payment nicht wiederherstellen.
          -- NULL (Altbestand) → wie bisher wiederherstellen.
          AND cancelled_from_status IS DISTINCT FROM
                'pending_payment'::public.registration_status
        ORDER BY signup_timestamp ASC NULLS LAST, id ASC
        FOR UPDATE
      LOOP
        IF v_reg.is_waitlist OR v_kept >= v_slots THEN
          UPDATE public.registrations
          SET status = 'waitlist',
              is_waitlist = true,
              cancellation_timestamp = NULL,
              cancelled_by = NULL,
              cancel_reason = NULL,
              waitlist_position = NULL
          WHERE id = v_reg.id;

          IF NOT v_reg.is_waitlist THEN
            v_overflow := v_overflow || v_reg.user_id;
          END IF;

          v_on_waitlist := true;

          v_body := pg_catalog.format(
            'Der Kurs „%s“ am %s um %s findet doch statt. Du bist wieder auf der Warteliste.',
            v_course.title,
            pg_catalog.to_char(v_course.date, 'DD.MM.YYYY'),
            pg_catalog.to_char(v_course.time, 'HH24:MI')
          );
        ELSE
          UPDATE public.registrations
          SET status = 'registered',
              is_waitlist = false,
              cancellation_timestamp = NULL,
              cancelled_by = NULL,
              cancel_reason = NULL,
              waitlist_position = NULL
          WHERE id = v_reg.id;

          v_kept := v_kept + 1;
          v_on_waitlist := false;

          v_body := pg_catalog.format(
            'Der Kurs „%s“ am %s um %s findet doch statt. Du bist wieder angemeldet.',
            v_course.title,
            pg_catalog.to_char(v_course.date, 'DD.MM.YYYY'),
            pg_catalog.to_char(v_course.time, 'HH24:MI')
          );
        END IF;

        -- Diff A6-3: letzte Bewegung redeem_reversal/course_cancelled → erneut einlösen.
        SELECT m.kind, m.reason
          INTO v_last_kind, v_last_reason
        FROM public.pass_movements m
        WHERE m.registration_id = v_reg.id
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 1;

        IF v_last_kind = 'redeem_reversal'
           AND v_last_reason = 'course_cancelled'
        THEN
          IF v_on_waitlist THEN
            UPDATE public.registrations
            SET coverage_intent = 'pass'
            WHERE id = v_reg.id;
          ELSE
            BEGIN
              v_pass_id := yogaflow_private.pick_pass_for_registration(
                v_reg.user_id, v_course.id
              );
              IF v_pass_id IS NULL THEN
                v_failed_open := v_failed_open + 1;
              ELSE
                PERFORM yogaflow_private.redeem_pass(
                  v_reg.id, v_pass_id, v_actor
                );
              END IF;
            EXCEPTION WHEN OTHERS THEN
              v_failed_open := v_failed_open + 1;
            END;
          END IF;
        END IF;

        INSERT INTO public.user_notifications (
          tenant_id, user_id, type, body, course_id, action_path, metadata
        ) VALUES (
          v_course.tenant_id,
          v_reg.user_id,
          'course_uncanceled',
          v_body,
          v_course.id,
          '/my-courses',
          pg_catalog.jsonb_build_object('scope', p_scope)
        );

        v_restored := v_restored + 1;
        v_this := v_this + 1;
      END LOOP;

      PERFORM public.compact_waitlist_positions(v_course.id);

      IF v_failed_open > 0 THEN
        v_owner_body := pg_catalog.format(
          '%s Buchungen konnten nicht erneut mit Karte bezahlt werden und sind offen.',
          v_failed_open
        );
        INSERT INTO public.user_notifications (
          tenant_id, user_id, type, body, course_id, action_path, metadata
        )
        SELECT v_tenant,
               u.id,
               'course_uncanceled',
               v_owner_body,
               v_course.id,
               '/course/' || v_course.id::text || '/kassieren',
               pg_catalog.jsonb_build_object(
                 'pass_reredeem_failed', v_failed_open,
                 'for_managers', true
               )
        FROM public.users u
        WHERE u.tenant_id = v_tenant
          AND u.role IN ('owner', 'admin');
      END IF;

      v_event_id := yogaflow_private.insert_event(
        v_course.tenant_id,
        'course.uncanceled',
        'course',
        v_course.id,
        pg_catalog.jsonb_build_object(
          'course_id', v_course.id,
          'scope', p_scope,
          'restored_registrations', v_this,
          'pass_reredeem_failed', v_failed_open
        ),
        v_causation
      );

      PERFORM yogaflow_private.insert_audit(
        v_course.tenant_id,
        v_actor,
        'course.uncanceled',
        'courses',
        v_course.id,
        ARRAY['status', 'canceled_at', 'canceled_by', 'cancel_note']::text[],
        v_event_id
      );

      v_uncanceled_ids := v_uncanceled_ids || v_course.id;
    END LOOP;
  EXCEPTION
    WHEN unique_violation THEN
      v_conflict := v_current;
  END;

  IF v_conflict IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error', 'CONFLICT',
      'course_id', v_conflict
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'uncanceled_course_ids', to_jsonb(v_uncanceled_ids),
    'restored_registrations', v_restored,
    'overflow_to_waitlist', to_jsonb(v_overflow)
  );
END;
$function$;

COMMENT ON FUNCTION public.uncancel_course(uuid, text) IS
  'Nimmt Absage zurück. Zeilen mit cancelled_from_status = pending_payment bleiben storniert (R5). NULL = Altbestand, wie bisher. Platzzählung course_occupied_seats.';

REVOKE ALL ON FUNCTION public.uncancel_course(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uncancel_course(uuid, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.cleanup_future_registrations_on_role_upgrade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF OLD.role = 'user'
     AND NEW.role IN ('admin', 'owner')
     AND NEW.id IS NOT NULL
  THEN
    -- Kurse in fester Id-Reihenfolge sperren (gleiche Reihenfolge wie register).
    PERFORM 1
    FROM public.courses c
    WHERE c.id IN (
      SELECT r.course_id
      FROM public.registrations r
      JOIN public.courses c2 ON c2.id = r.course_id
      WHERE r.user_id = NEW.id
        AND c2.tenant_id = NEW.tenant_id
        AND r.cancellation_timestamp IS NULL
        AND r.status IN ('registered', 'waitlist', 'pending_payment')
        AND c2.date >= CURRENT_DATE
    )
    ORDER BY c.id
    FOR UPDATE;

    PERFORM yogaflow_private.cancel_payment_attempts_for_registration(r.id, 'ROLE_CHANGE')
    FROM public.registrations r
    JOIN public.courses c ON c.id = r.course_id
    WHERE r.user_id = NEW.id
      AND c.tenant_id = NEW.tenant_id
      AND r.cancellation_timestamp IS NULL
      AND r.status = 'pending_payment'::public.registration_status
      AND c.date >= CURRENT_DATE;

    UPDATE public.registrations r
    SET
      status = 'cancelled',
      cancellation_timestamp = now(),
      cancelled_by = NULL,
      cancel_reason = 'role_change',
      waitlist_position = NULL
    FROM public.courses c
    WHERE r.course_id = c.id
      AND r.user_id = NEW.id
      AND c.tenant_id = NEW.tenant_id
      AND r.cancellation_timestamp IS NULL
      AND r.status IN ('registered', 'waitlist', 'pending_payment')
      AND c.date >= CURRENT_DATE;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_future_registrations_on_role_upgrade() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_manual_payment(
  p_registration_id uuid,
  p_method text,
  p_amount_cents integer DEFAULT NULL,
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
  v_manager boolean;
  v_amount integer;
  v_note text;
  v_method public.payment_method;
  v_payment_id uuid;
  v_received timestamptz;
  v_event_id uuid;
BEGIN
  v_member_id := yogaflow_private.get_my_member_id();
  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_member_id IS NULL OR v_tenant_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT *
    INTO v_row
  FROM public.registrations
  WHERE id = p_registration_id
  FOR UPDATE;

  IF NOT FOUND OR v_row.tenant_id IS DISTINCT FROM v_tenant_id THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  v_manager := yogaflow_private.is_tenant_manager();
  IF NOT v_manager AND NOT yogaflow_private.is_course_teacher(v_row.course_id) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF v_row.status = 'cancelled'::public.registration_status THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'CANCELLED');
  END IF;

  IF v_row.status = 'waitlist'::public.registration_status THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_REGISTERED');
  END IF;

  IF v_row.status = 'pending_payment'::public.registration_status THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'PAYMENT_PENDING');
  END IF;

  IF v_row.coverage_status IS DISTINCT FROM 'open'::public.registration_coverage_status THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error', 'NOT_OPEN',
      'coverage_status', v_row.coverage_status::text
    );
  END IF;

  IF p_method IS NULL OR p_method NOT IN ('cash', 'bank_transfer', 'paypal_manual') THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_METHOD');
  END IF;

  v_method := p_method::public.payment_method;
  v_amount := v_row.price_cents_at_booking;
  v_note := NULLIF(pg_catalog.btrim(p_note), '');

  -- Lehrende: mitgeschickter Betrag wird ignoriert (A3-Akzeptanz), kein Fehler.
  -- owner/admin: abweichender Betrag nur > 0 und mit Notiz (mindestens 3 Zeichen).
  IF v_manager
     AND p_amount_cents IS NOT NULL
     AND p_amount_cents IS DISTINCT FROM v_row.price_cents_at_booking
  THEN
    IF p_amount_cents <= 0 THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
    END IF;
    IF v_note IS NULL OR pg_catalog.length(v_note) < 3 THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOTE_REQUIRED');
    END IF;
    v_amount := p_amount_cents;
  END IF;

  v_received := pg_catalog.now();

  INSERT INTO public.payments (
    tenant_id,
    subject_type,
    subject_id,
    registration_id,
    provider,
    method,
    status,
    amount_cents,
    currency,
    received_at,
    recorded_by,
    note
  ) VALUES (
    v_row.tenant_id,
    'registration',
    p_registration_id,
    p_registration_id,
    'manual'::public.payment_provider,
    v_method,
    'succeeded'::public.payment_status,
    v_amount,
    'EUR',
    v_received,
    v_member_id,
    v_note
  )
  RETURNING id INTO v_payment_id;

  UPDATE public.registrations
  SET coverage_status = 'paid'::public.registration_coverage_status
  WHERE id = p_registration_id;

  v_event_id := yogaflow_private.insert_event(
    v_row.tenant_id,
    'payment.recorded',
    'payment',
    v_payment_id,
    pg_catalog.jsonb_build_object(
      'payment_id', v_payment_id,
      'registration_id', p_registration_id,
      'amount_cents', v_amount,
      'currency', 'EUR',
      'method', v_method::text,
      'provider', 'manual',
      'received_at', v_received
    ),
    pg_catalog.gen_random_uuid()
  );

  PERFORM yogaflow_private.insert_audit(
    v_row.tenant_id,
    v_member_id,
    'payment.recorded',
    'payments',
    v_payment_id,
    ARRAY[
      'amount_cents',
      'currency',
      'method',
      'provider',
      'status',
      'received_at',
      'recorded_by',
      'registration_id',
      'note'
    ]::text[],
    v_event_id
  );

  PERFORM yogaflow_private.insert_audit(
    v_row.tenant_id,
    v_member_id,
    'payment.recorded',
    'registrations',
    p_registration_id,
    ARRAY['coverage_status']::text[],
    v_event_id
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'amount_cents', v_amount,
    'method', v_method::text
  );
END;
$function$;

COMMENT ON FUNCTION public.record_manual_payment(uuid, text, integer, text) IS
  'Manueller Zahlungsvermerk. Betrag ist price_cents_at_booking; owner/admin dürfen mit Notiz abweichen. Lehrende nur im eigenen Kurs, mitgeschickter Betrag wird ignoriert. Deckung wird paid.';

-- ---------------------------------------------------------------------------
-- 5. reverse_manual_payment
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.record_manual_payment(uuid, text, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_manual_payment(uuid, text, integer, text)
  TO authenticated;

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

  IF v_row.status = 'pending_payment'::public.registration_status THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'PAYMENT_PENDING');
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
      'waitlist'::public.registration_status,
      'pending_payment'::public.registration_status
    )
  ORDER BY r.user_id, p.valid_until ASC, p.created_at ASC;
END;
$function$;

COMMENT ON FUNCTION public.get_course_member_passes(uuid) IS
  'Aktive Karten aller Angemeldeten eines Kurses inkl. pending_payment (2.1b-a). Owner/Admin oder Kursleitung.';

REVOKE ALL ON FUNCTION public.get_course_member_passes(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_course_member_passes(uuid) TO authenticated;


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
        'waitlist'::public.registration_status,
        'pending_payment'::public.registration_status
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
      'waitlist'::public.registration_status,
      'pending_payment'::public.registration_status
    )
    AND c.status = 'active'
    AND (c.date + COALESCE(c.time, TIME '00:00:00'))
          AT TIME ZONE 'Europe/Berlin' > pg_catalog.now();

  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  -- Aktive Versuche der soeben stornierten pending_payment-Buchungen (R5).
  PERFORM yogaflow_private.cancel_payment_attempts_for_registration(r.id, 'MEMBER_REMOVED')
  FROM public.registrations r
  WHERE r.user_id = v_target.id
    AND r.tenant_id = v_tenant
    AND r.cancel_reason = 'member_removed'
    AND r.hold_reason IS NOT NULL;

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

    PERFORM pg_catalog.set_config('yogaflow.allow_payment_delete', 'on', true);
    DELETE FROM public.payment_attempts a
    WHERE a.payment_id IS NULL
      AND a.registration_id IN (
        SELECT r.id FROM public.registrations r WHERE r.user_id = v_target.id
      );

    DELETE FROM public.users WHERE id = v_target.id;
    v_fields := ARRAY['id']::text[];
  ELSE
    v_mode := 'anonymized';

    DELETE FROM public.messages
    WHERE sender_id = v_target.id OR recipient_id = v_target.id;

    DELETE FROM public.user_notifications
    WHERE user_id = v_target.id;

    -- Versuche ohne payment_id mitlöschen (RESTRICT), bevor Anmeldungen weg sind.
    PERFORM pg_catalog.set_config('yogaflow.allow_payment_delete', 'on', true);
    DELETE FROM public.payment_attempts a
    WHERE a.payment_id IS NULL
      AND a.registration_id IN (
        SELECT r.id
        FROM public.registrations r
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
          )
      );

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
  'Entfernt ein Profil. Geldbezug inkl. Karte und Deckung pass. pending_payment wird storniert; Versuche ohne payment_id gelöscht (2.1b-a).';

REVOKE ALL ON FUNCTION public.remove_member(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_member(uuid) TO authenticated;

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

    DELETE FROM public.provider_events_raw WHERE tenant_id = p_tenant_id;
    DELETE FROM public.provider_capabilities WHERE tenant_id = p_tenant_id;
    DELETE FROM public.provider_accounts WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenant_payment_settings WHERE tenant_id = p_tenant_id;

    DELETE FROM public.audit_log WHERE tenant_id = p_tenant_id;
    DELETE FROM public.events WHERE tenant_id = p_tenant_id;
    DELETE FROM public.user_notifications WHERE tenant_id = p_tenant_id;
    DELETE FROM public.messages WHERE tenant_id = p_tenant_id;
    DELETE FROM public.pass_movements WHERE tenant_id = p_tenant_id;
    DELETE FROM public.passes WHERE tenant_id = p_tenant_id;
    DELETE FROM public.payment_attempts WHERE tenant_id = p_tenant_id;
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
  'Löscht einen Mandanten inkl. payment_attempts (2.1b-a, Schalter allow_payment_delete). Nur postgres/service_role.';

REVOKE ALL ON FUNCTION public.delete_tenant_complete(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tenant_complete(uuid)
  TO postgres, service_role;




-- Public-Aliase P10 nur service_role (Tests + 2.1b-b)
CREATE OR REPLACE FUNCTION public.online_payments_effective(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT yogaflow_private.online_payments_effective(p_tenant);
$function$;

REVOKE ALL ON FUNCTION public.online_payments_effective(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.online_payments_effective(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.online_payment_required(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT yogaflow_private.online_payment_required(p_tenant);
$function$;

REVOKE ALL ON FUNCTION public.online_payment_required(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.online_payment_required(uuid) TO service_role;

-- ===========================================================================
-- 10. Selbstprüfung
-- ===========================================================================

DO $$
DECLARE
  v_n integer;
  v_def text;
  v_fn text;
  v_oid oid;
  v_ok boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'registration_status'
      AND e.enumlabel = 'pending_payment'
  ) THEN
    RAISE EXCEPTION '2.1b-a: Enum-Wert pending_payment fehlt';
  END IF;

  FOREACH v_fn IN ARRAY ARRAY[
    'registrations_pending_hold',
    'registrations_pending_open',
    'registrations_hold_reason_check',
    'registrations_cancel_reason_check'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = v_fn
        AND conrelid = 'public.registrations'::regclass
    ) THEN
      RAISE EXCEPTION '2.1b-a: CHECK % fehlt', v_fn;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'registrations_active_course_user_key'
      AND indexdef LIKE '%pending_payment%'
  ) THEN
    RAISE EXCEPTION '2.1b-a: Unique-Index ohne pending_payment';
  END IF;

  IF to_regclass('public.payment_attempts') IS NULL THEN
    RAISE EXCEPTION '2.1b-a: payment_attempts fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'payments_provider_ref_unique'
  ) THEN
    RAISE EXCEPTION '2.1b-a: payments_provider_ref_unique fehlt';
  END IF;

  SELECT count(*) INTO v_n
  FROM public.registrations
  WHERE status = 'pending_payment'::public.registration_status
    AND (hold_expires_at IS NULL OR hold_reason IS NULL
         OR coverage_status IS DISTINCT FROM 'open'::public.registration_coverage_status);
  IF v_n <> 0 THEN
    RAISE EXCEPTION '2.1b-a: % Zeilen verletzen pending-CHECKs', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM (
    SELECT provider, provider_ref
    FROM public.payments
    WHERE provider <> 'manual'::public.payment_provider
      AND provider_ref IS NOT NULL
    GROUP BY 1, 2
    HAVING count(*) > 1
  ) d;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '2.1b-a: doppelte payments provider_ref';
  END IF;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.register_for_course(uuid,boolean)',
    'public.admin_register_user_for_course(uuid,uuid,text)',
    'public.promote_from_waitlist(uuid)',
    'public.uncancel_course(uuid,text)',
    'public.get_course_participant_counts(uuid[])'
  ]
  LOOP
    v_oid := v_fn::regprocedure;
    v_def := pg_get_functiondef(v_oid);
    IF v_def IS NULL OR position('course_occupied_seats' in v_def) = 0 THEN
      RAISE EXCEPTION '2.1b-a: % ruft course_occupied_seats nicht auf', v_fn;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'payment_attempts' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION '2.1b-a: RLS auf payment_attempts fehlt';
  END IF;

  IF has_table_privilege('authenticated', 'public.payment_attempts', 'INSERT')
     OR has_table_privilege('authenticated', 'public.payment_attempts', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.payment_attempts', 'DELETE')
  THEN
    RAISE EXCEPTION '2.1b-a: authenticated darf payment_attempts nicht schreiben';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'payment_attempts_guard'
      AND tgrelid = 'public.payment_attempts'::regclass
  ) THEN
    RAISE EXCEPTION '2.1b-a: payment_attempts_guard fehlt';
  END IF;

  FOREACH v_fn IN ARRAY ARRAY[
    'yogaflow_private.course_occupied_seats(uuid)',
    'yogaflow_private.online_payments_effective(uuid)',
    'yogaflow_private.online_payment_required(uuid)',
    'yogaflow_private.create_pending_registration(uuid,uuid,text,timestamptz)',
    'yogaflow_private.create_payment_attempt(uuid,public.payment_provider,boolean)',
    'yogaflow_private.expire_payment_holds()',
    'yogaflow_private.cancel_payment_attempts_for_registration(uuid,text)',
    'public.create_pending_registration(uuid,uuid,text,timestamptz)',
    'public.create_payment_attempt(uuid,public.payment_provider,boolean)',
    'public.expire_payment_holds()',
    'public.set_payment_attempt_status(uuid,text,text,text)',
    'public.online_payments_effective(uuid)',
    'public.online_payment_required(uuid)'
  ]
  LOOP
    v_oid := v_fn::regprocedure;
    SELECT prosecdef AND (pg_get_function_identity_arguments(v_oid) IS NOT NULL)
      INTO v_ok
    FROM pg_proc WHERE oid = v_oid;
    IF NOT COALESCE((SELECT prosecdef FROM pg_proc WHERE oid = v_oid), false) THEN
      RAISE EXCEPTION '2.1b-a: % nicht SECURITY DEFINER', v_fn;
    END IF;
    v_def := pg_get_functiondef(v_oid);
    IF position('search_path' in v_def) = 0 THEN
      RAISE EXCEPTION '2.1b-a: % ohne search_path', v_fn;
    END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE')
       OR has_function_privilege('authenticated', v_oid, 'EXECUTE')
    THEN
      RAISE EXCEPTION '2.1b-a: % darf nicht für anon/authenticated EXECUTE haben', v_fn;
    END IF;
  END LOOP;

  IF to_regprocedure('public.set_tenant_payment_flags(uuid,boolean,boolean)') IS NOT NULL
     OR to_regprocedure('yogaflow_private.set_tenant_payment_flags(uuid,boolean,boolean)') IS NOT NULL
  THEN
    RAISE EXCEPTION '2.1b-a: set_tenant_payment_flags darf nicht existieren';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'registrations'
      AND column_name = 'cancelled_from_status'
  ) THEN
    RAISE EXCEPTION '2.1b-a: Spalte cancelled_from_status fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'registrations_set_cancelled_from_status'
      AND tgrelid = 'public.registrations'::regclass
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION '2.1b-a: Trigger registrations_set_cancelled_from_status fehlt';
  END IF;

  SELECT count(*)::integer INTO v_n
  FROM cron.job WHERE jobname = 'yogaflow_expire_payment_holds';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '2.1b-a: Cron-Job yogaflow_expire_payment_holds count=%', v_n;
  END IF;

  v_def := pg_get_functiondef('public.delete_tenant_complete(uuid)'::regprocedure);
  IF position('DELETE FROM public.payment_attempts' in v_def) = 0 THEN
    RAISE EXCEPTION '2.1b-a: delete_tenant_complete ohne payment_attempts';
  END IF;
  IF position('DELETE FROM public.payment_attempts' in v_def)
       > position('DELETE FROM public.payments' in v_def) THEN
    RAISE EXCEPTION '2.1b-a: payment_attempts muss vor payments gelöscht werden';
  END IF;
END;
$$;
