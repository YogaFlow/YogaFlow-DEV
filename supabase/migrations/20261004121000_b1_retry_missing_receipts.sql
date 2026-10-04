-- B1 Nachtrag N2 — idempotentes Nachholen fehlender Belege (nur service_role).
-- allow: retry_missing_receipts
-- Wird vom ops-monitor (B2) bei jedem Lauf aufgerufen.
--
-- Rückweg:
--   DROP FUNCTION IF EXISTS public.retry_missing_receipts(uuid);

CREATE OR REPLACE FUNCTION public.retry_missing_receipts(p_tenant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_pay_id uuid;
  v_ref_id uuid;
  v_payments integer := 0;
  v_refunds integer := 0;
  v_pay_ok integer := 0;
  v_ref_ok integer := 0;
  v_rid uuid;
BEGIN
  FOR v_pay_id IN
    SELECT p.id
    FROM public.payments p
    WHERE p.provider = 'stripe'::public.payment_provider
      AND p.status = 'succeeded'::public.payment_status
      AND p.subject_type = 'registration'
      AND (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.receipts r
        WHERE r.payment_id = p.id
          AND r.kind = 'receipt'
      )
    ORDER BY p.received_at NULLS LAST, p.created_at
    LIMIT 200
  LOOP
    v_payments := v_payments + 1;
    BEGIN
      v_rid := yogaflow_private.issue_receipt_for_payment(v_pay_id);
      IF v_rid IS NOT NULL THEN
        v_pay_ok := v_pay_ok + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Fehler bereits über Trigger-Pfad oder hier still; ops-monitor zählt Lücken.
      NULL;
    END;
  END LOOP;

  FOR v_ref_id IN
    SELECT rf.id
    FROM public.payment_refunds rf
    WHERE rf.status = 'succeeded'
      AND (p_tenant_id IS NULL OR rf.tenant_id = p_tenant_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.receipts r
        WHERE r.refund_id = rf.id
          AND r.kind = 'refund_receipt'
      )
    ORDER BY rf.updated_at NULLS LAST, rf.created_at
    LIMIT 200
  LOOP
    v_refunds := v_refunds + 1;
    BEGIN
      v_rid := yogaflow_private.issue_refund_receipt(v_ref_id);
      IF v_rid IS NOT NULL THEN
        v_ref_ok := v_ref_ok + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'payments_missing', v_payments,
    'payments_issued', v_pay_ok,
    'refunds_missing', v_refunds,
    'refunds_issued', v_ref_ok
  );
END;
$function$;

COMMENT ON FUNCTION public.retry_missing_receipts(uuid) IS
  'B1 N2: Fehlende Stripe-Belege/Erstattungsbelege nachtragen. Nur service_role; idempotent.';

REVOKE ALL ON FUNCTION public.retry_missing_receipts(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_missing_receipts(uuid)
  TO service_role;

DO $$
BEGIN
  IF NOT has_function_privilege('service_role', 'public.retry_missing_receipts(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'B1 N2: service_role ohne retry_missing_receipts';
  END IF;
  IF has_function_privilege('anon', 'public.retry_missing_receipts(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.retry_missing_receipts(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'B1 N2: retry_missing_receipts zu weit freigegeben';
  END IF;
END;
$$;
