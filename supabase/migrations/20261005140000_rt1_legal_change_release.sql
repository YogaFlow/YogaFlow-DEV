-- RT-1 Nachtrag: Pille „Änderung freigeben“ wenn Weitere Regeln nach Freigabe geändert.
-- allow: get_studio_legal_status

CREATE OR REPLACE FUNCTION public.get_studio_legal_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member uuid := yogaflow_private.get_my_member_id();
  v_tenant uuid := yogaflow_private.get_my_tenant_id();
  v_imprint_ok boolean;
  v_terms_cur public.legal_document_versions%ROWTYPE;
  v_priv_cur public.legal_document_versions%ROWTYPE;
  v_terms_acc public.legal_acceptances%ROWTYPE;
  v_priv_acc public.legal_acceptances%ROWTYPE;
  v_terms_doc public.studio_legal_documents%ROWTYPE;
  v_priv_doc public.studio_legal_documents%ROWTYPE;
  v_imp_doc public.studio_legal_documents%ROWTYPE;
  v_terms_release public.studio_legal_documents%ROWTYPE;
  v_terms_status text;
  v_priv_status text;
  v_imp_status text;
  v_extra_now text;
  v_extra_released text;
BEGIN
  IF v_member IS NULL OR v_tenant IS NULL OR NOT yogaflow_private.is_tenant_manager() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  v_imprint_ok := yogaflow_private.imprint_complete(v_tenant);

  SELECT * INTO v_imp_doc
  FROM public.studio_legal_documents
  WHERE tenant_id = v_tenant AND kind = 'imprint'
  ORDER BY created_at DESC LIMIT 1;

  SELECT * INTO v_terms_doc
  FROM public.studio_legal_documents
  WHERE tenant_id = v_tenant AND kind = 'terms'
  ORDER BY created_at DESC LIMIT 1;

  SELECT * INTO v_priv_doc
  FROM public.studio_legal_documents
  WHERE tenant_id = v_tenant AND kind = 'privacy'
  ORDER BY created_at DESC LIMIT 1;

  SELECT * INTO v_terms_release
  FROM public.studio_legal_documents
  WHERE tenant_id = v_tenant AND kind = 'terms' AND "trigger" = 'release'
  ORDER BY created_at DESC LIMIT 1;

  SELECT * INTO v_terms_cur FROM public.legal_document_versions WHERE document = 'studio_terms_tpl';
  SELECT * INTO v_priv_cur FROM public.legal_document_versions WHERE document = 'studio_privacy_tpl';

  SELECT a.* INTO v_terms_acc
  FROM public.legal_acceptances a
  WHERE a.tenant_id = v_tenant AND a.document = 'studio_terms_tpl'
  ORDER BY a.accepted_at DESC LIMIT 1;

  SELECT a.* INTO v_priv_acc
  FROM public.legal_acceptances a
  WHERE a.tenant_id = v_tenant AND a.document = 'studio_privacy_tpl'
  ORDER BY a.accepted_at DESC LIMIT 1;

  SELECT COALESCE(pg_catalog.btrim(COALESCE(extra_rules, '')), '')
  INTO v_extra_now
  FROM public.tenant_legal_profiles
  WHERE tenant_id = v_tenant;
  IF NOT FOUND THEN
    v_extra_now := '';
  END IF;

  v_extra_released := COALESCE(
    pg_catalog.btrim(COALESCE(v_terms_release."values" ->> 'extra_rules', '')),
    ''
  );

  IF NOT v_imprint_ok THEN
    v_imp_status := 'missing';
  ELSE
    v_imp_status := 'current';
  END IF;

  IF v_terms_acc.id IS NULL THEN
    v_terms_status := CASE WHEN v_imprint_ok THEN 'release' ELSE 'missing' END;
  ELSIF v_terms_cur.document IS NOT NULL
        AND v_terms_acc.version = v_terms_cur.version
        AND v_terms_acc.content_hash = v_terms_cur.content_hash THEN
    IF v_terms_release.id IS NOT NULL AND v_extra_now IS DISTINCT FROM v_extra_released THEN
      v_terms_status := 'change_release';
    ELSE
      v_terms_status := 'current';
    END IF;
  ELSE
    v_terms_status := 'new_template';
  END IF;

  IF v_priv_acc.id IS NULL THEN
    v_priv_status := CASE WHEN v_imprint_ok THEN 'release' ELSE 'missing' END;
  ELSIF v_priv_cur.document IS NOT NULL
        AND v_priv_acc.version = v_priv_cur.version
        AND v_priv_acc.content_hash = v_priv_cur.content_hash THEN
    v_priv_status := 'current';
  ELSE
    v_priv_status := 'new_template';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'imprint_complete', v_imprint_ok,
    'texts_ready', yogaflow_private.studio_legal_texts_ready(v_tenant),
    'imprint', pg_catalog.jsonb_build_object(
      'status', v_imp_status,
      'created_at', v_imp_doc.created_at,
      'template_version', v_imp_doc.template_version
    ),
    'terms', pg_catalog.jsonb_build_object(
      'status', v_terms_status,
      'created_at', v_terms_doc.created_at,
      'template_version', COALESCE(v_terms_doc.template_version, v_terms_cur.version),
      'current_template_version', v_terms_cur.version,
      'accepted_version', v_terms_acc.version
    ),
    'privacy', pg_catalog.jsonb_build_object(
      'status', v_priv_status,
      'created_at', v_priv_doc.created_at,
      'template_version', COALESCE(v_priv_doc.template_version, v_priv_cur.version),
      'current_template_version', v_priv_cur.version,
      'accepted_version', v_priv_acc.version
    )
  );
END;
$function$;

COMMENT ON FUNCTION public.get_studio_legal_status() IS
  'RT-1: Status-Pillen Rechtliches; change_release bei geänderten Weiteren Regeln.';

DO $$
DECLARE
  v_def text;
BEGIN
  v_def := pg_catalog.pg_get_functiondef('public.get_studio_legal_status()'::regprocedure);
  IF position('change_release' IN v_def) = 0 THEN
    RAISE EXCEPTION 'RT-1 Nachtrag: get_studio_legal_status ohne change_release';
  END IF;
END;
$$;
