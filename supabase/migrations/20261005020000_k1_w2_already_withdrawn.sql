-- K1 Nachtrag W2 — Doppelter Widerruf ohne Nebenwirkungen.
-- allow: confirm_pass_withdrawal_core
-- Befund: Event/Mail vor request_refund; bei Fehler RETURN → zweite Mail möglich.
-- Fix: früh ALREADY_WITHDRAWN (FOR UPDATE); Void→Event→Mail→Erstattung; Fehler → RAISE.

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
  SELECT * INTO v_pass FROM public.passes WHERE id = p_pass_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  -- W2: bereits widerrufen → sofort zurück, ohne Event/Mail/Erstattung
  IF EXISTS (
       SELECT 1
       FROM public.events e
       WHERE e.type = 'pass.withdrawal_received'
         AND e.subject_type = 'pass'
         AND e.subject_id = p_pass_id
     )
     OR EXISTS (
       SELECT 1
       FROM public.payment_refunds r
       JOIN public.payments p ON p.id = r.payment_id
       WHERE p.subject_type = 'pass_purchase'
         AND p.subject_id = p_pass_id
         AND r.reason = 'withdrawal'
         AND r.status IS DISTINCT FROM 'failed'
     )
     OR EXISTS (
       SELECT 1
       FROM public.pass_movements m
       WHERE m.pass_id = p_pass_id
         AND m.kind = 'void'
         AND m.reason = 'withdrawal'
     )
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ALREADY_WITHDRAWN');
  END IF;

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

  v_refund := COALESCE((v_prev ->> 'refund_cents')::integer, 0);
  v_payment_id := (v_prev ->> 'payment_id')::uuid;

  -- W1: Rest sofort entwerten
  PERFORM yogaflow_private.void_pass_remaining(v_pass.id, 'withdrawal', p_actor);

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

  IF v_refund > 0 THEN
    v_res := yogaflow_private.request_refund(
      v_payment_id, v_refund, 'withdrawal', p_actor, NULL
    );
    IF COALESCE((v_res ->> 'success')::boolean, false) IS NOT TRUE THEN
      -- W2: alles zurückrollen (Event/Mail/Void), nicht halb committen
      RAISE EXCEPTION 'WITHDRAWAL_REFUND_FAILED:%',
        COALESCE(v_res ->> 'error', 'UNKNOWN')
        USING ERRCODE = 'P0001';
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
  IF position('ALREADY_WITHDRAWN' IN v_def) = 0 THEN
    RAISE EXCEPTION 'K1 W2: ALREADY_WITHDRAWN fehlt';
  END IF;
  IF position('WITHDRAWAL_REFUND_FAILED' IN v_def) = 0 THEN
    RAISE EXCEPTION 'K1 W2: RAISE bei Refund-Fehler fehlt';
  END IF;
  IF position('pass.withdrawal_received' IN v_def) = 0 THEN
    RAISE EXCEPTION 'K1 W2: Event-Prüfung fehlt';
  END IF;
  -- ALREADY-Prüfung vor Void (FOR UPDATE + EXISTS vor PERFORM void)
  IF position('FOR UPDATE' IN v_def) = 0
     OR position('FOR UPDATE' IN v_def) > position('void_pass_remaining' IN v_def)
  THEN
    RAISE EXCEPTION 'K1 W2: FOR UPDATE nicht vor void';
  END IF;
END;
$$;
