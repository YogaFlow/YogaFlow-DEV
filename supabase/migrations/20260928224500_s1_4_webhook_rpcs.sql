-- S1 1.4 — RPCs für den Webhook-Empfang (provider_events_raw).
--
-- Zweck: Die Edge Function payments-webhook speichert jedes geprüfte Anbieter-Event
-- roh, löst das Studio auf und markiert das Ergebnis. Keine neue Tabelle, keine
-- Änderung an 1.2a-Tabellen, Policies oder Rechten.
--
-- Bezug: Nachtrag 5c, Entscheidungen W1–W7 (28.09.2026):
-- W2 Erst prüfen, dann speichern, dann verarbeiten.
-- W4 Studio nur über provider_accounts.provider_ref = account im Event (I7).
--    Nicht auflösbar → tenant_id NULL, keine Wirkung.
-- W6 Dedup über (provider, event_id). Bestehende Zeile wird nie überschrieben;
--    verarbeitet → already_processed, sonst erneut verarbeiten (attempts + 1).
--
-- Beide Funktionen in yogaflow_private, je ein public-Alias nur für service_role.
-- Client-JWT → FORBIDDEN (zweite Sperre neben dem fehlenden GRANT, wie 1.2a).
--
-- Rückweg (Kommentar, läuft hier nicht):
--
-- DROP FUNCTION IF EXISTS public.mark_provider_event_failed(uuid);
-- DROP FUNCTION IF EXISTS public.mark_provider_event_processed(uuid, text);
-- DROP FUNCTION IF EXISTS public.record_provider_event(public.payment_provider, text, text, text, boolean, jsonb);
-- DROP FUNCTION IF EXISTS yogaflow_private.mark_provider_event_failed(uuid);
-- DROP FUNCTION IF EXISTS yogaflow_private.mark_provider_event_processed(uuid, text);
-- DROP FUNCTION IF EXISTS yogaflow_private.record_provider_event(public.payment_provider, text, text, text, boolean, jsonb);
--
-- Bereits gespeicherte Rohzeilen bleiben beim Rückweg erhalten.

-- ---------------------------------------------------------------------------
-- 1. record_provider_event
-- ---------------------------------------------------------------------------

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
      'already_processed', false
    );
  END IF;

  -- Gleichzeitige Zustellung: ON CONFLICT wartet auf die andere Transaktion,
  -- dieses SELECT sieht deren Zeile.
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

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'id', v_row.id,
    'tenant_id', v_row.tenant_id,
    'duplicate', true,
    'already_processed', v_row.processed_at IS NOT NULL
  );
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.record_provider_event(public.payment_provider, text, text, text, boolean, jsonb) IS
  'Speichert ein geprüftes Anbieter-Event roh (Dedup über provider, event_id). Studio nur über provider_accounts.provider_ref (I7), sonst NULL. Bestehende Zeile wird nie überschrieben. Fehler: INVALID_PROVIDER, INVALID_INPUT, LIVEMODE_MISMATCH. 1.4.';

