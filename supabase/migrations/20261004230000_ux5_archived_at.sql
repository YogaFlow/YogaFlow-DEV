-- UX-5: archived_at für Kurse und Mitglieder (reine Anzeige-Markierung).
-- allow: get_studio_payments,register_for_course,registrations_archived_guard
-- Rückweg:
--   DROP TRIGGER IF EXISTS registrations_archived_guard ON public.registrations;
--   DROP FUNCTION IF EXISTS yogaflow_private.registrations_archived_guard();
--   DROP FUNCTION IF EXISTS public.get_studio_payments(date, text, text, text, integer, boolean);
--   -- get_studio_payments aus 20261002220000 erneut anwenden
--   ALTER TABLE public.courses DROP COLUMN IF EXISTS archived_at;
--   ALTER TABLE public.users DROP COLUMN IF EXISTS archived_at;

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.courses.archived_at IS
  'UX-5: Ausgeblendet aus Listen/Buchung; Zahlungen bleiben. Kein Löschen.';
COMMENT ON COLUMN public.users.archived_at IS
  'UX-5: Mitglied ausgeblendet aus Listen/Check-in; Zahlungen bleiben. Keine Anonymisierung.';

DO $$
BEGIN
  IF has_column_privilege('authenticated', 'public.courses', 'archived_at', 'UPDATE') THEN
    REVOKE UPDATE (archived_at) ON public.courses FROM authenticated;
  END IF;
  IF has_column_privilege('anon', 'public.courses', 'archived_at', 'UPDATE') THEN
    REVOKE UPDATE (archived_at) ON public.courses FROM anon;
  END IF;
  IF has_column_privilege('authenticated', 'public.users', 'archived_at', 'UPDATE') THEN
    REVOKE UPDATE (archived_at) ON public.users FROM authenticated;
  END IF;
  IF has_column_privilege('anon', 'public.users', 'archived_at', 'UPDATE') THEN
    REVOKE UPDATE (archived_at) ON public.users FROM anon;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS courses_tenant_archived_idx
  ON public.courses (tenant_id)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS users_tenant_archived_idx
  ON public.users (tenant_id)
  WHERE archived_at IS NULL;

-- Server-Prüfung: keine neue Anmeldung auf archivierten Kurs/Person
CREATE OR REPLACE FUNCTION yogaflow_private.registrations_archived_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = NEW.course_id
      AND c.archived_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'COURSE_ARCHIVED'
      USING ERRCODE = 'P0001',
            MESSAGE = 'Dieser Kurs ist nicht mehr buchbar.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = NEW.user_id
      AND u.archived_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'MEMBER_ARCHIVED'
      USING ERRCODE = 'P0001',
            MESSAGE = 'Dieses Mitglied ist archiviert.';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.registrations_archived_guard()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS registrations_archived_guard ON public.registrations;
CREATE TRIGGER registrations_archived_guard
  BEFORE INSERT ON public.registrations
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.registrations_archived_guard();

-- register_for_course: frühe, klare jsonb-Antwort vor Insert
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
  v_user_archived timestamptz;
  v_course_tenant uuid;
  v_max_participants integer;
  v_course_date date;
  v_course_status text;
  v_course_archived timestamptz;
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

  SELECT tenant_id, role, archived_at
  INTO v_tenant_id, v_user_role, v_user_archived
  FROM public.users
  WHERE id = v_user_id;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Kein Tenant für Benutzer gefunden.'
    );
  END IF;

  IF v_user_archived IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'MEMBER_ARCHIVED',
      'message', 'Dein Profil ist archiviert.'
    );
  END IF;

  IF v_user_role NOT IN ('user', 'teacher') THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Owner und Admins können sich nicht für Kurse anmelden.'
    );
  END IF;

  SELECT tenant_id, max_participants, date, status, teacher_id, price, archived_at
  INTO v_course_tenant, v_max_participants, v_course_date, v_course_status,
       v_teacher_id, v_course_price, v_course_archived
  FROM public.courses
  WHERE id = p_course_id
  FOR UPDATE;

  IF NOT FOUND OR v_max_participants IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Kurs nicht gefunden.'
    );
  END IF;

  IF v_course_archived IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'COURSE_ARCHIVED',
      'message', 'Dieser Kurs ist nicht mehr buchbar.'
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

