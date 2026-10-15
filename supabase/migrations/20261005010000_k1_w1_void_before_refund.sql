-- K1 Nachtrag W1 — Resttermine sofort beim Widerruf entwerten (vor request_refund).
-- allow: confirm_pass_withdrawal_core
-- Befund: Bei Erstattung > 0 blieb die Karte bis zum Job aktiv und war weiter buchbar.

CREATE OR REPLACE FUNCTION yogaflow_private.confirm_pass_withdrawal_core(
  p_pass_id uuid,
  p_actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_prev jsonb;
  v_refund integer;
  v_payment_id uuid;
  v_res jsonb;
  v_event_id uuid;
  v_pass public.passes%ROWTYPE;
BEGIN
  v_prev := yogaflow_private.pass_withdrawal_preview(p_pass_id);
  IF COALESCE((v_prev ->> 'success')::boolean, false) IS NOT TRUE THEN
    RETURN v_prev;
  END IF;

  IF COALESCE((v_prev ->> 'within_window')::boolean, false) IS NOT TRUE THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error', 'WINDOW_EXPIRED',
      'withdrawal_deadline_at', v_prev -> 'withdrawal_deadline_at'
    );
  END IF;

  SELECT * INTO v_pass FROM public.passes WHERE id = p_pass_id FOR UPDATE;
  IF v_pass.status IS DISTINCT FROM 'active'
     AND EXISTS (
       SELECT 1 FROM public.pass_movements m
       WHERE m.pass_id = p_pass_id AND m.kind = 'void' AND m.reason = 'withdrawal'
     )
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ALREADY_WITHDRAWN');
  END IF;

  v_refund := COALESCE((v_prev ->> 'refund_cents')::integer, 0);
  v_payment_id := (v_prev ->> 'payment_id')::uuid;

  v_event_id := yogaflow_private.insert_event(
    v_pass.tenant_id,
    'pass.withdrawal_received',
    'pass',
    v_pass.id,
    pg_catalog.jsonb_build_object(
      'pass_id', v_pass.id,
      'payment_id', v_payment_id,
      'wertersatz_cents', (v_prev ->> 'wertersatz_cents')::integer,
      'refund_cents', v_refund,
      'units_used', (v_prev ->> 'units_used')::integer
    ),
    pg_catalog.gen_random_uuid()
  );

  INSERT INTO public.email_deliveries (
    tenant_id, event_id, kind, registration_id, pass_id, status, next_attempt_at
  ) VALUES (
    v_pass.tenant_id, v_event_id, 'pass_withdrawal_received', NULL, v_pass.id,
    'pending', pg_catalog.now()
  );

  -- W1: Rest sofort entwerten — Karte nicht mehr buchbar, auch wenn Erstattung noch läuft.
  PERFORM yogaflow_private.void_pass_remaining(v_pass.id, 'withdrawal', p_actor);

  IF v_refund > 0 THEN
    v_res := yogaflow_private.request_refund(
      v_payment_id, v_refund, 'withdrawal', p_actor, NULL
    );
    IF COALESCE((v_res ->> 'success')::boolean, false) IS NOT TRUE THEN
      RETURN v_res;
    END IF;
  ELSE
    v_res := pg_catalog.jsonb_build_object(
      'success', true,
      'code', 'VOIDED_NO_REFUND',
      'amount_cents', 0
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'code', 'WITHDRAWN',
    'pass_id', v_pass.id,
    'refund_cents', v_refund,
    'wertersatz_cents', (v_prev ->> 'wertersatz_cents')::integer,
    'units_used', (v_prev ->> 'units_used')::integer,
    'refund_id', v_res -> 'refund_id',
    'received_at', pg_catalog.now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.confirm_pass_withdrawal_core(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_def text;
BEGIN
  v_def := pg_catalog.pg_get_functiondef(
    'yogaflow_private.confirm_pass_withdrawal_core(uuid,uuid)'::regprocedure
  );
  IF position('void_pass_remaining' IN v_def) = 0 THEN
    RAISE EXCEPTION 'K1 W1: void_pass_remaining fehlt in confirm_pass_withdrawal_core';
  END IF;
  -- void muss vor request_refund stehen
  IF position('void_pass_remaining' IN v_def)
     > position('request_refund' IN v_def)
  THEN
    RAISE EXCEPTION 'K1 W1: void_pass_remaining nicht vor request_refund';
  END IF;
END;
$$;
