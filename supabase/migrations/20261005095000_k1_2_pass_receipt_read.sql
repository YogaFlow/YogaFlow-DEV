-- K1-2 — Kartenkäuferin liest den eigenen Beleg (Liste und Seite).
-- allow: get_receipt

DROP POLICY IF EXISTS receipts_select_own ON public.receipts;
CREATE POLICY receipts_select_own ON public.receipts
  FOR SELECT TO authenticated
  USING (
    tenant_id = yogaflow_private.get_my_tenant_id()
    AND (
      yogaflow_private.is_tenant_manager()
      OR EXISTS (
        SELECT 1
        FROM public.payments p
        JOIN public.registrations r ON r.id = p.registration_id
        WHERE p.id = receipts.payment_id
          AND r.user_id = yogaflow_private.get_my_member_id()
      )
      OR EXISTS (
        SELECT 1
        FROM public.passes ps
        WHERE ps.payment_id = receipts.payment_id
          AND ps.member_id = yogaflow_private.get_my_member_id()
          AND ps.tenant_id = receipts.tenant_id
      )
    )
  );

CREATE OR REPLACE FUNCTION public.get_receipt(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member uuid := yogaflow_private.get_my_member_id();
  v_tenant uuid := yogaflow_private.get_my_tenant_id();
  v_row public.receipts%ROWTYPE;
  v_ok boolean := false;
BEGIN
  IF v_member IS NULL OR v_tenant IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_row FROM public.receipts WHERE id = p_id;
  IF NOT FOUND OR v_row.tenant_id IS DISTINCT FROM v_tenant THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF yogaflow_private.is_tenant_manager() THEN
    v_ok := true;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.payments p
      JOIN public.registrations r ON r.id = p.registration_id
      WHERE p.id = v_row.payment_id
        AND r.user_id = v_member
    ) OR EXISTS (
      SELECT 1
      FROM public.passes ps
      WHERE ps.payment_id = v_row.payment_id
        AND ps.member_id = v_member
        AND ps.tenant_id = v_tenant
    ) INTO v_ok;
  END IF;

  IF NOT v_ok THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'id', v_row.id,
    'number', v_row.number,
    'kind', v_row.kind,
    'payment_id', v_row.payment_id,
    'refund_id', v_row.refund_id,
    'original_receipt_id', v_row.original_receipt_id,
    'issued_at', v_row.issued_at,
    'amount_cents', v_row.amount_cents,
    'snapshot', v_row.snapshot
  );
END;
$function$;

COMMENT ON FUNCTION public.get_receipt(uuid) IS
  'B1 K12 / K1-2: Beleg lesen. Teilnehmende eigene Buchung oder eigene Karte, Owner/Admin Studio, Lehrende fremde nicht.';

REVOKE ALL ON FUNCTION public.get_receipt(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_receipt(uuid) TO authenticated;

DO $$
DECLARE
  v_def text;
  v_pol text;
BEGIN
  v_def := pg_catalog.pg_get_functiondef('public.get_receipt(uuid)'::regprocedure);
  IF pg_catalog.strpos(v_def, 'passes') = 0 THEN
    RAISE EXCEPTION 'K1-2: get_receipt ohne Karten-Besitz';
  END IF;
  SELECT pg_catalog.pg_get_expr(polqual, polrelid) INTO v_pol
  FROM pg_catalog.pg_policy
  WHERE polname = 'receipts_select_own'
    AND polrelid = 'public.receipts'::regclass;
  IF v_pol IS NULL OR pg_catalog.strpos(v_pol, 'passes') = 0 THEN
    RAISE EXCEPTION 'K1-2: receipts_select_own ohne Karten-Besitz';
  END IF;
  IF pg_catalog.has_function_privilege('anon', 'public.get_receipt(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'K1-2: anon darf get_receipt';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated', 'public.get_receipt(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'K1-2: authenticated ohne get_receipt';
  END IF;
END $$;
