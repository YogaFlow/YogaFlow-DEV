-- F1 / L3: Neue Vorlagen-Version sperrt Online nicht; zuletzt freigegebene Version gilt weiter.
-- allow: studio_tpl_accepted,accepted_studio_tpl_version,get_studio_legal_status,get_public_studio_legal,current_terms_document_id
--
-- Aktuelle Vorlagen (v2 Kurskarte): 2026-10-08
--   studio_terms_tpl:    3963f3e508212ecf783567f76d12df9f41a385699d7e9e357e0bca30245189d8
--   studio_privacy_tpl:  f8966bceddfe6d8a3c83eb2d8b9bf06b7528b231e489613ee37b85f0b9508866
-- v1 (unverändert im Repo): 2026-10-05 / 873e… / fff7…

-- ---------------------------------------------------------------------------
-- 1. studio_tpl_accepted: irgendeine Freigabe reicht (nicht nur aktuelle Version)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.studio_tpl_accepted(
  p_tenant uuid,
  p_document text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.legal_acceptances a
    WHERE a.tenant_id = p_tenant
      AND a.document = p_document
  );
$function$;

COMMENT ON FUNCTION yogaflow_private.studio_tpl_accepted(uuid, text) IS
  'RT-1/F1 L3/L9: Studio hat irgendeine Vorlagen-Version freigegeben (nicht nur die aktuelle).';

REVOKE ALL ON FUNCTION yogaflow_private.studio_tpl_accepted(uuid, text)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION yogaflow_private.studio_legal_texts_ready(uuid) IS
  'RT-1 L9 / F1 L3: Impressum vollständig + AGB/Datenschutz jemals freigegeben und veröffentlicht. Neue Vorlage sperrt nicht.';

-- ---------------------------------------------------------------------------
-- 2. Aktuelle Vorlagen-Version v2 (Kurskarte) in legal_document_versions
-- ---------------------------------------------------------------------------

INSERT INTO public.legal_document_versions (document, version, content_hash)
VALUES
  (
    'studio_terms_tpl',
    '2026-10-08',
    '3963f3e508212ecf783567f76d12df9f41a385699d7e9e357e0bca30245189d8'
  ),
  (
    'studio_privacy_tpl',
    '2026-10-08',
    'f8966bceddfe6d8a3c83eb2d8b9bf06b7528b231e489613ee37b85f0b9508866'
  )
ON CONFLICT (document) DO UPDATE
  SET version = EXCLUDED.version,
      content_hash = EXCLUDED.content_hash,
      updated_at = pg_catalog.now();

-- ---------------------------------------------------------------------------
-- 3. get_studio_legal_status: accepted_content_hash + texts_ready ohne aktuelle Vorlage
-- ---------------------------------------------------------------------------

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
      'accepted_version', v_terms_acc.version,
      'accepted_content_hash', v_terms_acc.content_hash
    ),
    'privacy', pg_catalog.jsonb_build_object(
      'status', v_priv_status,
      'created_at', v_priv_doc.created_at,
      'template_version', COALESCE(v_priv_doc.template_version, v_priv_cur.version),
      'current_template_version', v_priv_cur.version,
      'accepted_version', v_priv_acc.version,
      'accepted_content_hash', v_priv_acc.content_hash
    )
  );
END;
$function$;

COMMENT ON FUNCTION public.get_studio_legal_status() IS
  'RT-1/F1: Status-Pillen; new_template sperrt Online nicht (texts_ready bei alter Freigabe).';

