-- 2.2b B3: Glocke bei Ablauf einer pending_payment-Buchung. Keine E-Mail.
-- checkout → hold_expired_checkout
-- promotion → hold_expired_promotion
-- action_path = Kursdetail (/course/<id>)
-- Datum wie die übrigen Glocken: DD.MM.YYYY
--
-- Ausgang: pg_get_functiondef(yogaflow_private.expire_payment_holds) auf DEV
-- am 02.10.2026 — Körper wie 20260929140001, plus Glocke.
-- public.expire_payment_holds (Alias) und der Cron-Job bleiben unverändert.
--
-- Rückweg: Funktion aus 20260929140001 wiederherstellen (ohne user_notifications).

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
  v_course_title text;
  v_course_date date;
  v_note_type text;
  v_note_body text;
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

    SELECT c.title, c.date
    INTO v_course_title, v_course_date
    FROM public.courses c
    WHERE c.id = v_reg.course_id;

    v_note_type := CASE v_reg.hold_reason
      WHEN 'promotion' THEN 'hold_expired_promotion'
      ELSE 'hold_expired_checkout'
    END;

    v_note_body := CASE v_reg.hold_reason
      WHEN 'promotion' THEN pg_catalog.format(
        'Du hast den Platz in „%s“ am %s nicht rechtzeitig bezahlt. Er ist an die nächste Person gegangen.',
        COALESCE(v_course_title, ''),
        pg_catalog.to_char(v_course_date, 'DD.MM.YYYY')
      )
      ELSE pg_catalog.format(
        'Deine Reservierung für „%s“ am %s ist abgelaufen. Der Platz ist wieder frei.',
        COALESCE(v_course_title, ''),
        pg_catalog.to_char(v_course_date, 'DD.MM.YYYY')
      )
    END;

    INSERT INTO public.user_notifications (
      tenant_id, user_id, type, body, course_id, action_path
    ) VALUES (
      v_reg.tenant_id,
      v_reg.user_id,
      v_note_type,
      v_note_body,
      v_reg.course_id,
      '/course/' || v_reg.course_id::text
    );

    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.expire_payment_holds() IS
  'Gibt abgelaufene pending_payment frei (R4). Eine Glocke je Person, keine E-Mail. Nachrücken über Trigger. Idempotent.';

REVOKE ALL ON FUNCTION yogaflow_private.expire_payment_holds()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION yogaflow_private.expire_payment_holds()
  TO service_role;

DO $$
DECLARE
  v_def text := pg_get_functiondef('yogaflow_private.expire_payment_holds()'::regprocedure);
BEGIN
  IF v_def NOT LIKE '%user_notifications%' THEN
    RAISE EXCEPTION 'Selbstprüfung: expire_payment_holds ohne Glocke';
  END IF;
  IF v_def NOT LIKE '%hold_expired_checkout%'
     OR v_def NOT LIKE '%hold_expired_promotion%' THEN
    RAISE EXCEPTION 'Selbstprüfung: expire_payment_holds ohne die beiden Glocken-Typen';
  END IF;
  IF v_def NOT LIKE '%/course/%' THEN
    RAISE EXCEPTION 'Selbstprüfung: expire_payment_holds ohne Kursdetail-Pfad';
  END IF;
  IF v_def LIKE '%email_deliveries%' THEN
    RAISE EXCEPTION 'Selbstprüfung: expire_payment_holds legt eine E-Mail an';
  END IF;
  IF has_function_privilege('anon', 'yogaflow_private.expire_payment_holds()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'yogaflow_private.expire_payment_holds()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Selbstprüfung: anon oder authenticated hat EXECUTE auf expire_payment_holds';
  END IF;
END;
$$;
