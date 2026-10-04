-- UX-4 N1 — AVV-Kanon: content_hash = Markdown-SHA (b90051ca…), nicht alter HTML-Hash.
-- „Aktuell zugestimmt“ = Zustimmung mit gleichem content_hash wie legal_document_versions.
-- allow: current_avv_accepted,get_legal_acceptance_status

UPDATE public.legal_document_versions
SET
  content_hash = 'b90051caf84bc2deb99535bff2218eec4067d61209ba70d5294c04c20cd5e1d3',
  updated_at = pg_catalog.now()
WHERE document = 'avv'
  AND content_hash IS DISTINCT FROM
    'b90051caf84bc2deb99535bff2218eec4067d61209ba70d5294c04c20cd5e1d3';

CREATE OR REPLACE FUNCTION yogaflow_private.current_avv_accepted(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  -- Maßgeblich ist der content_hash der aktuellen Dokumentversion (nicht die Datums-Version allein).
  SELECT EXISTS (
    SELECT 1
    FROM public.legal_acceptances a
    JOIN public.legal_document_versions v
      ON v.document = 'avv'
     AND a.document = 'avv'
     AND a.content_hash = v.content_hash
    WHERE a.tenant_id = p_tenant
  );
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.current_avv_accepted(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_legal_acceptance_status(p_document text DEFAULT 'avv')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member uuid := yogaflow_private.get_my_member_id();
  v_tenant uuid := yogaflow_private.get_my_tenant_id();
  v_cur public.legal_document_versions%ROWTYPE;
  v_acc public.legal_acceptances%ROWTYPE;
  v_name text;
BEGIN
  IF v_member IS NULL OR v_tenant IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;
  IF p_document IS NULL OR p_document NOT IN ('avv', 'terms', 'privacy') THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_DOCUMENT');
  END IF;

  SELECT * INTO v_cur FROM public.legal_document_versions WHERE document = p_document;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'UNKNOWN_DOCUMENT');
  END IF;

  -- Aktuell = gleiche content_hash wie Kanon (Version allein reicht nicht).
  SELECT a.* INTO v_acc
  FROM public.legal_acceptances a
  WHERE a.tenant_id = v_tenant
    AND a.document = p_document
    AND a.content_hash = v_cur.content_hash
  ORDER BY a.accepted_at DESC
  LIMIT 1;

  IF v_acc.id IS NOT NULL THEN
    SELECT trim(both FROM COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, ''))
      INTO v_name
    FROM public.users u
    WHERE u.id = v_acc.user_id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'document', p_document,
    'current_version', v_cur.version,
    'current_hash', v_cur.content_hash,
    'accepted', v_acc.id IS NOT NULL,
    'accepted_at', v_acc.accepted_at,
    'accepted_by_name', NULLIF(v_name, ''),
    'accepted_version', v_acc.version
  );
END;
$function$;

COMMENT ON FUNCTION public.get_legal_acceptance_status(text) IS
  'Status der aktuellen Dokumentversion; accepted nur bei gleichem content_hash.';

REVOKE ALL ON FUNCTION public.get_legal_acceptance_status(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_legal_acceptance_status(text)
  TO authenticated;

DO $$
DECLARE
  v_hash text;
  v_ok boolean;
BEGIN
  SELECT content_hash INTO v_hash
  FROM public.legal_document_versions
  WHERE document = 'avv';
  IF v_hash IS DISTINCT FROM
       'b90051caf84bc2deb99535bff2218eec4067d61209ba70d5294c04c20cd5e1d3' THEN
    RAISE EXCEPTION 'UX4-N1: legal_document_versions.avv hash erwartet b90051ca…, ist %',
      left(COALESCE(v_hash, ''), 16);
  END IF;

  -- Alte HTML-Hash-Zustimmung darf current_avv_accepted nicht erfüllen.
  SELECT yogaflow_private.current_avv_accepted('00000000-0000-0000-0000-000000000000')
    INTO v_ok;
  IF v_ok IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'UX4-N1: current_avv_accepted(leerer Tenant) muss false sein';
  END IF;
END;
$$;
