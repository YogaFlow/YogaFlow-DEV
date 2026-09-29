-- 2.1b-b K3 — promote_to_pending_payment, Glockentext mit Frist.
--
-- Basis: promote_from_waitlist per pg_get_functiondef auf DEV (nach 20260929150000).
-- Extrahiert den doppelten pending_payment-Block in einen Helfer.
-- Logik unverändert außer Glockentext (Frist als Text).
--
-- Rückweg:
--   DROP FUNCTION IF EXISTS yogaflow_private.promote_to_pending_payment(uuid, timestamptz);
--   -- promote_from_waitlist aus 20260929150000 wiederherstellen.

CREATE OR REPLACE FUNCTION yogaflow_private.promote_to_pending_payment(
  p_registration_id uuid,
  p_deadline timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_reg public.registrations%ROWTYPE;
  v_course public.courses%ROWTYPE;
  v_event_id uuid;
  v_notification_body text;
BEGIN
  IF p_deadline IS NULL THEN
    RAISE EXCEPTION 'INVALID_HOLD_EXPIRES'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_reg
  FROM public.registrations
  WHERE id = p_registration_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
    INTO v_course
  FROM public.courses
  WHERE id = v_reg.course_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COURSE_NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.registrations
  SET
    status = 'pending_payment'::public.registration_status,
    is_waitlist = false,
    waitlist_position = NULL,
    hold_expires_at = p_deadline,
    hold_reason = 'promotion',
    coverage_status = 'open'::public.registration_coverage_status,
    coverage_intent = NULL,
    registered_at = pg_catalog.now()
  WHERE id = p_registration_id;

  v_event_id := yogaflow_private.insert_event(
    v_reg.tenant_id,
    'registration.pending_payment',
    'registration',
    p_registration_id,
    pg_catalog.jsonb_build_object(
      'registration_id', p_registration_id,
      'course_id', v_reg.course_id,
      'user_id', v_reg.user_id,
      'hold_reason', 'promotion',
      'hold_expires_at', p_deadline
    ),
    pg_catalog.gen_random_uuid()
  );

  PERFORM yogaflow_private.insert_audit(
    v_reg.tenant_id,
    NULL,
    'registration.pending_payment',
    'registrations',
    p_registration_id,
    ARRAY['status', 'hold_expires_at', 'hold_reason', 'coverage_status']::text[],
    v_event_id
  );

  INSERT INTO public.email_deliveries (
    tenant_id,
    event_id,
    kind,
    registration_id,
    status,
    next_attempt_at
  ) VALUES (
    v_reg.tenant_id,
    v_event_id,
    'waitlist_promoted_payment_required',
    p_registration_id,
    'pending',
    pg_catalog.now()
  );

  v_notification_body := pg_catalog.format(
    'Du bist in „%s“ am %s um %s nachgerückt. Dein Platz ist bis %s, %s Uhr reserviert. Bitte bezahle bis dahin online, sonst geht er an die nächste Person.',
    v_course.title,
    pg_catalog.to_char(v_course.date, 'DD.MM.YYYY'),
    pg_catalog.to_char(v_course.time, 'HH24:MI'),
    pg_catalog.to_char(p_deadline AT TIME ZONE 'Europe/Berlin', 'DD.MM.YYYY'),
    pg_catalog.to_char(p_deadline AT TIME ZONE 'Europe/Berlin', 'HH24:MI')
  );

  INSERT INTO public.user_notifications (
    tenant_id,
    user_id,
    type,
    body,
    course_id,
    action_path,
    metadata
  ) VALUES (
    v_reg.tenant_id,
    v_reg.user_id,
    'waitlist_promoted_payment_required',
    v_notification_body,
    v_reg.course_id,
    '/my-registrations',
    pg_catalog.jsonb_build_object(
      'promoted_from_waitlist', true,
      'hold_expires_at', p_deadline
    )
  );
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.promote_to_pending_payment(uuid, timestamptz) IS
  'K3: Warteliste → pending_payment inkl. Event, Audit, Outbox, Glocke mit Frist.';

REVOKE ALL ON FUNCTION yogaflow_private.promote_to_pending_payment(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;

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
  v_course_price numeric;
  v_tenant_id uuid;
  v_status text;
  v_notification_body text;
  v_pass_id uuid;
  v_remaining integer;
  v_redeem_ok boolean;
  v_online_req boolean;
  v_deadline timestamptz;
BEGIN
  SELECT max_participants, title, date, time, price, tenant_id, status
  INTO v_max_participants, v_course_title, v_course_date, v_course_time,
       v_course_price, v_tenant_id, v_status
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

    -- S1/S3: Online-Pflicht nur bei kostenpflichtigem Kurs.
    v_online_req := yogaflow_private.online_payment_required(v_tenant_id)
      AND COALESCE(v_course_price, 0) > 0;

    IF v_online_req THEN
      v_deadline := yogaflow_private.promotion_hold_deadline(p_course_id);
      -- S3: Frist nicht in der Zukunft → niemand rückt nach.
      IF v_deadline IS NULL OR v_deadline <= pg_catalog.now() THEN
        PERFORM yogaflow_private.insert_event(
          v_tenant_id,
          'waitlist.promotion_skipped',
          'course',
          p_course_id,
          pg_catalog.jsonb_build_object(
            'course_id', p_course_id,
            'reason_code', 'TOO_CLOSE_TO_START'
          ),
          pg_catalog.gen_random_uuid()
        );
        EXIT;
      END IF;
    END IF;

    v_redeem_ok := false;
    v_remaining := NULL;

    IF NOT v_online_req THEN
      -- S1 Fall 1: wie heute registered (+ Karte bei Zustimmung).
      UPDATE public.registrations
      SET status = 'registered',
          is_waitlist = false,
          waitlist_position = NULL,
          registered_at = pg_catalog.now()
      WHERE id = v_next_user.id;

      IF v_next_user.coverage_intent IS NOT DISTINCT FROM 'pass' THEN
        BEGIN
          v_pass_id := yogaflow_private.pick_pass_for_registration(
            v_next_user.user_id, p_course_id
          );
          IF v_pass_id IS NOT NULL THEN
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

    ELSIF v_next_user.coverage_intent IS NOT DISTINCT FROM 'pass' THEN
      -- S1 Fall 2: Online-Pflicht + Karte → registered+pass, sonst Fall 3.
      UPDATE public.registrations
      SET status = 'registered',
          is_waitlist = false,
          waitlist_position = NULL,
          registered_at = pg_catalog.now()
      WHERE id = v_next_user.id;

      BEGIN
        v_pass_id := yogaflow_private.pick_pass_for_registration(
          v_next_user.user_id, p_course_id
        );
        IF v_pass_id IS NOT NULL THEN
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

      IF v_redeem_ok THEN
        v_notification_body := pg_catalog.format(
          'Du hast einen Platz im Kurs „%s“ am %s um %s bekommen.',
          v_course_title,
          pg_catalog.to_char(v_course_date, 'DD.MM.YYYY'),
          pg_catalog.to_char(v_course_time, 'HH24:MI')
        );
        v_notification_body := v_notification_body
          || pg_catalog.format(
            ' Mit deiner Karte bezahlt (noch %s).',
            v_remaining
          );

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
      ELSE
        -- Einlösen gescheitert → pending_payment (S1 Fall 3 / K3).
        PERFORM yogaflow_private.promote_to_pending_payment(
          v_next_user.id, v_deadline
        );
      END IF;

    ELSE
      -- S1 Fall 3: Online-Pflicht ohne Karte → pending_payment (K3).
      PERFORM yogaflow_private.promote_to_pending_payment(
        v_next_user.id, v_deadline
      );
    END IF;

    v_current_count := v_current_count + 1;
  END LOOP;

  PERFORM public.compact_waitlist_positions(p_course_id);
END;
$function$;

COMMENT ON FUNCTION public.promote_from_waitlist(uuid) IS
  'Nachrücken S1–S5. pending_payment über promote_to_pending_payment (K3).';

REVOKE ALL ON FUNCTION public.promote_from_waitlist(uuid)
  FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_def text;
  v_oid oid;
  v_ok boolean;
BEGIN
  IF to_regprocedure('yogaflow_private.promote_to_pending_payment(uuid, timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'K3: promote_to_pending_payment fehlt';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'promote_from_waitlist';

  IF position('promote_to_pending_payment' in v_def) = 0 THEN
    RAISE EXCEPTION 'K3: promote_from_waitlist ruft promote_to_pending_payment nicht auf';
  END IF;
  -- Doppelter Block darf nicht mehr inline stehen.
  IF (
    length(v_def)
    - length(replace(v_def, 'waitlist_promoted_payment_required', ''))
  ) / length('waitlist_promoted_payment_required') > 0
  THEN
    RAISE EXCEPTION 'K3: Glocken-Typ noch inline in promote_from_waitlist';
  END IF;
  IF position('email_deliveries' in v_def) > 0 THEN
    RAISE EXCEPTION 'K3: email_deliveries noch inline in promote_from_waitlist';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'yogaflow_private' AND p.proname = 'promote_to_pending_payment';

  IF position('bis %s, %s Uhr reserviert' in v_def) = 0 THEN
    RAISE EXCEPTION 'K3: Glockentext ohne Frist-Formulierung';
  END IF;
  IF position('Europe/Berlin' in v_def) = 0 THEN
    RAISE EXCEPTION 'K3: Frist ohne Europe/Berlin';
  END IF;

  v_oid := to_regprocedure('yogaflow_private.promote_to_pending_payment(uuid, timestamptz)');
  SELECT NOT has_function_privilege('anon', v_oid, 'EXECUTE')
     AND NOT has_function_privilege('authenticated', v_oid, 'EXECUTE')
    INTO v_ok;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'K3: anon/authenticated hat EXECUTE auf promote_to_pending_payment';
  END IF;
END;
$$;
