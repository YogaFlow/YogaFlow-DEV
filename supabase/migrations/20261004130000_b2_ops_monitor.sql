-- B2 U1–U3 — ops_alerts + Zähl-RPC + Cron → ops-monitor (15 min).
-- allow: ops_monitor_collect,ops_monitor_apply,retry_missing_receipts,invoke_ops_monitor,delete_tenant_complete
--
-- Abweichungen U2 (Bericht):
--   (c) payment.orphan → provider_events_raw.processing_error = 'ORPHAN' (kein events-Typ)
--   (g) process_ledger failed ist flüchtig → Events ohne ledger_event_log > 30 min
--   (i) Stripe-Zahlung/-Erstattung > 10 min ohne Beleg (STAND Nachtrag N2)

CREATE TABLE public.ops_alerts (
  key text PRIMARY KEY,
  first_seen timestamptz NOT NULL DEFAULT pg_catalog.now(),
  last_seen timestamptz NOT NULL DEFAULT pg_catalog.now(),
  count integer NOT NULL DEFAULT 1,
  notified_at timestamptz,
  resolved_at timestamptz,
  CONSTRAINT ops_alerts_key_check CHECK (pg_catalog.length(key) BETWEEN 3 AND 200),
  CONSTRAINT ops_alerts_count_check CHECK (count >= 0)
);

COMMENT ON TABLE public.ops_alerts IS
  'B2 U3: Entprellung für ops-monitor. key = slug:kind, nur Zählwerte.';

