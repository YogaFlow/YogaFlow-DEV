-- 3.2c — Lese-RPCs für die Erstattungs-Oberfläche (Story 3.2c, Teil C).
-- allow: registration_refund_payment_ids,payment_refundable_cents,registration_refundable_cents,request_refund,request_online_refunds_for_registration,get_registration_refund_states,preview_course_cancel_refunds,preview_member_removal_refunds,get_payment_refunds
--
-- Eine Quelle: Auswahl der erstattbaren Zahlungen (registration_refund_payment_ids)
-- und Rest je Zahlung (payment_refundable_cents) werden von den Auslösern
-- (request_online_refunds_for_registration, request_refund) und den Vorschauen benutzt.
-- Diff request_refund: Rest-Berechnung ruft payment_refundable_cents (gleiche Formel).
-- Diff request_online_refunds_for_registration: Auswahl über registration_refund_payment_ids.
-- Diff get_payment_refunds: zusätzliche Felder amount_cents, refundable_cents, dispute_open.
--
-- Rückweg (Kommentar, läuft nicht):
--   Körper von request_refund, request_online_refunds_for_registration und
--   get_payment_refunds aus 20261002111000_s3_2a_refunds_core.sql erneut ausführen, dann
--   DROP FUNCTION IF EXISTS public.preview_member_removal_refunds(uuid);
--   DROP FUNCTION IF EXISTS public.preview_course_cancel_refunds(uuid[]);
--   DROP FUNCTION IF EXISTS public.get_registration_refund_states(uuid[]);
--   DROP FUNCTION IF EXISTS yogaflow_private.registration_refundable_cents(uuid);
--   DROP FUNCTION IF EXISTS yogaflow_private.payment_refundable_cents(uuid);
--   DROP FUNCTION IF EXISTS yogaflow_private.registration_refund_payment_ids(uuid);

-- ---------------------------------------------------------------------------
-- 1. Helfer (eine Quelle)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.registration_refund_payment_ids(
  p_registration_id uuid
)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SET search_path TO ''
AS $fn$
  SELECT p.id
  FROM public.payments p
  WHERE p.registration_id = p_registration_id
    AND p.provider = 'stripe'::public.payment_provider
    AND p.method = 'card'::public.payment_method
    AND p.amount_cents > 0
    AND p.reverses_payment_id IS NULL
    AND p.status = 'succeeded'::public.payment_status;
$fn$;

