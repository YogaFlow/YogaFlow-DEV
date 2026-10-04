-- ZW-1 Nachtrag N1: einmaliger „Neu“-Hinweis für Gewohnheits-Vor-Ort-Zahler.
-- allow: booking_payment_options,mark_online_pay_hint_on_registration
-- Rückweg:
--   DROP TRIGGER IF EXISTS registrations_mark_online_pay_hint ON public.registrations;
--   DROP FUNCTION IF EXISTS yogaflow_private.mark_online_pay_hint_on_registration();
--   ALTER TABLE public.users DROP COLUMN IF EXISTS online_pay_hint_seen_at;
--   -- booking_payment_options aus 20261004200000 wiederherstellen

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS online_pay_hint_seen_at timestamptz;

COMMENT ON COLUMN public.users.online_pay_hint_seen_at IS
  'ZW-1 N1: gesetzt bei erster Buchung nach Hinweis; NULL = Hinweis ggf. noch zeigen.';

-- Client darf die Spalte nicht selbst schreiben (nur SECURITY DEFINER / Trigger).
DO $$
BEGIN
  IF has_column_privilege('authenticated', 'public.users', 'online_pay_hint_seen_at', 'UPDATE') THEN
    REVOKE UPDATE (online_pay_hint_seen_at) ON public.users FROM authenticated;
  END IF;
  IF has_column_privilege('anon', 'public.users', 'online_pay_hint_seen_at', 'UPDATE') THEN
    REVOKE UPDATE (online_pay_hint_seen_at) ON public.users FROM anon;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION yogaflow_private.mark_online_pay_hint_on_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE public.users u
     SET online_pay_hint_seen_at = COALESCE(u.online_pay_hint_seen_at, pg_catalog.now())
   WHERE u.id = NEW.user_id
     AND u.online_pay_hint_seen_at IS NULL;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.mark_online_pay_hint_on_registration()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS registrations_mark_online_pay_hint ON public.registrations;
CREATE TRIGGER registrations_mark_online_pay_hint
  AFTER INSERT ON public.registrations
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.mark_online_pay_hint_on_registration();

