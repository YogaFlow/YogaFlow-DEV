-- 2.2b-1 Z13: Teilnehmer lesen, ob Online-Zahlung Pflicht ist (eine Quelle:
-- yogaflow_private.online_payment_required). Keine acct_…, keine weiteren Felder.
--
-- Rückweg:
--   DROP FUNCTION IF EXISTS public.booking_payment_options();

CREATE OR REPLACE FUNCTION public.booking_payment_options()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid := yogaflow_private.get_my_member_id();
  v_tenant_id uuid := yogaflow_private.get_my_tenant_id();
BEGIN
  IF v_member_id IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'online_required',
    yogaflow_private.online_payment_required(v_tenant_id)
  );
END;
$function$;

COMMENT ON FUNCTION public.booking_payment_options() IS
  '2.2b-1: Ob Online-Pflicht gilt (online_payment_required). Nur { online_required }.';

REVOKE ALL ON FUNCTION public.booking_payment_options()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.booking_payment_options() TO authenticated;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.booking_payment_options()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Selbstprüfung: anon hat EXECUTE auf booking_payment_options';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.booking_payment_options()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Selbstprüfung: authenticated ohne EXECUTE auf booking_payment_options';
  END IF;
  IF pg_catalog.pg_get_functiondef('public.booking_payment_options()'::regprocedure)
       NOT LIKE '%online_payment_required%' THEN
    RAISE EXCEPTION 'Selbstprüfung: booking_payment_options ruft online_payment_required nicht auf';
  END IF;
END;
$$;
