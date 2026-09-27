-- A6-2 — Einlösen beim Buchen und nachträglich.
--
-- Zweck: register_for_course mit p_use_pass; admin_register mit
-- p_coverage; apply_pass_to_registration; undo_pass_redemption.
-- Nutzt yogaflow_private.pick_pass / redeem_pass / reverse_redemption (A6-1).
--
-- Bezug: A6, W1–W13. Zwischenstand: Abmeldung bucht Einheiten erst ab A6-3
-- zurück (nur DEV).
-- W10: Teilnehmende begleichen eigene offene Buchung per Karte vor Kursbeginn.
-- W11: undo Owner/Admin immer; Lehrende eigene Einlösung ≤ 15 Min.
-- W12: kostenlos → p_use_pass / p_coverage ignoriert, not_required.
-- W13: Warteliste nur open oder coverage_intent=pass; keine Zahlart.
--
-- Signaturen: alte register_for_course(uuid, uuid) und
-- admin_register_user_for_course(uuid, uuid) werden gedroppt.
--
-- Rückweg (Kommentar, läuft nicht):
--   DROP FUNCTION IF EXISTS public.undo_pass_redemption(uuid);
--   DROP FUNCTION IF EXISTS public.apply_pass_to_registration(uuid);
--   DROP FUNCTION IF EXISTS public.admin_register_user_for_course(uuid, uuid, text);
--   DROP FUNCTION IF EXISTS public.register_for_course(uuid, boolean);
--   -- Vorfassungen wiederherstellen:
--   -- register_for_course(uuid, uuid) aus 20260921233700
--   -- admin_register_user_for_course(uuid, uuid) aus 20260927145006

-- ---------------------------------------------------------------------------
-- 1. register_for_course(p_course_id, p_use_pass)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.register_for_course(uuid, uuid);

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

  SELECT COUNT(*) INTO v_current_count
  FROM public.registrations
  WHERE course_id = p_course_id
    AND status = 'registered'
    AND is_waitlist = false
    AND cancellation_timestamp IS NULL;

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
  'Selbstanmeldung. p_use_pass: mit Karte einlösen (Platz) bzw. coverage_intent auf Warteliste. Kostenlos ignoriert den Wunsch (W12).';

