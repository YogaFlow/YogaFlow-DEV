-- 3.1 — Zahlungsübersicht für das Studio (Entscheidung 11, vorläufig).
-- allow: payment_overview_status,payment_refunded_cents,get_studio_payments
--
-- Nur lesend. Eine Zeile je positiver Zahlung; Erstattungen und Stornos sind Status.
-- Online-Erstattungsstand über payment_refund_state (3.2a), Rückbuchung über payment_disputes.
--
-- Rückweg (Kommentar, läuft nicht):
--   DROP FUNCTION IF EXISTS public.get_studio_payments(date, text, text, text, integer);
--   DROP FUNCTION IF EXISTS yogaflow_private.payment_refunded_cents(uuid);
--   DROP FUNCTION IF EXISTS yogaflow_private.payment_overview_status(uuid);

-- ---------------------------------------------------------------------------
-- 1. Helfer
-- ---------------------------------------------------------------------------

-- Bereits zurückgegeben: online = erfolgreiche Erstattungen, sonst Gegenbuchungen.
CREATE OR REPLACE FUNCTION yogaflow_private.payment_refunded_cents(p_payment_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO ''
AS $fn$
  SELECT CASE
    WHEN p.provider = 'stripe'::public.payment_provider THEN COALESCE((
      SELECT pg_catalog.sum(r.amount_cents)
      FROM public.payment_refunds r
      WHERE r.payment_id = p.id AND r.status = 'succeeded'
    ), 0)::integer
    ELSE COALESCE((
      SELECT -pg_catalog.sum(x.amount_cents)
      FROM public.payments x
      WHERE x.reverses_payment_id = p.id
    ), 0)::integer
  END
  FROM public.payments p
  WHERE p.id = p_payment_id;
$fn$;

REVOKE ALL ON FUNCTION yogaflow_private.payment_refunded_cents(uuid)
  FROM PUBLIC, anon, authenticated;

-- Reihenfolge: Rückbuchung offen → Erstattung läuft → fehlgeschlagen → erstattet
-- → teilweise erstattet → storniert → bezahlt.
CREATE OR REPLACE FUNCTION yogaflow_private.payment_overview_status(p_payment_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO ''
AS $fn$
  WITH p AS (
    SELECT pay.id, pay.provider, pay.amount_cents, pay.subject_type
    FROM public.payments pay
    WHERE pay.id = p_payment_id
      AND pay.reverses_payment_id IS NULL
      AND pay.amount_cents > 0
  )
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.payment_disputes d
      WHERE d.payment_id = p.id
        AND d.status IN (
          'needs_response', 'warning_needs_response', 'under_review', 'warning_under_review'
        )
    ) THEN 'dispute_open'
    WHEN p.provider = 'stripe'::public.payment_provider THEN
      CASE
        WHEN EXISTS (
          SELECT 1 FROM public.payment_refunds r
          WHERE r.payment_id = p.id AND r.status = 'pending'
        ) THEN 'refund_pending'
        WHEN (
          SELECT r.status FROM public.payment_refunds r
          WHERE r.payment_id = p.id
          ORDER BY r.created_at DESC, r.id DESC
          LIMIT 1
        ) = 'failed' THEN 'refund_failed'
        WHEN yogaflow_private.payment_refunded_cents(p.id) >= p.amount_cents THEN 'refunded'
        WHEN yogaflow_private.payment_refunded_cents(p.id) > 0 THEN 'partially_refunded'
        ELSE 'paid'
      END
    WHEN yogaflow_private.payment_refunded_cents(p.id) > 0 THEN 'canceled'
    WHEN p.subject_type = 'pass_purchase' AND EXISTS (
      SELECT 1 FROM public.passes ps
      WHERE ps.payment_id = p.id AND ps.status = 'revoked'
    ) THEN 'canceled'
    ELSE 'paid'
  END
  FROM p;
$fn$;

REVOKE ALL ON FUNCTION yogaflow_private.payment_overview_status(uuid)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Lese-RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_studio_payments(
  p_month date DEFAULT NULL,
  p_kind text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_page integer DEFAULT 1
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
    WHERE v_search IS NULL
      OR (COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) ILIKE v_search
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

REVOKE ALL ON FUNCTION public.get_studio_payments(date, text, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_studio_payments(date, text, text, text, integer)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Selbstprüfung
-- ---------------------------------------------------------------------------

DO $check$
DECLARE
  v_fn text;
BEGIN
  v_fn := 'public.get_studio_payments(date, text, text, text, integer)';
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION '3.1: % für anon ausführbar', v_fn;
  END IF;
  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION '3.1: % für authenticated nicht ausführbar', v_fn;
  END IF;

  FOREACH v_fn IN ARRAY ARRAY[
    'yogaflow_private.payment_refunded_cents(uuid)',
    'yogaflow_private.payment_overview_status(uuid)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
    THEN
      RAISE EXCEPTION '3.1: % zu weit freigegeben', v_fn;
    END IF;
  END LOOP;
END;
$check$;
