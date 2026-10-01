-- K7 — remove_member: Buchungen mit pi_…-Versuch nicht löschen (FK payment_attempts)
-- Regression aus 2.2a-4a W5: Versuche mit provider_ref bleiben → RESTRICT auf
-- registrations, wenn Absage nicht member_removed war (cancel_course / expire).
--
-- Rückweg (DEV): remove_member aus 20261001100000 wiederherstellen.


CREATE OR REPLACE FUNCTION public.remove_member(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
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

  PERFORM yogaflow_private.cancel_payment_attempts_for_registration(r.id, 'MEMBER_REMOVED')
  FROM public.registrations r
  WHERE r.user_id = v_target.id
    AND r.tenant_id = v_tenant
    AND r.cancel_reason = 'member_removed'
    AND r.hold_reason IS NOT NULL;

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
  ) OR EXISTS (
    -- W5: Versuch mit Stripe-Referenz → anonymisieren, nie löschen
    SELECT 1
    FROM public.payment_attempts a
    JOIN public.registrations r ON r.id = a.registration_id
    WHERE r.user_id = v_target.id
      AND a.provider_ref IS NOT NULL
  );

  IF NOT v_money THEN
    v_mode := 'deleted';
    SELECT count(*)::integer
      INTO v_deleted_regs
    FROM public.registrations
    WHERE user_id = v_target.id;

    PERFORM pg_catalog.set_config('yogaflow.allow_payment_delete', 'on', true);
    PERFORM pg_catalog.set_config('yogaflow.allow_email_delivery_delete', 'on', true);

    -- S6a / 4.3: Outbox vor Löschen der Person/Anmeldungen.
    DELETE FROM public.email_deliveries d
    WHERE d.registration_id IN (
      SELECT r.id FROM public.registrations r WHERE r.user_id = v_target.id
    );

    DELETE FROM public.payment_attempts a
    WHERE a.payment_id IS NULL
      AND a.provider_ref IS NULL
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

    PERFORM pg_catalog.set_config('yogaflow.allow_payment_delete', 'on', true);
    PERFORM pg_catalog.set_config('yogaflow.allow_email_delivery_delete', 'on', true);

    -- S6a / 4.3: alle Outbox-Zeilen der Person (auch behaltene Anmeldungen).
    DELETE FROM public.email_deliveries d
    WHERE d.registration_id IN (
      SELECT r.id FROM public.registrations r WHERE r.user_id = v_target.id
    );

    DELETE FROM public.payment_attempts a
    WHERE a.payment_id IS NULL
      AND a.provider_ref IS NULL
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
      )
      -- K7: pi_…-Versuch bleibt (RESTRICT) — Buchung behalten
      AND NOT EXISTS (
        SELECT 1
        FROM public.payment_attempts a
        WHERE a.registration_id = r.id
          AND a.provider_ref IS NOT NULL
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
  'Entfernt Profil. W5: pi_… → anonymized; K7: Buchung mit pi_…-Versuch behalten.';

REVOKE ALL ON FUNCTION public.remove_member(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_member(uuid) TO authenticated;

DO $$
DECLARE
  v_def text;
  v_del_pos integer;
  v_guard_pos integer;
BEGIN
  v_def := pg_get_functiondef('public.remove_member(uuid)'::regprocedure);
  v_del_pos := position('DELETE FROM public.registrations r' in v_def);
  v_guard_pos := position(
    'a.registration_id = r.id' in v_def
  );
  -- Zweites Vorkommen: Guard im DELETE (erstes ist W5 in v_money).
  IF v_del_pos = 0 THEN
    RAISE EXCEPTION 'K7: DELETE registrations fehlt';
  END IF;
  IF v_guard_pos = 0
     OR position('a.registration_id = r.id' in substr(v_def, v_del_pos)) = 0
  THEN
    RAISE EXCEPTION 'K7: DELETE-Guard payment_attempts.provider_ref fehlt';
  END IF;
  IF position('a.provider_ref IS NOT NULL' in substr(v_def, v_del_pos)) = 0 THEN
    RAISE EXCEPTION 'K7: DELETE-Guard ohne provider_ref IS NOT NULL';
  END IF;
END;
$$;
