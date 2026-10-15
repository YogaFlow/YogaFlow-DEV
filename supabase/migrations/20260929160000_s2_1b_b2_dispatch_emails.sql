-- 2.1b-b Teil B2 — Versand: pg_net + Cron yogaflow_dispatch_emails.
--
-- Bezug: S6e–S6f (Julius 29.09.2026). Vault-Einträge legt Julius per
-- scripts/dev/email_dispatch_secret.mjs an (nicht diese Migration).
-- Fehlen URL oder Secret → Job tut nichts (kein Fehler in einer Schleife).
--
-- Bewusst nicht: Edge Function (Deploy separat), Vault-Secrets, Client.
--
-- Rückweg:
--   SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'yogaflow_dispatch_emails';
--   DROP FUNCTION IF EXISTS yogaflow_private.invoke_email_dispatch();
--   -- Extension pg_net bleibt (kann andere Nutzer haben).

-- pg_net legt das Schema net selbst an (Supabase-Standard).
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION yogaflow_private.invoke_email_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_url text;
  v_secret text;
BEGIN
  SELECT ds.decrypted_secret
    INTO v_url
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'email_dispatch_url';

  SELECT ds.decrypted_secret
    INTO v_secret
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'email_dispatch_secret';

  IF v_url IS NULL OR btrim(v_url) = ''
     OR v_secret IS NULL OR btrim(v_secret) = ''
  THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := btrim(v_url),
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Email-Dispatch-Secret', btrim(v_secret)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.invoke_email_dispatch() IS
  'S6f: Ruft dispatch-emails per pg_net auf. Ohne Vault-Einträge: no-op.';

REVOKE ALL ON FUNCTION yogaflow_private.invoke_email_dispatch()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION yogaflow_private.invoke_email_dispatch()
  TO service_role;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'yogaflow_dispatch_emails'
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'yogaflow_dispatch_emails',
    '* * * * *',
    $cron$SELECT yogaflow_private.invoke_email_dispatch();$cron$
  );
END;
$$;

DO $$
DECLARE
  v_n integer;
  v_oid oid;
  v_ok boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION 'B2: Extension pg_net fehlt';
  END IF;

  IF to_regprocedure('yogaflow_private.invoke_email_dispatch()') IS NULL THEN
    RAISE EXCEPTION 'B2: yogaflow_private.invoke_email_dispatch fehlt';
  END IF;

  IF to_regprocedure('public.invoke_email_dispatch()') IS NOT NULL THEN
    RAISE EXCEPTION 'B2: public.invoke_email_dispatch darf nicht existieren';
  END IF;

  SELECT count(*)::integer INTO v_n
  FROM cron.job WHERE jobname = 'yogaflow_dispatch_emails';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'B2: Cron-Job yogaflow_dispatch_emails count=%', v_n;
  END IF;

  v_oid := to_regprocedure('yogaflow_private.invoke_email_dispatch()');
  SELECT NOT has_function_privilege('anon', v_oid, 'EXECUTE')
     AND NOT has_function_privilege('authenticated', v_oid, 'EXECUTE')
    INTO v_ok;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'B2: anon/authenticated hat EXECUTE auf yogaflow_private.invoke_email_dispatch';
  END IF;
END;
$$;
