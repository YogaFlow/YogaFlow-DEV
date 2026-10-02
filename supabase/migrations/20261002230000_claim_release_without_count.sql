-- Claims zurückgeben, ohne zu zählen (OFFENE_PUNKTE „Claim-Tests“).
-- allow: finish_provider_job,mark_email_delivery
--
-- Parallele Testläufe holen per claim_* auch Zeilen fremder Studios und müssen sie sofort
-- zurückgeben. Bisher ging das nur über retry/failed und erhöhte tries/attempts fremder Zeilen.
--   finish_provider_job(..., 'release')   : running → pending, tries − 1 (claim hatte +1),
--                                            next_run_at und last_error_code unverändert.
--   mark_email_delivery(..., 'released')  : sending → pending, attempts unverändert,
--                                            next_attempt_at und last_error_code unverändert.
-- Übrige Zweige unverändert (Körper aus der jeweils letzten Fassung auf DEV).
-- Public-Wrapper reichen p_outcome / p_status durch und bleiben unverändert.
-- Rückweg: Körper ohne die beiden neuen Zweige erneut ausführen.

CREATE OR REPLACE FUNCTION yogaflow_private.finish_provider_job(p_job_id uuid, p_outcome text, p_error_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_job public.provider_jobs%ROWTYPE;
  v_delay interval;
BEGIN
  IF p_job_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  SELECT * INTO v_job
  FROM public.provider_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF p_outcome = 'release' THEN
    IF v_job.status IS DISTINCT FROM 'running' THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_RUNNING');
    END IF;
    UPDATE public.provider_jobs
    SET
      status = 'pending',
      tries = GREATEST(tries - 1, 0),
      updated_at = pg_catalog.now()
    WHERE id = p_job_id;
    RETURN pg_catalog.jsonb_build_object('success', true, 'status', 'pending', 'released', true);
  END IF;

  IF p_outcome = 'done' THEN
    UPDATE public.provider_jobs
    SET
      status = 'done',
      done_at = pg_catalog.now(),
      last_error_code = NULL,
      updated_at = pg_catalog.now()
    WHERE id = p_job_id;
    RETURN pg_catalog.jsonb_build_object('success', true, 'status', 'done');
  END IF;

  IF p_outcome = 'failed'
     OR (p_outcome = 'retry' AND v_job.tries >= 10)
  THEN
    UPDATE public.provider_jobs
    SET
      status = 'failed',
      done_at = pg_catalog.now(),
      last_error_code = COALESCE(NULLIF(btrim(p_error_code), ''), 'FAILED'),
      updated_at = pg_catalog.now()
    WHERE id = p_job_id;
    RAISE LOG 'provider_job.failed job_id=% kind=% code=%',
      p_job_id, v_job.kind, COALESCE(NULLIF(btrim(p_error_code), ''), 'FAILED');
    RETURN pg_catalog.jsonb_build_object('success', true, 'status', 'failed');
  END IF;

  IF p_outcome = 'retry' THEN
    v_delay := CASE v_job.tries
      WHEN 1 THEN interval '1 minute'
      WHEN 2 THEN interval '5 minutes'
      WHEN 3 THEN interval '15 minutes'
      WHEN 4 THEN interval '60 minutes'
      ELSE interval '60 minutes'
    END;
    UPDATE public.provider_jobs
    SET
      status = 'pending',
      next_run_at = pg_catalog.now() + v_delay,
      last_error_code = NULLIF(btrim(p_error_code), ''),
      updated_at = pg_catalog.now()
    WHERE id = p_job_id;
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'status', 'pending',
      'next_run_at', pg_catalog.now() + v_delay
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_OUTCOME');
END;
$function$;

CREATE OR REPLACE FUNCTION yogaflow_private.mark_email_delivery(p_id uuid, p_status text, p_error_code text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_row public.email_deliveries%ROWTYPE;
  v_code text;
  v_attempts integer;
  v_delay interval;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('sent', 'skipped', 'failed', 'released') THEN
    RAISE EXCEPTION 'INVALID_STATUS'
      USING ERRCODE = '22023';
  END IF;

  IF p_error_code IS NOT NULL AND p_error_code !~ '^[A-Z_]{3,64}$' THEN
    RAISE EXCEPTION 'INVALID_ERROR_CODE'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_row
  FROM public.email_deliveries
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_status = 'released' THEN
    IF v_row.status IS DISTINCT FROM 'sending' THEN
      RAISE EXCEPTION 'NOT_SENDING'
        USING ERRCODE = '22023';
    END IF;
    UPDATE public.email_deliveries
    SET
      status = 'pending',
      locked_until = NULL
    WHERE id = p_id;
    RETURN;
  END IF;

  IF p_status = 'sent' THEN
    UPDATE public.email_deliveries
    SET
      status = 'sent',
      sent_at = pg_catalog.now(),
      locked_until = NULL,
      last_error_code = NULL
    WHERE id = p_id;
    RETURN;
  END IF;

  IF p_status = 'skipped' THEN
    UPDATE public.email_deliveries
    SET
      status = 'skipped',
      locked_until = NULL,
      last_error_code = p_error_code
    WHERE id = p_id;
    RETURN;
  END IF;

  -- failed = dieser Versuch; Retry oder endgültig failed (S6c).
  v_code := p_error_code;
  v_attempts := v_row.attempts + 1;

  IF v_attempts >= 5 THEN
    UPDATE public.email_deliveries
    SET
      status = 'failed',
      attempts = v_attempts,
      locked_until = NULL,
      last_error_code = v_code
    WHERE id = p_id;
    RETURN;
  END IF;

  v_delay := CASE v_attempts
    WHEN 1 THEN interval '1 minute'
    WHEN 2 THEN interval '5 minutes'
    WHEN 3 THEN interval '15 minutes'
    ELSE interval '60 minutes'
  END;

  UPDATE public.email_deliveries
  SET
    status = 'pending',
    attempts = v_attempts,
    next_attempt_at = pg_catalog.now() + v_delay,
    locked_until = NULL,
    last_error_code = v_code
  WHERE id = p_id;
END;
$function$;

DO $check$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'yogaflow_private.finish_provider_job(uuid, text, text)',
    'yogaflow_private.mark_email_delivery(uuid, text, text)',
    'public.finish_provider_job(uuid, text, text)',
    'public.mark_email_delivery(uuid, text, text)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'claim release: % zu weit freigegeben', v_fn;
    END IF;
  END LOOP;
END;
$check$;
