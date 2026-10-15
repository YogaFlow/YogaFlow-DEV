-- K1 Nachtrag W3 — „Genutzt“ inkl. kommende Buchungen transparent ausweisen.
-- allow: pass_withdrawal_preview,lookup_pass_withdrawal_public
-- Regel K12: gebuchte Termine bleiben und zählen als genutzt.

CREATE OR REPLACE FUNCTION yogaflow_private.pass_withdrawal_preview(p_pass_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_pass public.passes%ROWTYPE;
  v_pay public.payments%ROWTYPE;
  v_used integer;
  v_remaining integer;
  v_wertersatz integer;
  v_refund integer;
  v_deadline timestamptz;
  v_purchased_at timestamptz;
  v_upcoming_count integer := 0;
  v_upcoming_dates date[] := ARRAY[]::date[];
BEGIN
  SELECT * INTO v_pass FROM public.passes WHERE id = p_pass_id;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  SELECT * INTO v_pay FROM public.payments WHERE id = v_pass.payment_id;
  IF NOT FOUND
     OR v_pay.subject_type IS DISTINCT FROM 'pass_purchase'
     OR v_pay.provider IS DISTINCT FROM 'stripe'::public.payment_provider
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_ONLINE_PURCHASE');
  END IF;

  v_purchased_at := COALESCE(v_pay.received_at, v_pass.created_at);
  v_deadline := v_purchased_at + interval '14 days';

  SELECT COALESCE(-SUM(m.delta), 0)::integer
    INTO v_used
  FROM public.pass_movements m
  WHERE m.pass_id = v_pass.id
    AND m.kind IN ('redeem', 'redeem_reversal');

  v_remaining := yogaflow_private.pass_remaining(v_pass.id);
  v_wertersatz := yogaflow_private.pass_wertersatz_cents(
    v_pass.price_cents, v_pass.units_total, v_used
  );
  v_refund := GREATEST(v_pass.price_cents - v_wertersatz, 0);

  -- W3: kommende gebuchte Termine mit dieser Karte (bleiben gebucht = genutzt)
  SELECT
    COALESCE(pg_catalog.count(*)::integer, 0),
    COALESCE(
      pg_catalog.array_agg(c.date ORDER BY c.date ASC, c.time ASC, r.id ASC),
      ARRAY[]::date[]
    )
    INTO v_upcoming_count, v_upcoming_dates
  FROM public.registrations r
  JOIN public.courses c ON c.id = r.course_id
  WHERE r.pass_id = v_pass.id
    AND r.tenant_id = v_pass.tenant_id
    AND r.cancellation_timestamp IS NULL
    AND r.status = 'registered'::public.registration_status
    AND (c.date + COALESCE(c.time, TIME '00:00:00'))
          AT TIME ZONE 'Europe/Berlin' > pg_catalog.now();

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'pass_id', v_pass.id,
    'payment_id', v_pay.id,
    'name', v_pass.name,
    'units_total', v_pass.units_total,
    'units_used', v_used,
    'units_used_upcoming', v_upcoming_count,
    'upcoming_dates', to_jsonb(v_upcoming_dates),
    'units_remaining', v_remaining,
    'price_cents', v_pass.price_cents,
    'wertersatz_cents', v_wertersatz,
    'refund_cents', v_refund,
    'purchased_at', v_purchased_at,
    'withdrawal_deadline_at', v_deadline,
    'within_window', pg_catalog.now() <= v_deadline,
    'pass_status', v_pass.status,
    'already_voided', v_pass.status IS DISTINCT FROM 'active' OR v_remaining = 0
      AND EXISTS (
        SELECT 1 FROM public.pass_movements m
        WHERE m.pass_id = v_pass.id AND m.kind = 'void'
      )
  );
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.pass_withdrawal_preview(uuid)
  FROM PUBLIC, anon, authenticated;

