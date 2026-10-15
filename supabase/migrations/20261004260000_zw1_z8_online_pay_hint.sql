-- ZW-1 Z8: „Neu“-Hinweis unabhängig vom Standard-Weg (Entscheidung 14).
-- allow: booking_payment_options
-- Vorher (N1/N4): show_online_pay_hint nur wenn default = online → widerspricht Z7.
-- Neu: Hinweis wenn Vor-Ort-Histor, nie online, Online verfügbar, online_pay_hint_seen_at leer.
-- online_pay_hint_seen_at weiterhin erst nach nächster Buchung (Trigger unverändert).
-- Rückweg: Hint-Block wieder mit IF v_default = 'online' THEN (Stand 20261004220000).

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

  -- Z8: Hinweis unabhängig vom Standard-Weg, solange Online verfügbar ist
  IF v_online_ok THEN
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
  'ZW-1/Z8: Zahlungswege; Default Z7; show_online_pay_hint unabhängig vom Standard.';

REVOKE ALL ON FUNCTION public.booking_payment_options(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.booking_payment_options(uuid, integer)
  TO authenticated;

DO $$
DECLARE
  v_def text := pg_get_functiondef('public.booking_payment_options(uuid, integer)'::regprocedure);
BEGIN
  IF position('Z8:' IN v_def) = 0 THEN
    RAISE EXCEPTION 'ZW1-Z8: booking_payment_options ohne Z8-Hinweisblock';
  END IF;
  IF position('IF v_default = ''online'' THEN' IN v_def) > 0 THEN
    RAISE EXCEPTION 'ZW1-Z8: show_online_pay_hint darf nicht an default=online hängen';
  END IF;
  IF position('show_online_pay_hint' IN v_def) = 0 THEN
    RAISE EXCEPTION 'ZW1-Z8: show_online_pay_hint fehlt';
  END IF;
END;
$$;