REVOKE ALL ON FUNCTION public.register_for_course(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_for_course(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. admin_register_user_for_course(..., p_coverage)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.admin_register_user_for_course(uuid, uuid);

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

  SELECT COUNT(*) INTO v_current_count
  FROM public.registrations
  WHERE course_id = p_course_id
    AND status = 'registered'
    AND is_waitlist = false
    AND cancellation_timestamp IS NULL;

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
  'Studio trägt ein. p_coverage: open|pass|cash|paypal_manual|bank_transfer. Warteliste: nur open/pass-Intent (W13).';

REVOKE ALL ON FUNCTION public.admin_register_user_for_course(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_register_user_for_course(uuid, uuid, text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. apply_pass_to_registration
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_pass_to_registration(
  p_registration_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_tenant uuid;
  v_reg public.registrations%ROWTYPE;
  v_course public.courses%ROWTYPE;
  v_manager boolean;
  v_pass_id uuid;
  v_movement_id uuid;
  v_remaining integer;
BEGIN
  v_actor := yogaflow_private.get_my_member_id();
  v_tenant := yogaflow_private.get_my_tenant_id();
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = p_registration_id;

  IF NOT FOUND OR v_reg.tenant_id IS DISTINCT FROM v_tenant THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  SELECT * INTO v_course
  FROM public.courses
  WHERE id = v_reg.course_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = p_registration_id
  FOR UPDATE;

  v_manager := yogaflow_private.is_tenant_manager();

  IF NOT v_manager
     AND NOT yogaflow_private.is_course_teacher(v_reg.course_id)
     AND v_reg.user_id IS DISTINCT FROM v_actor
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  -- W10: Selbst nur vor Kursbeginn
  IF NOT v_manager
     AND NOT yogaflow_private.is_course_teacher(v_reg.course_id)
     AND v_reg.user_id = v_actor
  THEN
    IF (v_course.date + COALESCE(v_course.time, TIME '00:00:00'))
         AT TIME ZONE 'Europe/Berlin' <= pg_catalog.now()
    THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
    END IF;
  END IF;

  IF v_reg.status IS DISTINCT FROM 'registered'::public.registration_status
     OR v_reg.cancellation_timestamp IS NOT NULL
     OR v_reg.coverage_status IS DISTINCT FROM 'open'::public.registration_coverage_status
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error', 'NOT_OPEN',
      'coverage_status', v_reg.coverage_status::text
    );
  END IF;

  v_pass_id := yogaflow_private.pick_pass_for_registration(v_reg.user_id, v_reg.course_id);
  IF v_pass_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NO_VALID_PASS');
  END IF;

  BEGIN
    v_movement_id := yogaflow_private.redeem_pass(v_reg.id, v_pass_id, v_actor);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM IN (
      'PASS_EMPTY', 'PASS_EXPIRED', 'PASS_MISMATCH',
      'NOT_PASS_ELIGIBLE', 'NOT_OPEN'
    ) THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', SQLERRM);
    END IF;
    RAISE;
  END;

  v_remaining := yogaflow_private.pass_remaining(v_pass_id);

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'pass_id', v_pass_id,
    'remaining', v_remaining,
    'movement_id', v_movement_id
  );
END;
$function$;

COMMENT ON FUNCTION public.apply_pass_to_registration(uuid) IS
  'Wandelt offene Buchung in Deckung pass. Owner/Admin, Kurslehrer, oder Teilnehmende selbst vor Kursbeginn (W10).';

REVOKE ALL ON FUNCTION public.apply_pass_to_registration(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_pass_to_registration(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. undo_pass_redemption
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.undo_pass_redemption(
  p_registration_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_tenant uuid;
  v_reg public.registrations%ROWTYPE;
  v_manager boolean;
  v_last public.pass_movements%ROWTYPE;
  v_result jsonb;
BEGIN
  v_actor := yogaflow_private.get_my_member_id();
  v_tenant := yogaflow_private.get_my_tenant_id();
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = p_registration_id;

  IF NOT FOUND OR v_reg.tenant_id IS DISTINCT FROM v_tenant THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  PERFORM 1
  FROM public.courses
  WHERE id = v_reg.course_id
  FOR UPDATE;

  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = p_registration_id
  FOR UPDATE;

  IF v_reg.status IS DISTINCT FROM 'registered'::public.registration_status
     OR v_reg.cancellation_timestamp IS NOT NULL
     OR v_reg.coverage_status IS DISTINCT FROM 'pass'::public.registration_coverage_status
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_OPEN');
  END IF;

  v_manager := yogaflow_private.is_tenant_manager();

  SELECT *
    INTO v_last
  FROM public.pass_movements m
  WHERE m.registration_id = v_reg.id
    AND m.kind = 'redeem'
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT 1;

  IF NOT v_manager THEN
    -- W11: Lehrende nur eigene Einlösung ≤ 15 Min.; Teilnehmende nie
    IF NOT yogaflow_private.is_course_teacher(v_reg.course_id) THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
    END IF;
    IF v_last.id IS NULL
       OR v_last.actor_member_id IS DISTINCT FROM v_actor
       OR v_last.created_at < (pg_catalog.now() - interval '15 minutes')
    THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
    END IF;
  END IF;

  BEGIN
    v_result := yogaflow_private.reverse_redemption(v_reg.id, v_actor, NULL);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM IN ('NOT_OPEN', 'PASS_MISMATCH', 'NOTE_TOO_LONG') THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', SQLERRM);
    END IF;
    RAISE;
  END;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'movement_id', v_result ->> 'movement_id',
    'pass_inactive', COALESCE((v_result ->> 'pass_inactive')::boolean, false),
    'coverage', 'open'
  );
END;
$function$;

COMMENT ON FUNCTION public.undo_pass_redemption(uuid) IS
  'Nimmt Einlösung zurück (aktive Buchung). Owner/Admin immer; Lehrende eigene ≤ 15 Min (W11).';

REVOKE ALL ON FUNCTION public.undo_pass_redemption(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.undo_pass_redemption(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Selbstprüfung (nur Katalog)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_reg_count integer;
  v_admin_count integer;
  v_apply oid;
  v_undo oid;
  v_reg_def text;
  v_search text;
BEGIN
  SELECT count(*)::integer INTO v_reg_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'register_for_course';

  IF v_reg_count <> 1 THEN
    RAISE EXCEPTION 'A6-2: register_for_course hat % Überladungen, erwartet 1', v_reg_count;
  END IF;

  IF to_regprocedure('public.register_for_course(uuid, boolean)') IS NULL THEN
    RAISE EXCEPTION 'A6-2: register_for_course(uuid, boolean) fehlt';
  END IF;

  IF to_regprocedure('public.register_for_course(uuid, uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'A6-2: alte Signatur register_for_course(uuid, uuid) existiert noch';
  END IF;

  SELECT count(*)::integer INTO v_admin_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'admin_register_user_for_course';

  IF v_admin_count <> 1 THEN
    RAISE EXCEPTION 'A6-2: admin_register_user_for_course hat % Überladungen, erwartet 1', v_admin_count;
  END IF;

  IF to_regprocedure('public.admin_register_user_for_course(uuid, uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'A6-2: admin_register_user_for_course(uuid, uuid, text) fehlt';
  END IF;

  IF to_regprocedure('public.admin_register_user_for_course(uuid, uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'A6-2: alte Signatur admin_register_user_for_course(uuid, uuid) existiert noch';
  END IF;

  SELECT p.oid INTO v_apply
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'apply_pass_to_registration'
    AND pg_get_function_identity_arguments(p.oid) = 'p_registration_id uuid';

  SELECT p.oid INTO v_undo
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'undo_pass_redemption'
    AND pg_get_function_identity_arguments(p.oid) = 'p_registration_id uuid';

  IF v_apply IS NULL OR v_undo IS NULL THEN
    RAISE EXCEPTION 'A6-2: apply_pass_to_registration oder undo_pass_redemption fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE oid = v_apply AND prosecdef
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE oid = v_undo AND prosecdef
  ) THEN
    RAISE EXCEPTION 'A6-2: neue RPCs müssen SECURITY DEFINER sein';
  END IF;

  SELECT option_value INTO v_search
  FROM pg_options_to_table((SELECT proconfig FROM pg_proc WHERE oid = v_apply))
  WHERE option_name = 'search_path';
  IF v_search IS DISTINCT FROM '""' AND v_search IS DISTINCT FROM '' THEN
    RAISE EXCEPTION 'A6-2: apply_pass_to_registration search_path ist nicht leer: %', v_search;
  END IF;

  SELECT option_value INTO v_search
  FROM pg_options_to_table((SELECT proconfig FROM pg_proc WHERE oid = v_undo))
  WHERE option_name = 'search_path';
  IF v_search IS DISTINCT FROM '""' AND v_search IS DISTINCT FROM '' THEN
    RAISE EXCEPTION 'A6-2: undo_pass_redemption search_path ist nicht leer: %', v_search;
  END IF;

  IF has_function_privilege('anon', v_apply, 'EXECUTE')
     OR has_function_privilege('anon', v_undo, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_apply, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_undo, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'A6-2: EXECUTE-Rechte der neuen RPCs falsch';
  END IF;

  IF has_function_privilege('anon', 'public.register_for_course(uuid, boolean)', 'EXECUTE')
     OR NOT has_function_privilege(
       'authenticated', 'public.register_for_course(uuid, boolean)', 'EXECUTE'
     )
     OR has_function_privilege(
       'anon', 'public.admin_register_user_for_course(uuid, uuid, text)', 'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated', 'public.admin_register_user_for_course(uuid, uuid, text)', 'EXECUTE'
     )
  THEN
    RAISE EXCEPTION 'A6-2: EXECUTE-Rechte register/admin_register falsch';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_reg_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'register_for_course'
    AND pg_get_function_identity_arguments(p.oid) = 'p_course_id uuid, p_use_pass boolean';

  IF v_reg_def NOT LIKE '%redeem_pass%' OR v_reg_def NOT LIKE '%coverage_intent%' THEN
    RAISE EXCEPTION 'A6-2: register_for_course enthält redeem_pass/coverage_intent nicht';
  END IF;
END;
$$;
