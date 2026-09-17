-- Nur Diagnose für Stufe 1: gibt ausschließlich den vom Aufrufer gesendeten
-- Header x-omlify-tenant zurück. Die Datenbank wertet den Header sonst nicht
-- aus. Wird in Stufe 4 entfernt.

CREATE OR REPLACE FUNCTION public.debug_request_tenant_header()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT nullif(current_setting('request.headers', true), '')::json ->> 'x-omlify-tenant';
$$;

REVOKE ALL ON FUNCTION public.debug_request_tenant_header() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.debug_request_tenant_header() TO authenticated;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.debug_request_tenant_header()', 'EXECUTE') THEN
    RAISE EXCEPTION 'debug_request_tenant_header: anon hat EXECUTE';
  END IF;
END $$;