REVOKE ALL ON FUNCTION public.register_for_course(uuid, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_for_course(uuid, boolean, text)
  TO authenticated;

-- Zahlungen: Standard ohne Archiv, optional einschließen
DROP FUNCTION IF EXISTS public.get_studio_payments(date, text, text, text, integer);

CREATE OR REPLACE FUNCTION public.get_studio_payments(
  p_month date DEFAULT NULL,
  p_kind text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_include_archived boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  c_page_size constant integer := 50;
  v_tenant uuid;
  v_month date;
  v_from timestamptz;
  v_to timestamptz;
  v_page integer;
  v_search text;
  v_total integer;
  v_items jsonb;
BEGIN
  v_tenant := yogaflow_private.get_my_tenant_id();
  IF v_tenant IS NULL OR NOT yogaflow_private.is_tenant_manager() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF p_kind IS NOT NULL AND p_kind NOT IN ('cash', 'paypal_manual', 'bank_transfer', 'online') THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_KIND');
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN (
    'paid', 'partially_refunded', 'refunded', 'refund_pending', 'refund_failed',
    'dispute_open', 'canceled'
  ) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_STATUS');
  END IF;

  v_month := pg_catalog.date_trunc(
    'month',
    COALESCE(p_month, (pg_catalog.now() AT TIME ZONE 'Europe/Berlin')::date)
  )::date;
  v_from := v_month::timestamp AT TIME ZONE 'Europe/Berlin';
  v_to := (v_month + interval '1 month')::timestamp AT TIME ZONE 'Europe/Berlin';
  v_page := GREATEST(COALESCE(p_page, 1), 1);
  v_search := NULLIF(pg_catalog.btrim(COALESCE(p_search, '')), '');
  IF v_search IS NOT NULL THEN
    v_search := '%' || pg_catalog.replace(
      pg_catalog.replace(pg_catalog.replace(pg_catalog.left(v_search, 60), '\', '\\'), '%', '\%'),
      '_', '\_'
    ) || '%';
  END IF;

  WITH base AS (
    SELECT
      p.id,
      p.provider,
      p.method,
      p.amount_cents,
      p.subject_type,
      COALESCE(p.received_at, p.created_at) AS paid_at,
      COALESCE(r.user_id, ps.member_id) AS member_id,
      r.course_id,
      ps.name AS pass_name
    FROM public.payments p
    LEFT JOIN public.registrations r
      ON p.subject_type = 'registration' AND r.id = p.registration_id
    LEFT JOIN public.passes ps
      ON p.subject_type = 'pass_purchase' AND ps.payment_id = p.id
    WHERE p.tenant_id = v_tenant
      AND p.reverses_payment_id IS NULL
      AND p.amount_cents > 0
      AND p.status NOT IN (
        'initiated'::public.payment_status,
        'processing'::public.payment_status,
        'failed'::public.payment_status,
        'canceled'::public.payment_status
      )
      AND COALESCE(p.received_at, p.created_at) >= v_from
      AND COALESCE(p.received_at, p.created_at) < v_to
      AND (
        p_kind IS NULL
        OR (p_kind = 'online' AND p.provider = 'stripe'::public.payment_provider)
        OR (
          p_kind <> 'online'
          AND p.provider = 'manual'::public.payment_provider
          AND p.method::text = p_kind
        )
      )
  ),
  enriched AS (
    SELECT
      b.*,
      u.first_name,
      u.last_name,
      c.title AS course_title,
      c.date AS course_date,
      c.time AS course_time,
      yogaflow_private.payment_overview_status(b.id) AS status,
      yogaflow_private.payment_refunded_cents(b.id) AS refunded_cents
    FROM base b
    LEFT JOIN public.users u ON u.id = b.member_id AND u.tenant_id = v_tenant
    LEFT JOIN public.courses c ON c.id = b.course_id AND c.tenant_id = v_tenant
    WHERE (v_search IS NULL
      OR (COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) ILIKE v_search)
      AND (
        COALESCE(p_include_archived, false)
        OR (
          (u.id IS NULL OR u.archived_at IS NULL)
          AND (c.id IS NULL OR c.archived_at IS NULL)
        )
      )
  ),
  filtered AS (
    SELECT * FROM enriched e
    WHERE p_status IS NULL OR e.status = p_status
  )
  SELECT
    (SELECT pg_catalog.count(*)::integer FROM filtered),
    COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'payment_id', f.id,
          'paid_at', f.paid_at,
          'member_id', f.member_id,
          'first_name', f.first_name,
          'last_name', f.last_name,
          'subject_type', f.subject_type,
          'course_id', f.course_id,
          'course_title', f.course_title,
          'course_date', f.course_date,
          'course_time', f.course_time,
          'pass_name', f.pass_name,
          'kind', CASE WHEN f.provider = 'stripe'::public.payment_provider
                    THEN 'online' ELSE f.method::text END,
          'amount_cents', f.amount_cents,
          'refunded_cents', f.refunded_cents,
          'status', f.status
        )
        ORDER BY f.paid_at DESC, f.id DESC
      )
      FROM (
        SELECT * FROM filtered
        ORDER BY paid_at DESC, id DESC
        LIMIT c_page_size OFFSET (v_page - 1) * c_page_size
      ) f
    ), '[]'::jsonb)
  INTO v_total, v_items;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'month', v_month,
    'page', v_page,
    'page_size', c_page_size,
    'total', v_total,
    'items', v_items
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_studio_payments(date, text, text, text, integer, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_studio_payments(date, text, text, text, integer, boolean)
  TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'archived_at'
  ) THEN
    RAISE EXCEPTION 'UX-5: courses.archived_at fehlt';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'archived_at'
  ) THEN
    RAISE EXCEPTION 'UX-5: users.archived_at fehlt';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'registrations_archived_guard' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'UX-5: Trigger registrations_archived_guard fehlt';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_studio_payments'
      AND pg_get_function_identity_arguments(p.oid)
        = 'p_month date, p_kind text, p_status text, p_search text, p_page integer, p_include_archived boolean'
  ) THEN
    RAISE EXCEPTION 'UX-5: get_studio_payments Signatur falsch';
  END IF;
END $$;