REVOKE ALL ON FUNCTION yogaflow_private.registration_refund_payment_ids(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION yogaflow_private.payment_refundable_cents(p_payment_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO ''
AS $fn$
  SELECT COALESCE((
    SELECT GREATEST(
      p.amount_cents - COALESCE((
        SELECT pg_catalog.sum(r.amount_cents)
        FROM public.payment_refunds r
        WHERE r.payment_id = p.id
          AND r.status IS DISTINCT FROM 'failed'
      ), 0)::integer,
      0
    )
    FROM public.payments p
    WHERE p.id = p_payment_id
      AND p.provider = 'stripe'::public.payment_provider
      AND p.method = 'card'::public.payment_method
      AND p.reverses_payment_id IS NULL
      AND p.amount_cents > 0
  ), 0);
$fn$;

COMMENT ON FUNCTION yogaflow_private.payment_refundable_cents(uuid) IS
  'Noch erstattbar = Betrag − Summe Erstattungen (status ≠ failed). 0 für Nicht-Stripe-Karte.';

REVOKE ALL ON FUNCTION yogaflow_private.payment_refundable_cents(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION yogaflow_private.registration_refundable_cents(
  p_registration_id uuid
)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO ''
AS $fn$
  SELECT COALESCE(pg_catalog.sum(
    yogaflow_private.payment_refundable_cents(ids.id)
  ), 0)::integer
  FROM yogaflow_private.registration_refund_payment_ids(p_registration_id) AS ids(id);
$fn$;

REVOKE ALL ON FUNCTION yogaflow_private.registration_refundable_cents(uuid)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Auslöser auf die Helfer umstellen (gleiches Verhalten)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.request_refund(
  p_payment_id uuid,
  p_amount_cents integer,
  p_reason text,
  p_requested_by uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_pay public.payments%ROWTYPE;
  v_remaining integer;
  v_amount integer;
  v_refund_id uuid;
  v_note text;
BEGIN
  IF p_reason IS NULL OR p_reason NOT IN (
    'course_cancelled', 'self_cancel_in_window', 'staff_unregister',
    'member_removed', 'late_payment', 'manual', 'provider_dashboard'
  ) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_REASON');
  END IF;

  SELECT * INTO v_pay
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_pay.provider IS DISTINCT FROM 'stripe'::public.payment_provider
     OR v_pay.method IS DISTINCT FROM 'card'::public.payment_method
     OR v_pay.reverses_payment_id IS NOT NULL
     OR v_pay.amount_cents <= 0
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  v_remaining := yogaflow_private.payment_refundable_cents(v_pay.id);
  IF v_remaining <= 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'code', 'NOTHING_TO_REFUND',
      'remaining_cents', 0
    );
  END IF;

  v_amount := COALESCE(p_amount_cents, v_remaining);
  IF v_amount <= 0 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
  END IF;
  IF v_amount > v_remaining THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error', 'AMOUNT_EXCEEDS_REMAINING',
      'remaining_cents', v_remaining
    );
  END IF;

  v_note := NULLIF(pg_catalog.btrim(COALESCE(p_note, '')), '');
  IF p_reason = 'manual' AND v_note IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOTE_REQUIRED');
  END IF;
  IF p_reason IS DISTINCT FROM 'manual' THEN
    v_note := NULL;
  END IF;

  INSERT INTO public.payment_refunds (
    tenant_id, payment_id, amount_cents, reason, note, requested_by, status
  ) VALUES (
    v_pay.tenant_id, v_pay.id, v_amount, p_reason, v_note, p_requested_by, 'pending'
  )
  RETURNING id INTO v_refund_id;

  PERFORM yogaflow_private.enqueue_provider_job(
    v_pay.tenant_id, 'refund_payment', NULL, v_pay.id, v_refund_id
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'code', 'REQUESTED',
    'refund_id', v_refund_id,
    'amount_cents', v_amount,
    'remaining_cents', v_remaining - v_amount
  );
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.request_refund(uuid, integer, text, uuid, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION yogaflow_private.request_online_refunds_for_registration(
  p_registration_id uuid,
  p_reason text,
  p_requested_by uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_pay record;
  v_res jsonb;
  v_sum integer := 0;
BEGIN
  FOR v_pay IN
    SELECT p.id
    FROM public.payments p
    WHERE p.id IN (
      SELECT yogaflow_private.registration_refund_payment_ids(p_registration_id)
    )
    ORDER BY p.created_at ASC, p.id ASC
    FOR UPDATE
  LOOP
    v_res := yogaflow_private.request_refund(
      v_pay.id, NULL, p_reason, p_requested_by, NULL
    );
    IF COALESCE(v_res ->> 'success', 'false') = 'true'
       AND v_res ->> 'code' = 'REQUESTED'
    THEN
      v_sum := v_sum + COALESCE((v_res ->> 'amount_cents')::integer, 0);
    END IF;
  END LOOP;
  RETURN v_sum;
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.request_online_refunds_for_registration(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Erstattungsstand je Buchung (Teilnehmende: eigene; Owner/Admin: Studio)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_registration_refund_states(p_registration_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_member uuid;
  v_tenant uuid;
  v_manager boolean;
BEGIN
  v_member := yogaflow_private.get_my_member_id();
  v_tenant := yogaflow_private.get_my_tenant_id();
  IF v_member IS NULL OR v_tenant IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;
  IF p_registration_ids IS NULL
     OR COALESCE(pg_catalog.array_length(p_registration_ids, 1), 0) > 200
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
  END IF;
  v_manager := yogaflow_private.is_tenant_manager();

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'items', COALESCE((
      SELECT pg_catalog.jsonb_agg(item ORDER BY item ->> 'registration_id')
      FROM (
        SELECT pg_catalog.jsonb_build_object(
          'registration_id', r.id,
          'payment_id', (
            SELECT p.id FROM public.payments p
            WHERE p.id IN (SELECT yogaflow_private.registration_refund_payment_ids(r.id))
            ORDER BY p.created_at DESC, p.id DESC
            LIMIT 1
          ),
          'payment_cents', COALESCE((
            SELECT pg_catalog.sum(p.amount_cents)
            FROM public.payments p
            WHERE p.id IN (SELECT yogaflow_private.registration_refund_payment_ids(r.id))
          ), 0)::integer,
          'refundable_cents', yogaflow_private.registration_refundable_cents(r.id),
          'refunded_cents', COALESCE((
            SELECT pg_catalog.sum(f.amount_cents)
            FROM public.payment_refunds f
            WHERE f.payment_id IN (SELECT yogaflow_private.registration_refund_payment_ids(r.id))
              AND f.status = 'succeeded'
          ), 0)::integer,
          'pending_cents', COALESCE((
            SELECT pg_catalog.sum(f.amount_cents)
            FROM public.payment_refunds f
            WHERE f.payment_id IN (SELECT yogaflow_private.registration_refund_payment_ids(r.id))
              AND f.status = 'pending'
          ), 0)::integer,
          'failed', COALESCE((
            SELECT f.status = 'failed'
            FROM public.payment_refunds f
            WHERE f.payment_id IN (SELECT yogaflow_private.registration_refund_payment_ids(r.id))
            ORDER BY f.created_at DESC, f.id DESC
            LIMIT 1
          ), false)
        ) AS item
        FROM public.registrations r
        WHERE r.id = ANY (p_registration_ids)
          AND r.tenant_id = v_tenant
          AND (r.user_id = v_member OR v_manager)
      ) s
    ), '[]'::jsonb)
  );
END;
$function$;

COMMENT ON FUNCTION public.get_registration_refund_states(uuid[]) IS
  '3.2c: Online-Zahlung und Erstattungsstand je Buchung. Eigene Buchungen oder Owner/Admin im Studio; fremde IDs fehlen still.';

REVOKE ALL ON FUNCTION public.get_registration_refund_states(uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_registration_refund_states(uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Vorschau Kursabsage (gleiche Buchungsauswahl wie cancel_course)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.preview_course_cancel_refunds(p_course_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tenant uuid;
BEGIN
  v_tenant := yogaflow_private.get_my_tenant_id();
  IF v_tenant IS NULL OR NOT yogaflow_private.is_tenant_manager() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;
  IF p_course_ids IS NULL
     OR COALESCE(pg_catalog.array_length(p_course_ids, 1), 0) > 200
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'courses', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'course_id', c.id,
          'paid_count', s.paid_count,
          'refund_cents', s.refund_cents
        )
        ORDER BY c.id
      )
      FROM public.courses c
      CROSS JOIN LATERAL (
        SELECT
          pg_catalog.count(*) FILTER (WHERE x.cents > 0)::integer AS paid_count,
          COALESCE(pg_catalog.sum(x.cents), 0)::integer AS refund_cents
        FROM (
          SELECT yogaflow_private.registration_refundable_cents(r.id) AS cents
          FROM public.registrations r
          WHERE r.course_id = c.id
            AND r.status IN (
              'registered'::public.registration_status,
              'waitlist'::public.registration_status,
              'pending_payment'::public.registration_status
            )
            AND r.cancellation_timestamp IS NULL
        ) x
      ) s
      WHERE c.id = ANY (p_course_ids)
        AND c.tenant_id = v_tenant
    ), '[]'::jsonb)
  );
END;
$function$;

COMMENT ON FUNCTION public.preview_course_cancel_refunds(uuid[]) IS
  '3.2c: Wie viele Buchungen online bezahlt sind und wie viel cancel_course automatisch erstatten würde. Nur Owner/Admin.';

REVOKE ALL ON FUNCTION public.preview_course_cancel_refunds(uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_course_cancel_refunds(uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Vorschau Person entfernen (gleiche Buchungsauswahl wie remove_member)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.preview_member_removal_refunds(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tenant uuid;
  v_target_tenant uuid;
  v_count integer;
  v_cents integer;
BEGIN
  v_tenant := yogaflow_private.get_my_tenant_id();
  IF v_tenant IS NULL OR NOT yogaflow_private.is_tenant_manager() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT u.tenant_id INTO v_target_tenant FROM public.users u WHERE u.id = p_member_id;
  IF NOT FOUND OR v_target_tenant IS DISTINCT FROM v_tenant THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  SELECT
    pg_catalog.count(*) FILTER (WHERE x.cents > 0)::integer,
    COALESCE(pg_catalog.sum(x.cents), 0)::integer
    INTO v_count, v_cents
  FROM (
    SELECT yogaflow_private.registration_refundable_cents(r.id) AS cents
    FROM public.registrations r
    JOIN public.courses c ON c.id = r.course_id
    WHERE r.user_id = p_member_id
      AND r.tenant_id = v_tenant
      AND r.cancellation_timestamp IS NULL
      AND r.status IN (
        'registered'::public.registration_status,
        'waitlist'::public.registration_status,
        'pending_payment'::public.registration_status
      )
      AND c.status = 'active'
      AND (c.date + COALESCE(c.time, TIME '00:00:00'))
            AT TIME ZONE 'Europe/Berlin' > pg_catalog.now()
  ) x;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'paid_count', v_count,
    'refund_cents', v_cents
  );
END;
$function$;

COMMENT ON FUNCTION public.preview_member_removal_refunds(uuid) IS
  '3.2c: Künftige online bezahlte Buchungen, die remove_member erstatten würde. Nur Owner/Admin.';

REVOKE ALL ON FUNCTION public.preview_member_removal_refunds(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_member_removal_refunds(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. get_payment_refunds: Betrag, Rest, Rückbuchung offen
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_payment_refunds(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tenant uuid;
  v_pay public.payments%ROWTYPE;
BEGIN
  v_tenant := yogaflow_private.get_my_tenant_id();
  IF v_tenant IS NULL OR NOT yogaflow_private.is_tenant_manager() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND OR v_pay.tenant_id IS DISTINCT FROM v_tenant THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'amount_cents', v_pay.amount_cents,
    'refundable_cents', yogaflow_private.payment_refundable_cents(p_payment_id),
    'dispute_open', EXISTS (
      SELECT 1 FROM public.payment_disputes d
      WHERE d.payment_id = p_payment_id
        AND d.status IN (
          'needs_response', 'warning_needs_response', 'under_review', 'warning_under_review'
        )
    ),
    'state', yogaflow_private.payment_refund_state(p_payment_id),
    'refunds', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', r.id,
          'amount_cents', r.amount_cents,
          'reason', r.reason,
          'note', r.note,
          'status', r.status,
          'provider_ref', r.provider_ref,
          'failure_code', r.failure_code,
          'requested_by', r.requested_by,
          'created_at', r.created_at
        )
        ORDER BY r.created_at ASC, r.id ASC
      )
      FROM public.payment_refunds r
      WHERE r.payment_id = p_payment_id
    ), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_payment_refunds(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_refunds(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Selbstprüfung
-- ---------------------------------------------------------------------------

DO $check$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.get_registration_refund_states(uuid[])',
    'public.preview_course_cancel_refunds(uuid[])',
    'public.preview_member_removal_refunds(uuid)',
    'public.get_payment_refunds(uuid)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '3.2c: % für anon ausführbar', v_fn;
    END IF;
    IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '3.2c: % für authenticated nicht ausführbar', v_fn;
    END IF;
  END LOOP;

  FOREACH v_fn IN ARRAY ARRAY[
    'yogaflow_private.registration_refund_payment_ids(uuid)',
    'yogaflow_private.payment_refundable_cents(uuid)',
    'yogaflow_private.registration_refundable_cents(uuid)',
    'yogaflow_private.request_refund(uuid, integer, text, uuid, text)',
    'yogaflow_private.request_online_refunds_for_registration(uuid, text, uuid)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
    THEN
      RAISE EXCEPTION '3.2c: % zu weit freigegeben', v_fn;
    END IF;
  END LOOP;
END;
$check$;
