-- ZW-1 Nachtrag N4 / Z7: zuletzt gewählte Zahlart am Mitglied (serverseitig).
-- allow: booking_payment_options,register_for_course,remember_booking_pay_method
-- Rückweg:
--   ALTER TABLE public.users DROP COLUMN IF EXISTS last_booking_pay_method;
--   DROP FUNCTION IF EXISTS yogaflow_private.remember_booking_pay_method(uuid, text);
--   -- booking_payment_options / register_for_course aus 20261004210000 bzw. 20261004200000

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_booking_pay_method text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_last_booking_pay_method_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_last_booking_pay_method_check
      CHECK (
        last_booking_pay_method IS NULL
        OR last_booking_pay_method = ANY (ARRAY['pass'::text, 'online'::text, 'onsite'::text])
      );
  END IF;
END $$;

COMMENT ON COLUMN public.users.last_booking_pay_method IS
  'ZW-1 Z7: zuletzt erfolgreiche Buchungs-Zahlart; Default nach gültiger Karte.';

DO $$
BEGIN
  IF has_column_privilege('authenticated', 'public.users', 'last_booking_pay_method', 'UPDATE') THEN
    REVOKE UPDATE (last_booking_pay_method) ON public.users FROM authenticated;
  END IF;
  IF has_column_privilege('anon', 'public.users', 'last_booking_pay_method', 'UPDATE') THEN
    REVOKE UPDATE (last_booking_pay_method) ON public.users FROM anon;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION yogaflow_private.remember_booking_pay_method(
  p_member_id uuid,
  p_method text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_member_id IS NULL THEN
    RETURN;
  END IF;
  IF p_method IS NULL OR p_method NOT IN ('pass', 'online', 'onsite') THEN
    RETURN;
  END IF;
  UPDATE public.users u
     SET last_booking_pay_method = p_method
   WHERE u.id = p_member_id;
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.remember_booking_pay_method(uuid, text)
  FROM PUBLIC, anon, authenticated;

-- Default: Karte → zuletzt gewählt (wenn verfügbar) → Online → Vor Ort
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
  v_last text;
  v_has_pass boolean := false;
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
      v_has_pass := true;
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

  -- Z7: ohne Karte → zuletzt gewählte Zahlart, wenn noch verfügbar
  IF NOT v_has_pass THEN
    SELECT u.last_booking_pay_method
      INTO v_last
    FROM public.users u
    WHERE u.id = v_member_id;

    IF v_last IN ('online', 'onsite', 'pass')
       AND EXISTS (
         SELECT 1
         FROM pg_catalog.jsonb_array_elements(v_methods) e
         WHERE e->>'method' = v_last
       )
    THEN
      v_default := v_last;
    END IF;
  END IF;

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
  'ZW-1/N4: Zahlungswege; Default Z7 pass → last → online → onsite; show_online_pay_hint.';

REVOKE ALL ON FUNCTION public.booking_payment_options(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.booking_payment_options(uuid, integer)
  TO authenticated;

-- register_for_course: nach Erfolg last_booking_pay_method merken
CREATE OR REPLACE FUNCTION public.register_for_course(
  p_course_id uuid,
  p_use_pass boolean DEFAULT false,
  p_method text DEFAULT NULL
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
  v_method text;
  v_amount integer;
  v_online_ok boolean;
  v_onsite boolean;
  v_opts jsonb;
  v_intent text;
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
  v_amount := pg_catalog.round(COALESCE(v_course_price, 0) * 100)::integer;
  v_online_ok := yogaflow_private.online_method_available(v_tenant_id, v_amount);
  SELECT s.allow_onsite_payment INTO v_onsite
  FROM yogaflow_private.tenant_payment_settings_for(v_tenant_id) s;

  IF v_free THEN
    v_method := 'onsite';
  ELSIF COALESCE(p_use_pass, false) THEN
    v_method := 'pass';
  ELSIF p_method IS NOT NULL THEN
    v_method := lower(btrim(p_method));
  ELSE
    v_opts := public.booking_payment_options(p_course_id, v_amount);
    v_method := COALESCE(v_opts->>'default', 'onsite');
  END IF;

  IF v_method NOT IN ('pass', 'online', 'onsite') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_METHOD',
      'message', 'Ungültiger Zahlungsweg.'
    );
  END IF;

  IF v_method = 'pass' AND v_free THEN
    v_method := 'onsite';
  END IF;

  IF v_method = 'online' AND NOT v_online_ok THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ONLINE_UNAVAILABLE',
      'message', 'Online-Zahlung ist gerade nicht verfügbar.'
    );
  END IF;

  IF v_method = 'onsite' AND NOT COALESCE(v_onsite, true) AND NOT v_free THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ONSITE_UNAVAILABLE',
      'message', 'Vor-Ort-Zahlung ist in diesem Studio nicht angeboten.'
    );
  END IF;

  v_want_pass := (v_method = 'pass');

  v_current_count := yogaflow_private.course_occupied_seats(p_course_id);

  IF v_current_count >= v_max_participants THEN
    SELECT COUNT(*)::integer + 1 INTO v_next_position
    FROM public.registrations
    WHERE course_id = p_course_id
      AND is_waitlist = true
      AND status = 'waitlist'
      AND cancellation_timestamp IS NULL;

    v_intent := CASE
      WHEN v_free THEN NULL
      WHEN v_method = 'pass' THEN 'pass'
      WHEN v_method = 'online' THEN 'online'
      WHEN v_method = 'onsite' THEN 'onsite'
      ELSE NULL
    END;

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
      v_intent
    )
    RETURNING id INTO v_reg_id;

    PERFORM yogaflow_private.remember_booking_pay_method(v_user_id, v_method);

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

  IF NOT v_free AND v_method = 'online' THEN
    v_hold_expires := pg_catalog.now() + interval '15 minutes';
    v_reg_id := yogaflow_private.create_pending_registration(
      p_course_id,
      v_user_id,
      'checkout',
      v_hold_expires
    );

    PERFORM yogaflow_private.remember_booking_pay_method(v_user_id, 'online');

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

  PERFORM yogaflow_private.remember_booking_pay_method(v_user_id, v_method);

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

