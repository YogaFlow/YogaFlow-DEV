-- FS-1 C — ops-monitor pg_net-Timeout 15 s (bisher Default 5000 ms).
-- allow: invoke_ops_monitor
-- Rechte unverändert: nur REVOKE PUBLIC/anon/authenticated, kein neues GRANT.

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
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.invoke_ops_monitor() IS
  'B2/FS-1: Ruft ops-monitor per pg_net (Timeout 15 s). Ohne Vault-Einträge: no-op.';

REVOKE ALL ON FUNCTION yogaflow_private.invoke_ops_monitor()
  FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_def text;
BEGIN
  v_def := pg_catalog.pg_get_functiondef(
    'yogaflow_private.invoke_ops_monitor()'::regprocedure
  );
  IF position('timeout_milliseconds := 15000' IN v_def) = 0 THEN
    RAISE EXCEPTION 'FS-1: invoke_ops_monitor ohne timeout 15000';
  END IF;
  IF has_function_privilege('anon', 'yogaflow_private.invoke_ops_monitor()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'yogaflow_private.invoke_ops_monitor()', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'FS-1: invoke_ops_monitor EXECUTE für anon/authenticated';
  END IF;
END;
$$;
