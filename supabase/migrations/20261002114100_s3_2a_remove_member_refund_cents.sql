-- 3.2a — remove_member: K7-Körper + refund_cents (Trigger erledigt R2).
-- Diff gegen DEV/K7: Variable v_refund_cents, Aufruf nach Cancel-UPDATE,
-- Feld in Event-Payload und Return.
-- allow: remove_member,delete_tenant_complete

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
  v_refund_cents integer := 0;
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

  v_refund_cents := yogaflow_private.refund_cents_this_xact(v_tenant, 'member_removed');

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
      'deleted_registrations', v_deleted_regs,
      'refund_cents', v_refund_cents
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
    'deleted_registrations', v_deleted_regs,
    'refund_cents', v_refund_cents
  );
END;
$function$;

COMMENT ON FUNCTION public.remove_member(uuid) IS
  'Entfernt Profil. W5/K7; 3.2a Online-Erstattung künftiger Buchungen via Trigger.';

REVOKE ALL ON FUNCTION public.remove_member(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_member(uuid) TO authenticated;

-- delete_tenant_complete: payment_refunds / payment_disputes vor payments
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
    SET LOCAL yogaflow.allow_email_delivery_delete = 'on';
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
    DELETE FROM public.email_deliveries WHERE tenant_id = p_tenant_id;
    DELETE FROM public.events WHERE tenant_id = p_tenant_id;
    DELETE FROM public.user_notifications WHERE tenant_id = p_tenant_id;
    DELETE FROM public.messages WHERE tenant_id = p_tenant_id;
    DELETE FROM public.pass_movements WHERE tenant_id = p_tenant_id;
    DELETE FROM public.passes WHERE tenant_id = p_tenant_id;
    DELETE FROM public.provider_jobs WHERE tenant_id = p_tenant_id;
    DELETE FROM public.payment_attempts WHERE tenant_id = p_tenant_id;
    DELETE FROM public.payment_disputes WHERE tenant_id = p_tenant_id;
    DELETE FROM public.payment_refunds WHERE tenant_id = p_tenant_id;
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
  'Löscht Mandanten inkl. payment_refunds/disputes (3.2a). Nur postgres/service_role.';

REVOKE ALL ON FUNCTION public.delete_tenant_complete(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tenant_complete(uuid)
  TO postgres, service_role;