COMMENT ON FUNCTION public.register_for_course(uuid, boolean, text) IS
  'ZW-1/N4: Selbstanmeldung mit p_method; speichert last_booking_pay_method (Z7).';

REVOKE ALL ON FUNCTION public.register_for_course(uuid, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_for_course(uuid, boolean, text)
  TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'last_booking_pay_method'
  ) THEN
    RAISE EXCEPTION 'ZW1-N4: Spalte last_booking_pay_method fehlt';
  END IF;

  IF has_column_privilege('authenticated', 'public.users', 'last_booking_pay_method', 'UPDATE')
     OR has_column_privilege('anon', 'public.users', 'last_booking_pay_method', 'UPDATE') THEN
    RAISE EXCEPTION 'ZW1-N4: Client darf last_booking_pay_method nicht UPDATE';
  END IF;

  IF pg_catalog.pg_get_functiondef('public.booking_payment_options(uuid, integer)'::regprocedure)
     NOT LIKE '%last_booking_pay_method%' THEN
    RAISE EXCEPTION 'ZW1-N4: booking_payment_options ohne Z7';
  END IF;

  IF pg_catalog.pg_get_functiondef('public.register_for_course(uuid, boolean, text)'::regprocedure)
     NOT LIKE '%remember_booking_pay_method%' THEN
    RAISE EXCEPTION 'ZW1-N4: register_for_course ohne remember_booking_pay_method';
  END IF;

  IF has_function_privilege('anon', 'public.booking_payment_options(uuid, integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.register_for_course(uuid, boolean, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ZW1-N4: anon hat EXECUTE';
  END IF;
END $$;
