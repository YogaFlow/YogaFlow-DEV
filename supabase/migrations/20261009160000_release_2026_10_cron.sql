-- Release 2026-10 — Cron-Jobs idempotent (zuletzt im Push).
-- allow: release_schedule_cron
--
-- Alle 10 Jobs entstehen bereits in früheren Migrationen (A6-3 … RT-2).
-- Diese Datei stellt sicher, dass auf PROD nach --include-all dieselben
-- Namen/Zeitpläne liegen, auch wenn ein früherer cron.schedule fehlschlug.
--
-- Extensions: NICHT hier anlegen. Auf Supabase löst
--   CREATE EXTENSION IF NOT EXISTS pg_cron
-- bei bereits installierter Extension 2BP01 (dependent privileges) aus
-- (Befund DEV 09.10.2026). Installation:
--   • frisch: A6-3 (20260928010000) und B2 (20260929160000) für pg_net
--   • Handgriff T0-1a: Dashboard → Extensions → pg_cron + pg_net, falls
--     CREATE EXTENSION in A6-3/B2 auf PROD scheitert
-- Schema-Ziel wie DEV: pg_cron → pg_catalog, pg_net → public.
--
-- Keine URL/Secrets — invoke_* lesen Vault und sind no-op ohne Eintrag.
--
-- Rückweg: Jobs per cron.unschedule entfernen; Extensions bleiben.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION
      'release_2026_10: Extension pg_cron fehlt — Dashboard Extensions oder A6-3 zuerst (T0-1a)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION
      'release_2026_10: Extension pg_net fehlt — Dashboard Extensions oder B2 zuerst (T0-1a)';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION yogaflow_private.release_schedule_cron(
  p_name text,
  p_schedule text,
  p_command text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT jobid FROM cron.job WHERE jobname = p_name
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
  PERFORM cron.schedule(p_name, p_schedule, p_command);
END;
$fn$;

REVOKE ALL ON FUNCTION yogaflow_private.release_schedule_cron(text, text, text)
  FROM PUBLIC, anon, authenticated;

SELECT yogaflow_private.release_schedule_cron(
  'yogaflow_dispatch_emails',
  '* * * * *',
  $cron$SELECT yogaflow_private.invoke_email_dispatch();$cron$
);
SELECT yogaflow_private.release_schedule_cron(
  'yogaflow_expire_payment_holds',
  '* * * * *',
  $cron$SELECT yogaflow_private.expire_payment_holds();$cron$
);
SELECT yogaflow_private.release_schedule_cron(
  'yogaflow_expire_pass_payment_attempts',
  '* * * * *',
  $cron$SELECT yogaflow_private.expire_pass_payment_attempts();$cron$
);
SELECT yogaflow_private.release_schedule_cron(
  'yogaflow_process_provider_jobs',
  '* * * * *',
  $cron$SELECT yogaflow_private.invoke_provider_jobs();$cron$
);
SELECT yogaflow_private.release_schedule_cron(
  'yogaflow_process_legal_pdf',
  '* * * * *',
  $cron$SELECT yogaflow_private.invoke_legal_pdf_jobs();$cron$
);
SELECT yogaflow_private.release_schedule_cron(
  'yogaflow_process_ledger',
  '*/5 * * * *',
  $cron$SELECT yogaflow_private.process_ledger();$cron$
);
SELECT yogaflow_private.release_schedule_cron(
  'yogaflow_ops_monitor',
  '*/15 * * * *',
  $cron$SELECT yogaflow_private.invoke_ops_monitor();$cron$
);
SELECT yogaflow_private.release_schedule_cron(
  'yogaflow_expire_passes',
  '5 * * * *',
  $cron$SELECT yogaflow_private.expire_passes();$cron$
);
SELECT yogaflow_private.release_schedule_cron(
  'yogaflow_pass_expiry_reminders',
  '15 6 * * *',
  $cron$SELECT yogaflow_private.enqueue_pass_expiry_reminders();$cron$
);
SELECT yogaflow_private.release_schedule_cron(
  'yogaflow_retention_cleanup',
  '15 3 * * *',
  $cron$SELECT yogaflow_private.invoke_retention_cleanup();$cron$
);

DROP FUNCTION yogaflow_private.release_schedule_cron(text, text, text);

DO $$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*)::integer INTO v_n
  FROM cron.job
  WHERE jobname LIKE 'yogaflow_%';

  IF v_n <> 10 THEN
    RAISE EXCEPTION 'release_2026_10: erwartet 10 yogaflow_-Cron-Jobs, gefunden %', v_n;
  END IF;
END;
$$;
