-- B2 V1–V5 — legal_acceptances + AVV-Sperre beim Einschalten der Online-Zahlung.
-- allow: accept_legal_document,get_legal_acceptance_status,current_avv_accepted,set_online_payments_enabled,delete_tenant_complete
--
-- AVV Version/Hash: Stand 04.10.2026, SHA-256 des gerenderten legal/auftragsverarbeitung.html.

CREATE TABLE public.legal_document_versions (
  document text PRIMARY KEY,
  version text NOT NULL,
  content_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT legal_document_versions_document_check
    CHECK (document IN ('avv', 'terms', 'privacy')),
  CONSTRAINT legal_document_versions_version_check
    CHECK (version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  CONSTRAINT legal_document_versions_hash_check
    CHECK (content_hash ~ '^[a-f0-9]{64}$')
);

ALTER TABLE public.legal_document_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.legal_document_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.legal_document_versions TO authenticated;

CREATE POLICY legal_document_versions_select_authenticated
  ON public.legal_document_versions
  FOR SELECT TO authenticated
  USING (true);

INSERT INTO public.legal_document_versions (document, version, content_hash)
VALUES (
  'avv',
  '2026-10-04',
  '081aa26d9251f364dd5594c4f3ddf5786c57bdb813ba1bcbf0f5c17208d639c5'
)
ON CONFLICT (document) DO UPDATE
  SET version = EXCLUDED.version,
      content_hash = EXCLUDED.content_hash,
      updated_at = pg_catalog.now();

CREATE TABLE public.legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  document text NOT NULL,
  version text NOT NULL,
  content_hash text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT legal_acceptances_document_check
    CHECK (document IN ('avv', 'terms', 'privacy')),
  CONSTRAINT legal_acceptances_version_check
    CHECK (version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  CONSTRAINT legal_acceptances_hash_check
    CHECK (content_hash ~ '^[a-f0-9]{64}$')
);

CREATE INDEX legal_acceptances_tenant_doc_accepted_idx
  ON public.legal_acceptances (tenant_id, document, accepted_at DESC);

COMMENT ON TABLE public.legal_acceptances IS
  'B2 V1: Nachweisbare Zustimmung zu AVV/AGB/Datenschutz. Append-only.';

ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.legal_acceptances FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.legal_acceptances TO authenticated;

CREATE POLICY legal_acceptances_select_managers
  ON public.legal_acceptances
  FOR SELECT TO authenticated
  USING (
    tenant_id = yogaflow_private.get_my_tenant_id()
    AND yogaflow_private.is_tenant_manager()
  );

CREATE TRIGGER legal_acceptances_append_only
  BEFORE UPDATE OR DELETE ON public.legal_acceptances
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.enforce_append_only();

CREATE OR REPLACE FUNCTION yogaflow_private.current_avv_accepted(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.legal_acceptances a
    JOIN public.legal_document_versions v
      ON v.document = 'avv'
     AND a.document = 'avv'
     AND a.version = v.version
     AND a.content_hash = v.content_hash
    WHERE a.tenant_id = p_tenant
  );
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.current_avv_accepted(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.accept_legal_document(
  p_document text,
  p_version text,
  p_content_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member uuid := yogaflow_private.get_my_member_id();
  v_tenant uuid := yogaflow_private.get_my_tenant_id();
  v_cur public.legal_document_versions%ROWTYPE;
  v_id uuid;
BEGIN
  IF v_member IS NULL OR v_tenant IS NULL OR NOT yogaflow_private.is_owner() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;
  IF p_document IS NULL OR p_document NOT IN ('avv', 'terms', 'privacy') THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_DOCUMENT');
  END IF;

  SELECT * INTO v_cur
  FROM public.legal_document_versions
  WHERE document = p_document;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'UNKNOWN_DOCUMENT');
  END IF;
  IF p_version IS DISTINCT FROM v_cur.version
     OR p_content_hash IS DISTINCT FROM v_cur.content_hash THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VERSION_MISMATCH');
  END IF;

  -- Idempotent: gleiche Version schon da → kein zweites Insert
  SELECT a.id INTO v_id
  FROM public.legal_acceptances a
  WHERE a.tenant_id = v_tenant
    AND a.document = p_document
    AND a.version = v_cur.version
    AND a.content_hash = v_cur.content_hash
  ORDER BY a.accepted_at DESC
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true, 'changed', false, 'id', v_id, 'version', v_cur.version
    );
  END IF;

  INSERT INTO public.legal_acceptances (
    tenant_id, user_id, document, version, content_hash
  ) VALUES (
    v_tenant, v_member, p_document, v_cur.version, v_cur.content_hash
  )
  RETURNING id INTO v_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true, 'changed', true, 'id', v_id, 'version', v_cur.version
  );
