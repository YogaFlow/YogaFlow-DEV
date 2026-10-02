-- 3.2a — Schema: payment_refunds, payment_disputes, provider_jobs.refund_id,
-- Index-Regel Gegenzeilen (Entscheidung 10 / Freigabe 02.10.2026).
-- allow: payment_refund_state
--
-- Rückweg (Kommentar, läuft nicht):
--   DROP TRIGGER IF EXISTS registrations_request_online_refund ON public.registrations;
--   DROP FUNCTION IF EXISTS yogaflow_private.registrations_request_online_refund();
--   DROP FUNCTION IF EXISTS yogaflow_private.payment_refund_state(uuid);
--   DROP TABLE IF EXISTS public.payment_disputes;
--   DROP TABLE IF EXISTS public.payment_refunds;
--   ALTER TABLE public.provider_jobs DROP COLUMN IF EXISTS refund_id;
--   DROP INDEX IF EXISTS public.payments_one_manual_reversal_idx;
--   CREATE UNIQUE INDEX payments_one_reversal_idx ON public.payments (reverses_payment_id)
--     WHERE reverses_payment_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 1. Gegenzeilen: Manual eine, Stripe mehrere (Summenprüfung in record_online_refund)
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS public.payments_one_reversal_idx;

CREATE UNIQUE INDEX payments_one_manual_reversal_idx
  ON public.payments (reverses_payment_id)
  WHERE reverses_payment_id IS NOT NULL
    AND provider = 'manual'::public.payment_provider;

COMMENT ON COLUMN public.payments.reverses_payment_id IS
  'Gesetzt genau dann, wenn amount_cents negativ ist. Manual: höchstens eine Gegenzeile (Index). Stripe: mehrere erlaubt; Summe der Gegenzeilen ≤ Original (record_online_refund).';

COMMENT ON TABLE public.payments IS
  'Zahlungen und manuelle Vermerke. Append-only außer status, status_changed_at, settled_at, provider_ref. Korrektur als Gegenzeile. Online-Erstattungsstand aus payment_refunds (nicht payments.status).';

-- ---------------------------------------------------------------------------
-- 2. payment_refunds
-- ---------------------------------------------------------------------------

CREATE TABLE public.payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL REFERENCES public.payments (id) ON DELETE RESTRICT,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  reason text NOT NULL CHECK (
    reason = ANY (ARRAY[
      'course_cancelled',
      'self_cancel_in_window',
      'staff_unregister',
      'member_removed',
      'late_payment',
      'manual',
      'provider_dashboard'
    ]::text[])
  ),
  note text CHECK (note IS NULL OR pg_catalog.char_length(note) <= 200),
  requested_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status = ANY (ARRAY['pending', 'succeeded', 'failed']::text[])
  ),
  provider_ref text,
  failure_code text,
  reversal_payment_id uuid REFERENCES public.payments (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT payment_refunds_note_manual_check CHECK (
    (reason = 'manual' AND note IS NOT NULL AND pg_catalog.btrim(note) <> '')
    OR (reason IS DISTINCT FROM 'manual')
  ),
  CONSTRAINT payment_refunds_provider_ref_format CHECK (
    provider_ref IS NULL OR provider_ref ~ '^re_'
  )
);

CREATE UNIQUE INDEX payment_refunds_provider_ref_unique
  ON public.payment_refunds (provider_ref)
  WHERE provider_ref IS NOT NULL;

CREATE INDEX payment_refunds_payment_id_idx
  ON public.payment_refunds (payment_id);

CREATE INDEX payment_refunds_tenant_created_idx
  ON public.payment_refunds (tenant_id, created_at);

COMMENT ON TABLE public.payment_refunds IS
  'Erstattungsvorgänge je Stripe-Zahlung (R8). note nur bei manual, nie in Events/Glocke/E-Mail.';

COMMENT ON COLUMN public.payment_refunds.note IS
  'Pflicht bei reason=manual, ≤ 200. Nur Audit / get_payment_refunds für Owner/Admin.';

ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.payment_refunds FROM PUBLIC, anon, authenticated;
-- keine Policies → nur SECURITY DEFINER / service_role über RPCs

-- ---------------------------------------------------------------------------
-- 3. payment_disputes (R6, kein Hauptbuch)
-- ---------------------------------------------------------------------------

CREATE TABLE public.payment_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL REFERENCES public.payments (id) ON DELETE RESTRICT,
  provider_ref text NOT NULL,
  status text NOT NULL DEFAULT 'needs_response',
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT payment_disputes_provider_ref_format CHECK (provider_ref ~ '^dp_')
);

