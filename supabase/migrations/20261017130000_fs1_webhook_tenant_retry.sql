-- FS-1 E — Webhook-Race: tenant bei Wiederholung nachlösen, attempts zurückgeben.
-- allow: record_provider_event
-- Rechte unverändert (service_role EXECUTE, kein Client).

CREATE OR REPLACE FUNCTION yogaflow_private.record_provider_event(
  p_provider public.payment_provider,
  p_event_id text,
  p_event_type text,
  p_account_ref text,
  p_livemode boolean,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_ref text;
  v_tenant uuid;
  v_id uuid;
  v_row public.provider_events_raw%ROWTYPE;
BEGIN
  IF p_provider IS NULL OR p_provider = 'manual'::public.payment_provider THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_PROVIDER');
  END IF;

  IF p_event_id IS NULL
     OR pg_catalog.length(p_event_id) NOT BETWEEN 1 AND 255
     OR p_event_type IS NULL
     OR pg_catalog.length(p_event_type) NOT BETWEEN 1 AND 255
     OR p_livemode IS NULL
     OR p_payload IS NULL
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
  END IF;

  v_ref := NULLIF(pg_catalog.btrim(COALESCE(p_account_ref, '')), '');

  IF v_ref IS NOT NULL THEN
    SELECT a.tenant_id
      INTO v_tenant
    FROM public.provider_accounts a
    WHERE a.provider = p_provider
      AND a.provider_ref = v_ref;
  END IF;

  INSERT INTO public.provider_events_raw (
    provider,
    event_id,
    event_type,
    account_ref,
    tenant_id,
    livemode,
    payload
  ) VALUES (
    p_provider,
    p_event_id,
    p_event_type,
    v_ref,
    v_tenant,
    p_livemode,
    p_payload
  )
  ON CONFLICT (provider, event_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'id', v_id,
      'tenant_id', v_tenant,
      'duplicate', false,
      'already_processed', false,
      'attempts', 0
    );
  END IF;

  SELECT *
    INTO v_row
  FROM public.provider_events_raw r
  WHERE r.provider = p_provider
    AND r.event_id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_provider_event: Zeile nach Konflikt nicht gefunden'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_row.livemode IS DISTINCT FROM p_livemode THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'LIVEMODE_MISMATCH');
  END IF;

  -- FS-1: Konto kann nach dem ersten Event angelegt worden sein → Tenant nachlösen.
  IF v_row.tenant_id IS NULL AND v_ref IS NOT NULL THEN
    SELECT a.tenant_id
      INTO v_tenant
    FROM public.provider_accounts a
    WHERE a.provider = p_provider
      AND a.provider_ref = v_ref;
    IF v_tenant IS NOT NULL THEN
      UPDATE public.provider_events_raw
      SET tenant_id = v_tenant
      WHERE id = v_row.id
        AND tenant_id IS NULL;
      v_row.tenant_id := v_tenant;
    END IF;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'id', v_row.id,
    'tenant_id', v_row.tenant_id,
    'duplicate', true,
    'already_processed', v_row.processed_at IS NOT NULL,
    'attempts', v_row.attempts
  );
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.record_provider_event(public.payment_provider, text, text, text, boolean, jsonb) IS
  'Speichert Anbieter-Event roh. FS-1: bei Wiederholung Tenant nachlösen wenn NULL; liefert attempts. 1.4/FS-1.';

REVOKE ALL ON FUNCTION yogaflow_private.record_provider_event(public.payment_provider, text, text, text, boolean, jsonb)
  FROM PUBLIC, anon, authenticated;

-- public-Alias unverändert (nur Weiterleitung); Rechte erneut setzen.
REVOKE ALL ON FUNCTION public.record_provider_event(public.payment_provider, text, text, text, boolean, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_provider_event(public.payment_provider, text, text, text, boolean, jsonb)
  TO service_role;

DO $$
DECLARE
  v_def text;
BEGIN
  v_def := pg_catalog.pg_get_functiondef(
    'yogaflow_private.record_provider_event(public.payment_provider,text,text,text,boolean,jsonb)'::regprocedure
  );
  IF position('attempts' IN v_def) = 0 THEN
    RAISE EXCEPTION 'FS-1: record_provider_event ohne attempts';
  END IF;
  IF position('tenant_id IS NULL' IN v_def) = 0 THEN
    RAISE EXCEPTION 'FS-1: record_provider_event ohne Tenant-Nachlösen';
  END IF;
  IF has_function_privilege('anon', 'public.record_provider_event(public.payment_provider,text,text,text,boolean,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.record_provider_event(public.payment_provider,text,text,text,boolean,jsonb)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'FS-1: record_provider_event EXECUTE für anon/authenticated';
  END IF;
END;
$$;