CREATE OR REPLACE FUNCTION public.booking_payment_options(
  p_course_id uuid DEFAULT NULL,
  p_amount_cents integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid := yogaflow_private.get_my_member_id();
  v_tenant_id uuid := yogaflow_private.get_my_tenant_id();
  v_amount integer := p_amount_cents;
  v_course_tenant uuid;
  v_course_price numeric;
  v_pass_eligible boolean;
  v_course_date date;
  v_onsite boolean;
  v_block text;
  v_online_ok boolean;
  v_methods jsonb := '[]'::jsonb;
  v_default text := NULL;
  v_pass record;
  v_remaining integer;
  v_label text;
  v_hint_null boolean := false;
  v_had_onsite boolean := false;
  v_had_online boolean := false;
  v_show_hint boolean := false;
BEGIN
  IF v_member_id IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_course_id IS NOT NULL THEN
    SELECT c.tenant_id, c.price, COALESCE(c.pass_eligible, true), c.date
      INTO v_course_tenant, v_course_price, v_pass_eligible, v_course_date
    FROM public.courses c
    WHERE c.id = p_course_id;

    IF NOT FOUND OR v_course_tenant IS DISTINCT FROM v_tenant_id THEN
      RAISE EXCEPTION 'FORBIDDEN'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_amount IS NULL THEN
      v_amount := pg_catalog.round(COALESCE(v_course_price, 0) * 100)::integer;
    END IF;
  END IF;

  SELECT s.allow_onsite_payment
    INTO v_onsite
  FROM yogaflow_private.tenant_payment_settings_for(v_tenant_id) s;

  v_block := yogaflow_private.online_method_block_reason(v_tenant_id, v_amount);
  v_online_ok := v_block IS NULL;

  -- Z3: Karte nur mit gültigem Guthaben für diesen Kurs
  IF p_course_id IS NOT NULL
     AND v_pass_eligible
     AND COALESCE(v_course_price, 0) > 0
  THEN
    SELECT p.id, p.name
      INTO v_pass
    FROM public.passes p
    WHERE p.member_id = v_member_id
      AND p.tenant_id = v_tenant_id
      AND p.status = 'active'
      AND p.valid_until >= v_course_date
      AND yogaflow_private.pass_remaining(p.id) >= 1
    ORDER BY p.valid_until ASC, p.created_at ASC, p.id ASC
    LIMIT 1;

    IF FOUND THEN
      v_remaining := yogaflow_private.pass_remaining(v_pass.id);
      v_label := v_pass.name || ' · noch ' || v_remaining::text;
      v_methods := v_methods || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'method', 'pass',
          'pass_id', v_pass.id,
          'label', v_label,
          'remaining', v_remaining
        )
      );
      v_default := 'pass';
    END IF;
  END IF;

  IF v_online_ok THEN
    v_methods := v_methods || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('method', 'online')
    );
    IF v_default IS NULL THEN
      v_default := 'online';
    END IF;
  END IF;

  IF COALESCE(v_onsite, true) THEN
    v_methods := v_methods || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('method', 'onsite')
    );
    IF v_default IS NULL THEN
      v_default := 'onsite';
    END IF;
  END IF;

  IF pg_catalog.jsonb_array_length(v_methods) = 0 THEN
    v_methods := pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('method', 'onsite')
    );
    v_default := 'onsite';
  END IF;

  -- N1: einmaliger Hinweis, wenn Online Standard und Person bisher nur vor Ort
  IF v_default = 'online' THEN
    SELECT u.online_pay_hint_seen_at IS NULL
      INTO v_hint_null
    FROM public.users u
    WHERE u.id = v_member_id;

    IF COALESCE(v_hint_null, false) THEN
      v_had_onsite := EXISTS (
        SELECT 1
        FROM public.registrations r
        WHERE r.user_id = v_member_id
          AND r.tenant_id = v_tenant_id
          AND (
            r.coverage_intent = 'onsite'
            OR (
              r.status = 'registered'
              AND r.coverage_status = 'open'
              AND (r.coverage_intent IS NULL OR r.coverage_intent = 'onsite')
            )
            OR EXISTS (
              SELECT 1
              FROM public.payments p
              WHERE p.registration_id = r.id
                AND p.method = ANY (
                  ARRAY[
                    'cash'::public.payment_method,
                    'bank_transfer'::public.payment_method,
                    'paypal_manual'::public.payment_method
                  ]
                )
                AND p.status = 'succeeded'
            )
          )
      );
      v_had_online := EXISTS (
        SELECT 1
        FROM public.payments p
        JOIN public.registrations r ON r.id = p.registration_id
        WHERE r.user_id = v_member_id
          AND r.tenant_id = v_tenant_id
          AND p.method = 'card'::public.payment_method
          AND p.status = 'succeeded'
      );
      v_show_hint := v_had_onsite AND NOT v_had_online;
    END IF;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'methods', v_methods,
    'default', v_default,
    'online_required', v_online_ok AND NOT COALESCE(v_onsite, true),
    'online_offered', v_block IS DISTINCT FROM 'ONLINE_DISABLED'
      AND v_block IS DISTINCT FROM 'PLATFORM_DISABLED',
    'online_ready', v_online_ok,
    'online_unavailable_reason', v_block,
    'reason', v_block,
    'show_online_pay_hint', v_show_hint
  );
END;
$function$;

COMMENT ON FUNCTION public.booking_payment_options(uuid, integer) IS
  'ZW-1/N1: Zahlungswege + Default (pass → online → onsite) + show_online_pay_hint.';

REVOKE ALL ON FUNCTION public.booking_payment_options(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.booking_payment_options(uuid, integer)
  TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'online_pay_hint_seen_at'
  ) THEN
    RAISE EXCEPTION 'ZW1-N1: Spalte online_pay_hint_seen_at fehlt';
  END IF;

  IF has_column_privilege('authenticated', 'public.users', 'online_pay_hint_seen_at', 'UPDATE')
     OR has_column_privilege('anon', 'public.users', 'online_pay_hint_seen_at', 'UPDATE') THEN
    RAISE EXCEPTION 'ZW1-N1: Client darf online_pay_hint_seen_at nicht UPDATE';
  END IF;

  IF has_function_privilege('anon', 'public.booking_payment_options(uuid, integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'yogaflow_private.mark_online_pay_hint_on_registration()', 'EXECUTE') THEN
    RAISE EXCEPTION 'ZW1-N1: anon hat EXECUTE';
  END IF;

  IF pg_catalog.pg_get_functiondef('public.booking_payment_options(uuid, integer)'::regprocedure)
     NOT LIKE '%show_online_pay_hint%' THEN
    RAISE EXCEPTION 'ZW1-N1: booking_payment_options ohne show_online_pay_hint';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'registrations_mark_online_pay_hint'
  ) THEN
    RAISE EXCEPTION 'ZW1-N1: Trigger registrations_mark_online_pay_hint fehlt';
  END IF;
END $$;
