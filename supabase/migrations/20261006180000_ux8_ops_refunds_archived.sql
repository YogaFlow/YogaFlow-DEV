-- UX-8 U0b — failed Erstattungen zu archivierten Kursen nicht in ops_alerts zählen
-- allow: ops_monitor_collect

CREATE OR REPLACE FUNCTION public.ops_monitor_collect()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_rows jsonb := '[]'::jsonb;
BEGIN
  INSERT INTO public.ops_cron_watch (jobname)
  SELECT j.jobname
  FROM cron.job j
  WHERE j.jobname LIKE 'yogaflow_%'
  ON CONFLICT (jobname) DO NOTHING;

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
        AND NOT EXISTS (
          SELECT 1
          FROM public.payments p
          JOIN public.registrations reg ON reg.id = p.registration_id
          JOIN public.courses c ON c.id = reg.course_id
          WHERE p.id = r.payment_id
            AND c.archived_at IS NOT NULL
        )
      GROUP BY r.tenant_id
    ) c
    JOIN public.tenants t ON t.id = c.tenant_id
  ), '[]'::jsonb);

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

  -- (i) inkl. pass_purchase (K1)
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
          AND p.subject_type IN ('registration', 'pass_purchase')
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
  'B2/K1/UX-8: Zählwerte; failed-Erstattungen zu archivierten Kursen ausgenommen. Nur service_role.';

REVOKE ALL ON FUNCTION public.ops_monitor_collect()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_monitor_collect()
  TO service_role;

DO $$
BEGIN
  IF position(
    'archived_at IS NOT NULL' in pg_get_functiondef('public.ops_monitor_collect()'::regprocedure)
  ) = 0 THEN
    RAISE EXCEPTION 'UX-8: ops_monitor_collect ohne Archiv-Filter für refunds_failed';
  END IF;
END $$;
