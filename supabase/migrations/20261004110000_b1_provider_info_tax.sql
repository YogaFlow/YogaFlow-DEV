-- B1: Steuerregime in get_studio_provider_info für den Kaufprozess (K5).
-- allow: get_studio_provider_info
--
-- Rückweg: Funktion aus 20261004090000 wiederherstellen.

CREATE OR REPLACE FUNCTION public.get_studio_provider_info()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid := yogaflow_private.get_my_member_id();
  v_tenant_id uuid := yogaflow_private.get_my_tenant_id();
  v_row public.tenant_legal_profiles%ROWTYPE;
  v_regime text;
  v_vat integer;
BEGIN
  IF v_member_id IS NULL OR v_tenant_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_row
  FROM public.tenant_legal_profiles
  WHERE tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', true, 'present', false);
  END IF;

  SELECT s.regime::text, s.vat_rate_bp
    INTO v_regime, v_vat
  FROM public.tenant_tax_settings s
  WHERE s.tenant_id = v_tenant_id
    AND s.valid_from <= (pg_catalog.timezone('Europe/Berlin', pg_catalog.now()))::date
  ORDER BY s.valid_from DESC
  LIMIT 1;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'present', true,
    'legal_name', v_row.legal_name,
    'street', v_row.street,
    'house_number', v_row.house_number,
    'postal_code', v_row.postal_code,
    'city', v_row.city,
    'country', v_row.country,
    'contact_email', v_row.contact_email,
    'phone', v_row.phone,
    'regime', v_regime,
    'vat_rate_bp', v_vat
  );
END;
$function$;

COMMENT ON FUNCTION public.get_studio_provider_info() IS
  'B1 K1/K5: Anbieter + Steuer für Kaufprozess. Mitglieder, ohne Steuernummer.';

REVOKE ALL ON FUNCTION public.get_studio_provider_info()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_studio_provider_info()
  TO authenticated;
