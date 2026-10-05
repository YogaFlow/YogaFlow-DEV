-- RT-1: Trigger-Fix — NEW.registration_id nur auf payment_attempts lesen.
-- allow: set_terms_document_id_on_insert

CREATE OR REPLACE FUNCTION yogaflow_private.set_terms_document_id_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_reg_id uuid;
  v_from_reg uuid;
BEGIN
  IF NEW.terms_document_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'payment_attempts' THEN
    v_reg_id := (to_jsonb(NEW) ->> 'registration_id')::uuid;
    IF v_reg_id IS NOT NULL THEN
      SELECT r.terms_document_id INTO v_from_reg
      FROM public.registrations r
      WHERE r.id = v_reg_id;
      NEW.terms_document_id := v_from_reg;
    END IF;
  END IF;

  IF NEW.terms_document_id IS NULL AND NEW.tenant_id IS NOT NULL THEN
    NEW.terms_document_id := yogaflow_private.current_terms_document_id(NEW.tenant_id);
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.set_terms_document_id_on_insert()
  FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF position('to_jsonb' IN pg_catalog.pg_get_functiondef(
    'yogaflow_private.set_terms_document_id_on_insert()'::regprocedure
  )) = 0 THEN
    RAISE EXCEPTION 'RT-1: set_terms_document_id_on_insert ohne to_jsonb-Fix';
  END IF;
END;
$$;