-- ---------------------------------------------------------------------------
-- 4. Öffentliche Anzeige / Buchungs-Anhang: zuletzt freigegebene Vorlagen-Version
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.accepted_studio_tpl_version(
  p_tenant uuid,
  p_document text
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT a.version
  FROM public.legal_acceptances a
  WHERE a.tenant_id = p_tenant
    AND a.document = p_document
  ORDER BY a.accepted_at DESC
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.accepted_studio_tpl_version(uuid, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION yogaflow_private.current_terms_document_id(p_tenant uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_ver text;
  v_id uuid;
BEGIN
  v_ver := yogaflow_private.accepted_studio_tpl_version(p_tenant, 'studio_terms_tpl');

  IF v_ver IS NOT NULL THEN
    SELECT d.id INTO v_id
    FROM public.studio_legal_documents d
    WHERE d.tenant_id = p_tenant
      AND d.kind = 'terms'
      AND d.template_version = v_ver
    ORDER BY d.created_at DESC
    LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  SELECT d.id INTO v_id
  FROM public.studio_legal_documents d
  WHERE d.tenant_id = p_tenant
    AND d.kind = 'terms'
    AND d."trigger" = 'release'
  ORDER BY d.created_at DESC
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT d.id INTO v_id
  FROM public.studio_legal_documents d
  WHERE d.tenant_id = p_tenant
    AND d.kind = 'terms'
  ORDER BY d.created_at DESC
  LIMIT 1;
  RETURN v_id;
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.current_terms_document_id(uuid) IS
  'RT-1/F1 L3: AGB-Fassung der zuletzt freigegebenen Vorlagen-Version, sonst neueste Freigabe.';

CREATE OR REPLACE FUNCTION public.get_public_studio_legal(p_kind text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_slug text := yogaflow_private.request_tenant_slug();
  v_tenant uuid;
  v_name text;
  v_email text;
  v_doc public.studio_legal_documents%ROWTYPE;
  v_prof public.tenant_legal_profiles%ROWTYPE;
  v_acc_doc text;
  v_ver text;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('imprint', 'terms', 'privacy') THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_KIND');
  END IF;
  IF v_slug IS NULL OR v_slug = '#invalid' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NO_TENANT');
  END IF;

  SELECT t.id, t.name INTO v_tenant, v_name
  FROM public.tenants t
  WHERE t.slug = v_slug;
  IF v_tenant IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NO_TENANT');
  END IF;
  SELECT * INTO v_prof FROM public.tenant_legal_profiles WHERE tenant_id = v_tenant;
  v_email := COALESCE(v_prof.contact_email, '');

  IF p_kind = 'imprint' AND NOT yogaflow_private.imprint_complete(v_tenant) THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'kind', 'imprint',
      'minimal', true,
      'studio_name', COALESCE(v_name, ''),
      'contact_email', v_email,
      'body_md', NULL,
      'created_at', NULL
    );
  END IF;

  v_acc_doc := CASE p_kind
    WHEN 'terms' THEN 'studio_terms_tpl'
    WHEN 'privacy' THEN 'studio_privacy_tpl'
    ELSE NULL
  END;
  IF v_acc_doc IS NOT NULL THEN
    v_ver := yogaflow_private.accepted_studio_tpl_version(v_tenant, v_acc_doc);
  END IF;

  IF v_ver IS NOT NULL THEN
    SELECT * INTO v_doc
    FROM public.studio_legal_documents d
    WHERE d.tenant_id = v_tenant AND d.kind = p_kind AND d.template_version = v_ver
    ORDER BY d.created_at DESC
    LIMIT 1;
  END IF;

  IF v_doc.id IS NULL THEN
    SELECT * INTO v_doc
    FROM public.studio_legal_documents d
    WHERE d.tenant_id = v_tenant AND d.kind = p_kind
    ORDER BY d.created_at DESC
    LIMIT 1;
  END IF;

  IF NOT FOUND OR v_doc.id IS NULL THEN
    IF p_kind = 'imprint' THEN
      RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'kind', 'imprint',
        'minimal', true,
        'studio_name', COALESCE(v_name, ''),
        'contact_email', v_email,
        'body_md', NULL,
        'created_at', NULL
      );
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'kind', p_kind,
      'present', false,
      'studio_name', COALESCE(v_name, ''),
      'body_md', NULL,
      'created_at', NULL
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'kind', p_kind,
    'present', true,
    'minimal', false,
    'studio_name', COALESCE(v_name, ''),
    'body_md', v_doc.body_md,
    'created_at', v_doc.created_at,
    'template_version', v_doc.template_version,
    'content_hash', v_doc.content_hash,
    'id', v_doc.id
  );
END;
$function$;

COMMENT ON FUNCTION public.get_public_studio_legal(text) IS
  'RT-1/F1 L3/L7: Öffentliche Fassung der zuletzt freigegebenen Vorlagen-Version.';

-- ---------------------------------------------------------------------------
-- 5. Selbstprüfung
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_def text;
  v_hash text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.legal_document_versions
    WHERE document = 'studio_terms_tpl'
      AND version = '2026-10-08'
      AND content_hash = '3963f3e508212ecf783567f76d12df9f41a385699d7e9e357e0bca30245189d8'
  ) THEN
    RAISE EXCEPTION 'F1: studio_terms_tpl v2 Hash falsch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.legal_document_versions
    WHERE document = 'studio_privacy_tpl'
      AND version = '2026-10-08'
      AND content_hash = 'f8966bceddfe6d8a3c83eb2d8b9bf06b7528b231e489613ee37b85f0b9508866'
  ) THEN
    RAISE EXCEPTION 'F1: studio_privacy_tpl v2 Hash falsch';
  END IF;

  v_def := pg_catalog.pg_get_functiondef(
    'yogaflow_private.studio_tpl_accepted(uuid,text)'::regprocedure
  );
  IF position('legal_document_versions' IN v_def) > 0 THEN
    RAISE EXCEPTION 'F1: studio_tpl_accepted darf nicht mehr auf legal_document_versions joinen';
  END IF;

  v_def := pg_catalog.pg_get_functiondef('public.get_studio_legal_status()'::regprocedure);
  IF position('accepted_content_hash' IN v_def) = 0 THEN
    RAISE EXCEPTION 'F1: get_studio_legal_status ohne accepted_content_hash';
  END IF;

  v_def := pg_catalog.pg_get_functiondef(
    'yogaflow_private.current_terms_document_id(uuid)'::regprocedure
  );
  IF position('accepted_studio_tpl_version' IN v_def) = 0 THEN
    RAISE EXCEPTION 'F1: current_terms_document_id ohne accepted_studio_tpl_version';
  END IF;
END;
$$;
