-- B2 O1–O4 — Cron-Toleranz je Zeitplan, ledger nur mit Steuerstatus,
-- provider_events_raw.reviewed_at, geprüfte Fehler aus (c)/(e).
-- allow: ops_monitor_collect,ops_cron_tolerance,ops_cron_is_due,ops_mark_provider_errors_reviewed

-- ---------------------------------------------------------------------------
-- O3: reviewed_at (mutabel; immutable-Trigger sperrt diese Spalte nicht)
-- ---------------------------------------------------------------------------

ALTER TABLE public.provider_events_raw
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

COMMENT ON COLUMN public.provider_events_raw.reviewed_at IS
  'B2 O3: manuell als geprüft markiert; ops-monitor (c)/(e) zählen nur NULL.';

CREATE OR REPLACE FUNCTION public.ops_mark_provider_errors_reviewed(p_before timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_n integer;
BEGIN
  IF p_before IS NULL THEN
    RAISE EXCEPTION 'ops_mark_provider_errors_reviewed: p_before fehlt'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.provider_events_raw e
  SET reviewed_at = pg_catalog.now()
  WHERE e.processing_error IS NOT NULL
    AND e.reviewed_at IS NULL
    AND e.received_at < p_before;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

COMMENT ON FUNCTION public.ops_mark_provider_errors_reviewed(timestamptz) IS
  'B2 O3: ungeprüfte provider_events_raw-Fehler vor p_before als reviewed markieren. Nur service_role.';

REVOKE ALL ON FUNCTION public.ops_mark_provider_errors_reviewed(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_mark_provider_errors_reviewed(timestamptz)
  TO service_role;

-- ---------------------------------------------------------------------------
-- O1: Toleranz-Helfer + first_seen für Jobs ohne Lauf
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ops_cron_watch (
  jobname text PRIMARY KEY,
  first_seen timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT ops_cron_watch_jobname_check CHECK (pg_catalog.length(jobname) BETWEEN 3 AND 200)
);

COMMENT ON TABLE public.ops_cron_watch IS
  'B2 O1: erster Beobachtungszeitpunkt je yogaflow_-Cron-Job (für nie gelaufen + jung).';

ALTER TABLE public.ops_cron_watch ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ops_cron_watch FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ops_cron_tolerance(p_schedule text)
RETURNS interval
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_schedule IS NULL OR btrim(p_schedule) = '' THEN
    RAISE LOG 'ops_monitor: unbekannter Cron-Zeitplan (leer), Toleranz 24 h';
    RETURN interval '24 hours';
  END IF;

  IF p_schedule = '* * * * *' THEN
    RETURN interval '5 minutes';
  END IF;
  IF p_schedule = '*/5 * * * *' THEN
    RETURN interval '15 minutes';
  END IF;
  IF p_schedule = '*/15 * * * *' THEN
    RETURN interval '45 minutes';
  END IF;
  -- stündlich: <m> * * * *
  IF p_schedule ~ '^[0-9]{1,2} \* \* \* \*$' THEN
    RETURN interval '3 hours';
  END IF;

  RAISE LOG 'ops_monitor: unbekannter Cron-Zeitplan %, Toleranz 24 h', p_schedule;
  RETURN interval '24 hours';
END;
$function$;

COMMENT ON FUNCTION public.ops_cron_tolerance(text) IS
  'B2 O1: Stale-Toleranz je Cron-Schedule. Nur service_role (Tests + collect).';

REVOKE ALL ON FUNCTION public.ops_cron_tolerance(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_cron_tolerance(text) TO service_role;

CREATE OR REPLACE FUNCTION public.ops_cron_is_due(
  p_schedule text,
  p_first_seen timestamptz,
  p_last_success timestamptz,
  p_now timestamptz DEFAULT pg_catalog.now()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tol interval;
  v_now timestamptz;
BEGIN
  v_now := COALESCE(p_now, pg_catalog.now());
  v_tol := public.ops_cron_tolerance(p_schedule);

  -- Nie erfolgreich: jung (jünger als Toleranz) zählt nicht.
  IF p_last_success IS NULL THEN
    IF p_first_seen IS NULL THEN
      RETURN false;
    END IF;
    RETURN p_first_seen <= v_now - v_tol;
  END IF;

  RETURN p_last_success <= v_now - v_tol;
END;
$function$;

COMMENT ON FUNCTION public.ops_cron_is_due(text, timestamptz, timestamptz, timestamptz) IS
  'B2 O1: ob ein Cron-Job wegen zu altem/fehlendem Erfolg alarmiert. Nur service_role.';

REVOKE ALL ON FUNCTION public.ops_cron_is_due(text, timestamptz, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_cron_is_due(text, timestamptz, timestamptz, timestamptz)
  TO service_role;

-- ---------------------------------------------------------------------------
-- ops_monitor_collect: O1 + O2 + O3
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ops_monitor_collect()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_rows jsonb := '[]'::jsonb;
BEGIN
  -- Watch-Zeilen für alle yogaflow_-Jobs anlegen (first_seen bleibt)
  INSERT INTO public.ops_cron_watch (jobname)
  SELECT j.jobname
  FROM cron.job j
  WHERE j.jobname LIKE 'yogaflow_%'
  ON CONFLICT (jobname) DO NOTHING;

  -- (a) provider_jobs failed oder > 30 min offen/geclaimt
  v_rows := v_rows || COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'key', t.slug || ':provider_jobs',
      'slug', t.slug,
      'kind', 'provider_jobs',
      'count', c.cnt
    ))
    FROM (
      SELECT j.tenant_id, COUNT(*)::integer AS cnt
      FROM public.provider_jobs j
      WHERE j.status = 'failed'
         OR (
           j.status IN ('pending', 'running')
           AND j.updated_at < pg_catalog.now() - interval '30 minutes'
         )
      GROUP BY j.tenant_id
    ) c
    JOIN public.tenants t ON t.id = c.tenant_id
  ), '[]'::jsonb);

  -- (b) payment_refunds failed
  v_rows := v_rows || COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'key', t.slug || ':refunds_failed',
      'slug', t.slug,
      'kind', 'refunds_failed',
      'count', c.cnt
    ))
    FROM (
      SELECT r.tenant_id, COUNT(*)::integer AS cnt
      FROM public.payment_refunds r
      WHERE r.status = 'failed'
      GROUP BY r.tenant_id
    ) c
    JOIN public.tenants t ON t.id = c.tenant_id
  ), '[]'::jsonb);

  -- (c) Orphans: processing_error ORPHAN, nur ungeprüft
  v_rows := v_rows || COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'key', COALESCE(t.slug, '_unresolved') || ':payment_orphan',
      'slug', COALESCE(t.slug, '_unresolved'),
      'kind', 'payment_orphan',
      'count', c.cnt
    ))
    FROM (
      SELECT e.tenant_id, COUNT(*)::integer AS cnt
      FROM public.provider_events_raw e
      WHERE e.processing_error = 'ORPHAN'
        AND e.reviewed_at IS NULL
      GROUP BY e.tenant_id
    ) c
    LEFT JOIN public.tenants t ON t.id = c.tenant_id
  ), '[]'::jsonb);

  -- (d) payment_disputes (offen: needs_response)
  v_rows := v_rows || COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'key', t.slug || ':disputes',
      'slug', t.slug,
      'kind', 'disputes',
      'count', c.cnt
    ))
    FROM (
      SELECT d.tenant_id, COUNT(*)::integer AS cnt
      FROM public.payment_disputes d
      WHERE d.status = 'needs_response'
      GROUP BY d.tenant_id
    ) c
    JOIN public.tenants t ON t.id = c.tenant_id
  ), '[]'::jsonb);

  -- (e) Verarbeitungsfehler, nur ungeprüft (ohne PAYMENT_NOT_READY < 30 min)
  v_rows := v_rows || COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'key', COALESCE(t.slug, '_unresolved') || ':provider_event_error',
      'slug', COALESCE(t.slug, '_unresolved'),
      'kind', 'provider_event_error',
      'count', c.cnt
    ))
    FROM (
      SELECT e.tenant_id, COUNT(*)::integer AS cnt
      FROM public.provider_events_raw e
      WHERE e.processing_error IS NOT NULL
        AND e.processing_error IS DISTINCT FROM 'ORPHAN'
        AND e.reviewed_at IS NULL
        AND NOT (
          e.processing_error = 'PAYMENT_NOT_READY'
          AND e.received_at > pg_catalog.now() - interval '30 minutes'
        )
      GROUP BY e.tenant_id
    ) c
    LEFT JOIN public.tenants t ON t.id = c.tenant_id
  ), '[]'::jsonb);

  -- (f) email_deliveries failed
  v_rows := v_rows || COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'key', t.slug || ':email_failed',
      'slug', t.slug,
      'kind', 'email_failed',
      'count', c.cnt
    ))
    FROM (
      SELECT d.tenant_id, COUNT(*)::integer AS cnt
      FROM public.email_deliveries d
      WHERE d.status = 'failed'
      GROUP BY d.tenant_id
    ) c
    JOIN public.tenants t ON t.id = c.tenant_id
  ), '[]'::jsonb);

  -- (g) Ledger stuck — nur Studios mit gültigem Steuerstatus (O2)
  v_rows := v_rows || COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'key', t.slug || ':ledger_stuck',
      'slug', t.slug,
      'kind', 'ledger_stuck',
      'count', c.cnt
    ))
    FROM (
      SELECT e.tenant_id, COUNT(*)::integer AS cnt
      FROM public.events e
      WHERE e.type IN ('payment.recorded', 'payment.reversed')
        AND e.occurred_at < pg_catalog.now() - interval '30 minutes'
        AND NOT EXISTS (
          SELECT 1 FROM public.ledger_event_log l WHERE l.event_id = e.id
        )
        AND EXISTS (
          SELECT 1
          FROM public.tenant_tax_settings s
          WHERE s.tenant_id = e.tenant_id
            AND s.valid_from <= (pg_catalog.timezone('Europe/Berlin', pg_catalog.now()))::date
        )
      GROUP BY e.tenant_id
    ) c
    JOIN public.tenants t ON t.id = c.tenant_id
  ), '[]'::jsonb);

  -- (h) pg_cron: failed letzte 60 min oder Erfolg zu alt (Toleranz je Schedule, O1)
  v_rows := v_rows || COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'key', '_platform:cron:' || x.jobname,
      'slug', '_platform',
      'kind', 'cron_' || x.jobname,
      'count', 1
    ))
    FROM (
      SELECT j.jobname
      FROM cron.job j
      JOIN public.ops_cron_watch w ON w.jobname = j.jobname
      WHERE j.jobname LIKE 'yogaflow_%'
        AND (
          EXISTS (
            SELECT 1
            FROM cron.job_run_details d
            WHERE d.jobid = j.jobid
              AND d.status = 'failed'
              AND d.start_time > pg_catalog.now() - interval '60 minutes'
          )
          OR public.ops_cron_is_due(
            j.schedule,
            w.first_seen,
            (
              SELECT pg_catalog.max(d.start_time)
              FROM cron.job_run_details d
              WHERE d.jobid = j.jobid
                AND d.status = 'succeeded'
            ),
            pg_catalog.now()
          )
        )
    ) x
  ), '[]'::jsonb);

  -- (i) Stripe Zahlung/Erstattung > 10 min ohne Beleg
  v_rows := v_rows || COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'key', t.slug || ':receipt_missing',
      'slug', t.slug,
      'kind', 'receipt_missing',
      'count', c.cnt
    ))
    FROM (
      SELECT x.tenant_id, COUNT(*)::integer AS cnt
      FROM (
        SELECT p.tenant_id
        FROM public.payments p
        WHERE p.provider = 'stripe'::public.payment_provider
          AND p.status = 'succeeded'::public.payment_status
          AND p.subject_type = 'registration'
          AND p.reverses_payment_id IS NULL
          AND p.amount_cents > 0
          AND COALESCE(p.received_at, p.created_at) < pg_catalog.now() - interval '10 minutes'
          AND NOT EXISTS (
            SELECT 1 FROM public.receipts r
            WHERE r.payment_id = p.id AND r.kind = 'receipt'
          )
        UNION ALL
        SELECT rf.tenant_id
        FROM public.payment_refunds rf
        WHERE rf.status = 'succeeded'
          AND rf.updated_at < pg_catalog.now() - interval '10 minutes'
          AND NOT EXISTS (
            SELECT 1 FROM public.receipts r
            WHERE r.refund_id = rf.id AND r.kind = 'refund_receipt'
          )
      ) x
      GROUP BY x.tenant_id
    ) c
    JOIN public.tenants t ON t.id = c.tenant_id
  ), '[]'::jsonb);

  RETURN COALESCE(v_rows, '[]'::jsonb);
END;
$function$;

COMMENT ON FUNCTION public.ops_monitor_collect() IS
  'B2 U2/O1–O3: Zählwerte je Studio/Art. Nur service_role.';

REVOKE ALL ON FUNCTION public.ops_monitor_collect() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_monitor_collect() TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'provider_events_raw'
      AND column_name = 'reviewed_at'
  ) THEN
    RAISE EXCEPTION 'B2 O3: reviewed_at fehlt';
  END IF;
  IF has_function_privilege('anon', 'public.ops_mark_provider_errors_reviewed(timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.ops_mark_provider_errors_reviewed(timestamptz)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.ops_cron_tolerance(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.ops_cron_is_due(text,timestamptz,timestamptz,timestamptz)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'B2 O1–O3: Funktionen zu weit freigegeben';
  END IF;
  IF public.ops_cron_tolerance('5 * * * *') IS DISTINCT FROM interval '3 hours' THEN
    RAISE EXCEPTION 'B2 O1: stündliche Toleranz falsch';
  END IF;
  IF public.ops_cron_tolerance('* * * * *') IS DISTINCT FROM interval '5 minutes' THEN
    RAISE EXCEPTION 'B2 O1: Minuten-Toleranz falsch';
  END IF;
END;
$$;