-- lookup: neue Preview-Felder durchreichen (übrige Logik unverändert)
CREATE OR REPLACE FUNCTION public.lookup_pass_withdrawal_public(
  p_receipt_number text,
  p_email text,
  p_client_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tenant uuid := yogaflow_private.tenant_id_from_request();
  v_receipt text := upper(btrim(COALESCE(p_receipt_number, '')));
  v_email text := lower(btrim(COALESCE(p_email, '')));
  v_ip_hash text;
  v_pay public.payments%ROWTYPE;
  v_pass public.passes%ROWTYPE;
  v_member public.users%ROWTYPE;
  v_prev jsonb;
  v_matched boolean := false;
  v_neutral jsonb := pg_catalog.jsonb_build_object(
    'success', true,
    'code', 'LOOKUP_RESULT',
    'message', 'Wenn die Angaben zu einem Kauf passen, siehst du jetzt die Zusammenfassung.'
  );
BEGIN
  IF v_tenant IS NULL THEN
    RETURN v_neutral;
  END IF;

  IF v_receipt = '' OR v_email = '' OR position('@' in v_email) = 0 THEN
    RETURN v_neutral;
  END IF;

  IF p_client_ip IS NOT NULL AND btrim(p_client_ip) <> '' THEN
    v_ip_hash := encode(extensions.digest(btrim(p_client_ip), 'sha256'), 'hex');
  END IF;

  IF yogaflow_private.pass_withdrawal_rate_limited(v_tenant, v_receipt, v_ip_hash) THEN
    RETURN v_neutral || pg_catalog.jsonb_build_object('rate_limited', true);
  END IF;

  SELECT p.*
    INTO v_pay
  FROM public.receipts r
  JOIN public.payments p ON p.id = r.payment_id
  WHERE r.tenant_id = v_tenant
    AND r.number = v_receipt
    AND r.kind = 'receipt'
    AND p.subject_type = 'pass_purchase'
  LIMIT 1;

  IF FOUND THEN
    SELECT * INTO v_pass FROM public.passes WHERE id = v_pay.subject_id;
    SELECT * INTO v_member FROM public.users WHERE id = v_pass.member_id;
    IF FOUND AND lower(btrim(COALESCE(v_member.email, ''))) = v_email THEN
      v_matched := true;
      v_prev := yogaflow_private.pass_withdrawal_preview(v_pass.id);
    END IF;
  END IF;

  INSERT INTO public.pass_withdrawal_lookups (
    tenant_id, receipt_number, email_norm, ip_hash, matched
  ) VALUES (
    v_tenant, v_receipt, v_email, v_ip_hash, v_matched
  );

  IF NOT v_matched THEN
    RETURN v_neutral;
  END IF;

  IF COALESCE((v_prev ->> 'within_window')::boolean, false) IS NOT TRUE THEN
    RETURN v_neutral || pg_catalog.jsonb_build_object(
      'found', true,
      'within_window', false,
      'withdrawal_deadline_at', v_prev -> 'withdrawal_deadline_at',
      'message', 'Die Widerrufsfrist für diesen Kauf ist abgelaufen.'
    );
  END IF;

  RETURN v_neutral || pg_catalog.jsonb_build_object(
    'found', true,
    'within_window', true,
    'pass_id', v_prev -> 'pass_id',
    'name', v_prev -> 'name',
    'units_total', v_prev -> 'units_total',
    'units_used', v_prev -> 'units_used',
    'units_used_upcoming', v_prev -> 'units_used_upcoming',
    'upcoming_dates', v_prev -> 'upcoming_dates',
    'price_cents', v_prev -> 'price_cents',
    'wertersatz_cents', v_prev -> 'wertersatz_cents',
    'refund_cents', v_prev -> 'refund_cents',
    'withdrawal_deadline_at', v_prev -> 'withdrawal_deadline_at'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.lookup_pass_withdrawal_public(text, text, text)
  FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_pass_withdrawal_public(text, text, text)
  TO anon, authenticated;

DO $$
DECLARE
  v_def text;
BEGIN
  v_def := pg_catalog.pg_get_functiondef(
    'yogaflow_private.pass_withdrawal_preview(uuid)'::regprocedure
  );
  IF position('units_used_upcoming' IN v_def) = 0 THEN
    RAISE EXCEPTION 'K1 W3: units_used_upcoming fehlt in preview';
  END IF;
  IF position('upcoming_dates' IN v_def) = 0 THEN
    RAISE EXCEPTION 'K1 W3: upcoming_dates fehlt in preview';
  END IF;
END;
$$;