CREATE UNIQUE INDEX payment_disputes_provider_ref_unique
  ON public.payment_disputes (provider_ref);

CREATE INDEX payment_disputes_payment_id_idx
  ON public.payment_disputes (payment_id);

COMMENT ON TABLE public.payment_disputes IS
  'Stripe-Disputes (R6). Speichern + Glocke; Hauptbuch erst 1b.';

ALTER TABLE public.payment_disputes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.payment_disputes FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. provider_jobs.refund_id (ersetzt Unique je payment_id für refund_payment)
-- ---------------------------------------------------------------------------

ALTER TABLE public.provider_jobs
  ADD COLUMN IF NOT EXISTS refund_id uuid REFERENCES public.payment_refunds (id) ON DELETE CASCADE;

ALTER TABLE public.provider_jobs
  DROP CONSTRAINT IF EXISTS provider_jobs_kind_payload_check;

-- refund_id zunächst optional (Backfill in 20261002114000), danach strikt.
ALTER TABLE public.provider_jobs
  ADD CONSTRAINT provider_jobs_kind_payload_check CHECK (
    (kind = 'cancel_payment_intent' AND attempt_id IS NOT NULL AND payment_id IS NULL AND refund_id IS NULL)
    OR (kind = 'refund_payment' AND payment_id IS NOT NULL AND attempt_id IS NULL)
  );

DROP INDEX IF EXISTS public.provider_jobs_kind_payment_unique;

CREATE UNIQUE INDEX provider_jobs_kind_refund_unique
  ON public.provider_jobs (kind, refund_id)
  WHERE refund_id IS NOT NULL;

COMMENT ON COLUMN public.provider_jobs.refund_id IS
  'Bei refund_payment: payment_refunds.id; Stripe-Idempotency-Key = refund_id (R8).';

-- ---------------------------------------------------------------------------
-- 5. Ableitung Erstattungsstand (R3 Freigabe: payments.status bleibt succeeded)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.payment_refund_state(p_payment_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO ''
AS $fn$
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.id = p_payment_id
        AND p.reverses_payment_id IS NULL
        AND p.amount_cents > 0
    ) THEN NULL
    WHEN EXISTS (
      SELECT 1 FROM public.payment_refunds r
      WHERE r.payment_id = p_payment_id AND r.status = 'pending'
    ) THEN 'refund_pending'
    WHEN COALESCE((
      SELECT pg_catalog.sum(r.amount_cents)
      FROM public.payment_refunds r
      WHERE r.payment_id = p_payment_id AND r.status = 'succeeded'
    ), 0) <= 0 THEN 'open'
    WHEN COALESCE((
      SELECT pg_catalog.sum(r.amount_cents)
      FROM public.payment_refunds r
      WHERE r.payment_id = p_payment_id AND r.status = 'succeeded'
    ), 0) >= (
      SELECT p.amount_cents FROM public.payments p WHERE p.id = p_payment_id
    ) THEN 'refunded'
    ELSE 'partially_refunded'
  END;
$fn$;

COMMENT ON FUNCTION yogaflow_private.payment_refund_state(uuid) IS
  'open | partially_refunded | refunded | refund_pending — nicht payments.status.';

REVOKE ALL ON FUNCTION yogaflow_private.payment_refund_state(uuid)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Selbstprüfung
-- ---------------------------------------------------------------------------

DO $check$
DECLARE
  v_idx text;
BEGIN
  SELECT indexdef INTO v_idx
  FROM pg_indexes
  WHERE schemaname = 'public' AND indexname = 'payments_one_manual_reversal_idx';
  IF v_idx IS NULL OR v_idx NOT ILIKE '%manual%' THEN
    RAISE EXCEPTION '3.2a: payments_one_manual_reversal_idx fehlt oder falsch';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'payments_one_reversal_idx'
  ) THEN
    RAISE EXCEPTION '3.2a: alter payments_one_reversal_idx noch vorhanden';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'provider_jobs' AND column_name = 'refund_id'
  ) THEN
    RAISE EXCEPTION '3.2a: provider_jobs.refund_id fehlt';
  END IF;
  IF to_regclass('public.payment_refunds') IS NULL
     OR to_regclass('public.payment_disputes') IS NULL
  THEN
    RAISE EXCEPTION '3.2a: Tabellen fehlen';
  END IF;
END;
$check$;