REVOKE ALL ON FUNCTION yogaflow_private.record_provider_event(public.payment_provider, text, text, text, boolean, jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_provider_event(
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
BEGIN
  -- Zweite Sperre neben dem fehlenden GRANT: Client-JWT wird immer abgewiesen.
  IF COALESCE(
       NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) IN ('anon', 'authenticated')
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  RETURN yogaflow_private.record_provider_event(
    p_provider,
    p_event_id,
    p_event_type,
    p_account_ref,
    p_livemode,
    p_payload
  );
END;
$function$;

COMMENT ON FUNCTION public.record_provider_event(public.payment_provider, text, text, text, boolean, jsonb) IS
  'Alias für yogaflow_private.record_provider_event. Nur service_role (payments-webhook).';

REVOKE ALL ON FUNCTION public.record_provider_event(public.payment_provider, text, text, text, boolean, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_provider_event(public.payment_provider, text, text, text, boolean, jsonb)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 2. mark_provider_event_processed
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.mark_provider_event_processed(
  p_id uuid,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023';
  END IF;

  -- Gleiches Format wie provider_events_raw_processing_error_check.
  IF p_error IS NOT NULL AND p_error !~ '^[A-Z_]{3,64}$' THEN
    RAISE EXCEPTION 'INVALID_ERROR_CODE' USING ERRCODE = '22023';
  END IF;

  UPDATE public.provider_events_raw
  SET processed_at = pg_catalog.now(),
      processing_error = p_error,
      attempts = attempts + 1
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.mark_provider_event_processed(uuid, text) IS
  'Rohzeile abschließend behandelt: processed_at = now(), processing_error = Code oder NULL, attempts + 1. Fehler (Exception): INVALID_INPUT, INVALID_ERROR_CODE, EVENT_NOT_FOUND. 1.4.';

REVOKE ALL ON FUNCTION yogaflow_private.mark_provider_event_processed(uuid, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_provider_event_processed(
  p_id uuid,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF COALESCE(
       NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) IN ('anon', 'authenticated')
  THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  PERFORM yogaflow_private.mark_provider_event_processed(p_id, p_error);
END;
$function$;

COMMENT ON FUNCTION public.mark_provider_event_processed(uuid, text) IS
  'Alias für yogaflow_private.mark_provider_event_processed. Nur service_role (payments-webhook).';

REVOKE ALL ON FUNCTION public.mark_provider_event_processed(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_provider_event_processed(uuid, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 3. mark_provider_event_failed
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.mark_provider_event_failed(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023';
  END IF;

  UPDATE public.provider_events_raw
  SET attempts = attempts + 1
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.mark_provider_event_failed(uuid) IS
  'Vorübergehender Fehler (Antwort 500): nur attempts + 1, processed_at bleibt NULL. Fehler (Exception): INVALID_INPUT, EVENT_NOT_FOUND. 1.4.';

REVOKE ALL ON FUNCTION yogaflow_private.mark_provider_event_failed(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_provider_event_failed(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF COALESCE(
       NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) IN ('anon', 'authenticated')
  THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  PERFORM yogaflow_private.mark_provider_event_failed(p_id);
END;
$function$;

COMMENT ON FUNCTION public.mark_provider_event_failed(uuid) IS
  'Alias für yogaflow_private.mark_provider_event_failed. Nur service_role (payments-webhook).';

REVOKE ALL ON FUNCTION public.mark_provider_event_failed(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_provider_event_failed(uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Selbstprüfung
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_fn text;
  v_oid oid;
  v_res jsonb;
  v_raised boolean;
  v_count_before bigint;
BEGIN
  -- Existenz, SECURITY DEFINER, search_path leer, kein Client-EXECUTE
  FOREACH v_fn IN ARRAY ARRAY[
    'yogaflow_private.record_provider_event(public.payment_provider,text,text,text,boolean,jsonb)',
    'yogaflow_private.mark_provider_event_processed(uuid,text)',
    'yogaflow_private.mark_provider_event_failed(uuid)',
    'public.record_provider_event(public.payment_provider,text,text,text,boolean,jsonb)',
    'public.mark_provider_event_processed(uuid,text)',
    'public.mark_provider_event_failed(uuid)'
  ]
  LOOP
    v_oid := to_regprocedure(v_fn);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION '1.4: Funktion % fehlt', v_fn;
    END IF;

    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) THEN
      RAISE EXCEPTION '1.4: % ist nicht SECURITY DEFINER', v_fn;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_options_to_table((SELECT proconfig FROM pg_proc WHERE oid = v_oid))
      WHERE option_name = 'search_path' AND option_value = '""'
    ) THEN
      RAISE EXCEPTION '1.4: search_path von % ist nicht leer', v_fn;
    END IF;

    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION '1.4: anon hat EXECUTE auf %', v_fn;
    END IF;

    IF has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION '1.4: authenticated hat EXECUTE auf %', v_fn;
    END IF;
  END LOOP;

  -- service_role nur auf den Aliasen
  FOREACH v_fn IN ARRAY ARRAY[
    'public.record_provider_event(public.payment_provider,text,text,text,boolean,jsonb)',
    'public.mark_provider_event_processed(uuid,text)',
    'public.mark_provider_event_failed(uuid)'
  ]
  LOOP
    IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '1.4: service_role braucht EXECUTE auf %', v_fn;
    END IF;
  END LOOP;

  -- Client-JWT → FORBIDDEN, ohne dass eine Zeile entsteht
  SELECT count(*) INTO v_count_before FROM public.provider_events_raw;

  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);

  v_res := public.record_provider_event(
    'stripe'::public.payment_provider, 'evt_selfcheck_1_4', 'account.updated', NULL, false, '{}'::jsonb
  );
  IF v_res ->> 'error' IS DISTINCT FROM 'FORBIDDEN' THEN
    RAISE EXCEPTION '1.4: record_provider_event mit Client-JWT nicht FORBIDDEN: %', v_res;
  END IF;

  v_raised := false;
  BEGIN
    PERFORM public.mark_provider_event_processed(gen_random_uuid(), NULL);
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION '1.4: mark_provider_event_processed mit Client-JWT nicht FORBIDDEN';
  END IF;

  v_raised := false;
  BEGIN
    PERFORM public.mark_provider_event_failed(gen_random_uuid());
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION '1.4: mark_provider_event_failed mit Client-JWT nicht FORBIDDEN';
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);

  IF (SELECT count(*) FROM public.provider_events_raw) <> v_count_before THEN
    RAISE EXCEPTION '1.4: Selbstprüfung hat eine Rohzeile geschrieben';
  END IF;
END
$$;