ALTER TABLE public.ops_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ops_alerts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ops_monitor_collect()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_rows jsonb := '[]'::jsonb;
BEGIN
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

  -- (c) Orphans: processing_error ORPHAN (tenant kann NULL sein)
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
      GROUP BY e.tenant_id
    ) c
    LEFT JOIN public.tenants t ON t.id = c.tenant_id
  ), '[]'::jsonb);

  -- (d) payment_disputes (offen: needs_response; Ist-Zustand DEV)
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

  -- (e) provider_events_raw Verarbeitungsfehler (ohne PAYMENT_NOT_READY < 30 min)
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

  -- (g) Ledger: payment.recorded/reversed ohne ledger_event_log > 30 min
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
      GROUP BY e.tenant_id
    ) c
    JOIN public.tenants t ON t.id = c.tenant_id
  ), '[]'::jsonb);

  -- (h) pg_cron: eigene Jobs failed letzte 60 min oder letzter Erfolg zu alt
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
      WHERE j.jobname LIKE 'yogaflow_%'
        AND (
          EXISTS (
            SELECT 1
            FROM cron.job_run_details d
            WHERE d.jobid = j.jobid
              AND d.status = 'failed'
              AND d.start_time > pg_catalog.now() - interval '60 minutes'
          )
          OR NOT EXISTS (
            SELECT 1
            FROM cron.job_run_details d
            WHERE d.jobid = j.jobid
              AND d.status = 'succeeded'
              AND d.start_time > pg_catalog.now() - (
                CASE
                  WHEN j.schedule = '* * * * *' THEN interval '3 minutes'
                  WHEN j.schedule = '*/5 * * * *' THEN interval '15 minutes'
                  WHEN j.schedule = '*/15 * * * *' THEN interval '45 minutes'
                  ELSE interval '45 minutes'
                END
              )
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
  'B2 U2: Nur Zählwerte je Studio/Art. Nur service_role.';

REVOKE ALL ON FUNCTION public.ops_monitor_collect() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_monitor_collect() TO service_role;

CREATE OR REPLACE FUNCTION public.ops_monitor_apply(p_findings jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_finding jsonb;
  v_key text;
  v_count integer;
  v_open text[] := '{}';
  v_notify jsonb := '[]'::jsonb;
  v_resolved jsonb := '[]'::jsonb;
  v_row public.ops_alerts%ROWTYPE;
  v_now timestamptz := pg_catalog.now();
BEGIN
  IF p_findings IS NULL OR pg_catalog.jsonb_typeof(p_findings) IS DISTINCT FROM 'array' THEN
    p_findings := '[]'::jsonb;
  END IF;

  FOR v_finding IN SELECT * FROM pg_catalog.jsonb_array_elements(p_findings)
  LOOP
    v_key := v_finding->>'key';
    v_count := COALESCE((v_finding->>'count')::integer, 0);
    IF v_key IS NULL OR v_count <= 0 THEN
      CONTINUE;
    END IF;
    v_open := array_append(v_open, v_key);

    SELECT * INTO v_row FROM public.ops_alerts WHERE key = v_key;
    IF NOT FOUND THEN
      INSERT INTO public.ops_alerts (key, first_seen, last_seen, count, notified_at, resolved_at)
      VALUES (v_key, v_now, v_now, v_count, v_now, NULL);
      v_notify := v_notify || pg_catalog.jsonb_build_array(
        v_finding || pg_catalog.jsonb_build_object('event', 'new')
      );
    ELSE
      UPDATE public.ops_alerts
      SET last_seen = v_now,
          count = v_count,
          resolved_at = NULL
      WHERE key = v_key;

      IF v_row.resolved_at IS NOT NULL THEN
        UPDATE public.ops_alerts SET notified_at = v_now WHERE key = v_key;
        v_notify := v_notify || pg_catalog.jsonb_build_array(
          v_finding || pg_catalog.jsonb_build_object('event', 'reopened')
        );
      ELSIF v_row.notified_at IS NULL
         OR v_row.notified_at <= v_now - interval '24 hours' THEN
        UPDATE public.ops_alerts SET notified_at = v_now WHERE key = v_key;
        v_notify := v_notify || pg_catalog.jsonb_build_array(
          v_finding || pg_catalog.jsonb_build_object('event', 'reminder')
        );
      END IF;
    END IF;
  END LOOP;

  FOR v_row IN
    SELECT * FROM public.ops_alerts
    WHERE resolved_at IS NULL
      AND NOT (key = ANY (v_open))
  LOOP
    UPDATE public.ops_alerts
    SET resolved_at = v_now, count = 0
    WHERE key = v_row.key;
    v_resolved := v_resolved || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('key', v_row.key, 'event', 'resolved')
    );
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'notify', v_notify,
    'resolved', v_resolved
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.ops_monitor_apply(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_monitor_apply(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION yogaflow_private.invoke_ops_monitor()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_url text;
  v_secret text;
BEGIN
  SELECT ds.decrypted_secret INTO v_url
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'ops_monitor_url';

  SELECT ds.decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'ops_monitor_secret';

  IF v_url IS NULL OR btrim(v_url) = ''
     OR v_secret IS NULL OR btrim(v_secret) = ''
  THEN
    RAISE LOG 'ops_monitor: Vault-Eintrag fehlt (ops_monitor_url/secret)';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := btrim(v_url),
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || btrim(v_secret)
    ),
    body := '{}'::jsonb
  );
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.invoke_ops_monitor()
  FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT jobid FROM cron.job WHERE jobname = 'yogaflow_ops_monitor'
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
  PERFORM cron.schedule(
    'yogaflow_ops_monitor',
    '*/15 * * * *',
    $cron$SELECT yogaflow_private.invoke_ops_monitor();$cron$
  );
END;
$$;

-- delete_tenant_complete: ops_alerts hat keinen tenant_id — nichts zu löschen.

DO $$
BEGIN
  IF to_regclass('public.ops_alerts') IS NULL THEN
    RAISE EXCEPTION 'B2: ops_alerts fehlt';
  END IF;
  IF has_table_privilege('authenticated', 'public.ops_alerts', 'SELECT')
     OR has_function_privilege('anon', 'public.ops_monitor_collect()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.ops_monitor_collect()', 'EXECUTE') THEN
    RAISE EXCEPTION 'B2: ops_monitor zu weit freigegeben';
  END IF;
END;
$$;