END;
$function$;

COMMENT ON FUNCTION public.accept_legal_document(text, text, text) IS
  'B2 V1: Owner bestätigt Dokument der aktuellen Version. Nur eigenes Studio.';

REVOKE ALL ON FUNCTION public.accept_legal_document(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_legal_document(text, text, text)
  TO authenticated;

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

  SELECT a.* INTO v_acc
  FROM public.legal_acceptances a
  WHERE a.tenant_id = v_tenant
    AND a.document = p_document
    AND a.version = v_cur.version
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

REVOKE ALL ON FUNCTION public.get_legal_acceptance_status(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_legal_acceptance_status(text)
  TO authenticated;

-- V5: Online einschalten nur mit aktueller AVV
CREATE OR REPLACE FUNCTION public.set_online_payments_enabled(p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_member_id uuid;
  v_tenant_id uuid;
  v_online boolean;
  v_type text;
  v_payload jsonb;
  v_event_id uuid;
BEGIN
  v_member_id := yogaflow_private.get_my_member_id();
  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_member_id IS NULL OR v_tenant_id IS NULL OR NOT yogaflow_private.is_owner() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF p_enabled IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('tenant_payment_settings:' || v_tenant_id::text, 0)
  );

  SELECT s.online_payments_enabled
    INTO v_online
  FROM yogaflow_private.tenant_payment_settings_for(v_tenant_id) s;

  IF p_enabled THEN
    IF NOT yogaflow_private.platform_flag('online_payments') THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'PLATFORM_DISABLED');
    END IF;
    IF NOT yogaflow_private.provider_ready(v_tenant_id) THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'PROVIDER_NOT_READY');
    END IF;
    IF NOT yogaflow_private.tax_setting_present(v_tenant_id) THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'TAX_SETTING_MISSING');
    END IF;
    IF NOT yogaflow_private.legal_profile_complete(v_tenant_id) THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'LEGAL_PROFILE_MISSING');
    END IF;
    IF NOT yogaflow_private.current_avv_accepted(v_tenant_id) THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'AVV_MISSING');
    END IF;
  END IF;

  IF v_online = p_enabled THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true, 'changed', false, 'online_payments_enabled', v_online
    );
  END IF;

  INSERT INTO public.tenant_payment_settings (
    tenant_id, online_payments_enabled, changed_by, updated_at
  ) VALUES (
    v_tenant_id, p_enabled, v_member_id, pg_catalog.now()
  )
  ON CONFLICT (tenant_id) DO UPDATE
    SET online_payments_enabled = EXCLUDED.online_payments_enabled,
        changed_by = EXCLUDED.changed_by,
        updated_at = EXCLUDED.updated_at;

  IF p_enabled THEN
    v_type := 'payments.online_enabled';
    v_payload := '{}'::jsonb;
  ELSE
    v_type := 'payments.online_disabled';
    v_payload := pg_catalog.jsonb_build_object('reason', 'OWNER');
  END IF;

  v_event_id := yogaflow_private.insert_event(
    v_tenant_id,
    v_type,
    'tenant',
    v_tenant_id,
    v_payload,
    pg_catalog.gen_random_uuid()
  );

  PERFORM yogaflow_private.insert_audit(
    v_tenant_id,
    v_member_id,
    v_type,
    'tenant_payment_settings',
    v_tenant_id,
    ARRAY['online_payments_enabled', 'changed_by', 'updated_at']::text[],
    v_event_id
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true, 'changed', true, 'online_payments_enabled', p_enabled
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_online_payments_enabled(boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_online_payments_enabled(boolean)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_tenant_complete(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND: Kein Tenant mit dieser ID.'
      USING ERRCODE = 'P0002';
  END IF;

  ALTER TABLE public.users DISABLE TRIGGER prevent_last_owner_delete;
  BEGIN
    SET LOCAL yogaflow.allow_append_only_delete = 'on';
    SET LOCAL yogaflow.allow_payment_delete = 'on';
    SET LOCAL yogaflow.allow_pass_product_delete = 'on';
    SET LOCAL yogaflow.allow_pass_delete = 'on';
    SET LOCAL yogaflow.allow_email_delivery_delete = 'on';
    SET CONSTRAINTS public.registrations_pass_id_fkey DEFERRED;
    SET CONSTRAINTS public.coverage_waive_batches_tenant_id_fkey DEFERRED;
    SET CONSTRAINTS public.registrations_coverage_waived_batch_id_fkey DEFERRED;

    DELETE FROM public.ledger_event_log WHERE tenant_id = p_tenant_id;
    DELETE FROM public.ledger_entries WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenant_tax_settings WHERE tenant_id = p_tenant_id;
    DELETE FROM public.legal_acceptances WHERE tenant_id = p_tenant_id;
    DELETE FROM public.receipts WHERE tenant_id = p_tenant_id;
    DELETE FROM public.receipt_counters WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenant_legal_profiles WHERE tenant_id = p_tenant_id;

    DELETE FROM public.provider_events_raw WHERE tenant_id = p_tenant_id;
    DELETE FROM public.provider_capabilities WHERE tenant_id = p_tenant_id;
    DELETE FROM public.provider_accounts WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenant_payment_settings WHERE tenant_id = p_tenant_id;

    DELETE FROM public.audit_log WHERE tenant_id = p_tenant_id;
    DELETE FROM public.email_deliveries WHERE tenant_id = p_tenant_id;
    DELETE FROM public.events WHERE tenant_id = p_tenant_id;
    DELETE FROM public.user_notifications WHERE tenant_id = p_tenant_id;
    DELETE FROM public.messages WHERE tenant_id = p_tenant_id;
    DELETE FROM public.pass_movements WHERE tenant_id = p_tenant_id;
    DELETE FROM public.passes WHERE tenant_id = p_tenant_id;
    DELETE FROM public.provider_jobs WHERE tenant_id = p_tenant_id;
    DELETE FROM public.payment_attempts WHERE tenant_id = p_tenant_id;
    DELETE FROM public.payment_disputes WHERE tenant_id = p_tenant_id;
    DELETE FROM public.payment_refunds WHERE tenant_id = p_tenant_id;
    DELETE FROM public.payments
      WHERE tenant_id = p_tenant_id
        AND reverses_payment_id IS NOT NULL;
    DELETE FROM public.payments WHERE tenant_id = p_tenant_id;
    DELETE FROM public.registrations WHERE tenant_id = p_tenant_id;
    DELETE FROM public.coverage_waive_batches WHERE tenant_id = p_tenant_id;
    DELETE FROM public.courses WHERE tenant_id = p_tenant_id;
    DELETE FROM public.pass_products WHERE tenant_id = p_tenant_id;
    DELETE FROM public.users WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenants WHERE id = p_tenant_id;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.users ENABLE TRIGGER prevent_last_owner_delete;
    RAISE;
  END;

  ALTER TABLE public.users ENABLE TRIGGER prevent_last_owner_delete;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_tenant_complete(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tenant_complete(uuid)
  TO postgres, service_role;

DO $$
BEGIN
  IF to_regclass('public.legal_acceptances') IS NULL THEN
    RAISE EXCEPTION 'B2: legal_acceptances fehlt';
  END IF;
  IF has_function_privilege('anon', 'public.accept_legal_document(text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'B2: anon hat accept_legal_document';
  END IF;
  IF pg_catalog.pg_get_functiondef('public.set_online_payments_enabled(boolean)'::regprocedure)
       NOT LIKE '%AVV_MISSING%' THEN
    RAISE EXCEPTION 'B2: set_online_payments_enabled ohne AVV_MISSING';
  END IF;
END;
$$;
