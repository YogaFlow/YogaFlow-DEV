-- 3.2b Hotfix: Stripe Dispute-Refs du_… (API 2026-08-26.dahlia) neben dp_…
-- allow: record_payment_dispute
--
-- Befund DEV: charge.dispute.created mit id du_… → INVALID_EVENT / CHECK ^dp_
-- Körper von record_payment_dispute unverändert außer Prefix-Regex.
-- Rückweg: CHECK und Regex wieder nur ^dp_

ALTER TABLE public.payment_disputes
  DROP CONSTRAINT IF EXISTS payment_disputes_provider_ref_format;

ALTER TABLE public.payment_disputes
  ADD CONSTRAINT payment_disputes_provider_ref_format
  CHECK (provider_ref ~ '^(dp_|du_)');

CREATE OR REPLACE FUNCTION yogaflow_private.record_payment_dispute(
  p_payment_id uuid,
  p_provider_ref text,
  p_amount_cents integer,
  p_status text DEFAULT 'needs_response'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_pay public.payments%ROWTYPE;
  v_row public.payment_disputes%ROWTYPE;
  v_new boolean := false;
  v_event_id uuid;
  v_body text;
BEGIN
  IF p_provider_ref IS NULL OR p_provider_ref !~ '^(dp_|du_)' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_REF');
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
  END IF;

  SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND OR v_pay.provider IS DISTINCT FROM 'stripe'::public.payment_provider THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  SELECT * INTO v_row
  FROM public.payment_disputes
  WHERE provider_ref = p_provider_ref
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.payment_disputes
    SET
      status = COALESCE(NULLIF(pg_catalog.btrim(p_status), ''), status),
      amount_cents = p_amount_cents,
      updated_at = pg_catalog.now()
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  ELSE
    v_new := true;
    INSERT INTO public.payment_disputes (
      tenant_id, payment_id, provider_ref, status, amount_cents
    ) VALUES (
      v_pay.tenant_id, v_pay.id, p_provider_ref,
      COALESCE(NULLIF(pg_catalog.btrim(p_status), ''), 'needs_response'),
      p_amount_cents
    )
    RETURNING * INTO v_row;
  END IF;

  v_event_id := yogaflow_private.insert_event(
    v_pay.tenant_id,
    'payment.disputed',
    'payment',
    v_pay.id,
    pg_catalog.jsonb_build_object(
      'dispute_id', v_row.id,
      'payment_id', v_pay.id,
      'provider_ref', p_provider_ref,
      'amount_cents', p_amount_cents,
      'status', v_row.status,
      'is_new', v_new
    ),
    pg_catalog.gen_random_uuid()
  );

  IF v_new THEN
    v_body := 'Rückbuchung offen: Eine Kartenzahlung wurde bei Stripe bestritten.';
    INSERT INTO public.user_notifications (
      tenant_id, user_id, type, body, course_id, action_path, metadata
    )
    SELECT
      v_pay.tenant_id,
      u.id,
      'payment_dispute_opened',
      v_body,
      NULL,
      '/open-payments',
      pg_catalog.jsonb_build_object(
        'dispute_id', v_row.id,
        'payment_id', v_pay.id,
        'for_managers', true
      )
    FROM public.users u
    WHERE u.tenant_id = v_pay.tenant_id
      AND u.role IN ('owner', 'admin')
      AND u.anonymized_at IS NULL;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'dispute_id', v_row.id,
    'is_new', v_new,
    'event_id', v_event_id
  );
END;
$function$;

DO $$
DECLARE
  v_con text;
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_con
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'payment_disputes'
    AND c.conname = 'payment_disputes_provider_ref_format';
  IF v_con IS NULL OR v_con !~ 'du_' THEN
    RAISE EXCEPTION '3.2b hotfix: payment_disputes_provider_ref_format erlaubt du_ nicht: %', v_con;
  END IF;

  v_def := pg_get_functiondef('yogaflow_private.record_payment_dispute(uuid,text,integer,text)'::regprocedure);
  IF position('du_' in v_def) = 0 THEN
    RAISE EXCEPTION '3.2b hotfix: record_payment_dispute erwähnt du_ nicht';
  END IF;
END $$;
