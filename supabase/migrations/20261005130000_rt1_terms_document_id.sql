-- RT-1 — terms_document_id beim Buchen/Kaufen + PDF-Job-Outbox.
-- allow: current_terms_document_id,set_terms_document_id_on_insert,enqueue_studio_legal_pdf,set_studio_legal_pdf_path,claim_studio_legal_pdf_jobs,finish_studio_legal_pdf_job,publish_studio_legal_document,invoke_legal_pdf_jobs,delete_tenant_complete,note_ops_alert
--
-- A: BEFORE INSERT Trigger setzen terms_document_id (deckt register_for_course,
--    create_pending_registration, create_payment_attempt, create_pass_payment_attempt,
--    fulfill_pass_online_purchase / Offline-Pass-Anlage ab) — ohne große RPC-Kopien.
-- C: studio_legal_pdf_jobs + enqueue bei publish; pdf_path via DEFINER-Bypass.

-- ---------------------------------------------------------------------------
-- 1. Aktuelle AGB-Fassung
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.current_terms_document_id(p_tenant uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT d.id
  FROM public.studio_legal_documents d
  WHERE d.tenant_id = p_tenant
    AND d.kind = 'terms'
  ORDER BY d.created_at DESC
  LIMIT 1;
$function$;

COMMENT ON FUNCTION yogaflow_private.current_terms_document_id(uuid) IS
  'RT-1: Neueste AGB-Fassung des Tenants, sonst NULL.';

REVOKE ALL ON FUNCTION yogaflow_private.current_terms_document_id(uuid)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Trigger: terms_document_id bei INSERT
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.set_terms_document_id_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.terms_document_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'payment_attempts' AND NEW.registration_id IS NOT NULL THEN
    SELECT r.terms_document_id INTO NEW.terms_document_id
    FROM public.registrations r
    WHERE r.id = NEW.registration_id;
  END IF;

  IF NEW.terms_document_id IS NULL AND NEW.tenant_id IS NOT NULL THEN
    NEW.terms_document_id := yogaflow_private.current_terms_document_id(NEW.tenant_id);
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.set_terms_document_id_on_insert()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS registrations_set_terms_document_id
  ON public.registrations;
CREATE TRIGGER registrations_set_terms_document_id
  BEFORE INSERT ON public.registrations
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.set_terms_document_id_on_insert();

DROP TRIGGER IF EXISTS payment_attempts_set_terms_document_id
  ON public.payment_attempts;
CREATE TRIGGER payment_attempts_set_terms_document_id
  BEFORE INSERT ON public.payment_attempts
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.set_terms_document_id_on_insert();

DROP TRIGGER IF EXISTS passes_set_terms_document_id
  ON public.passes;
CREATE TRIGGER passes_set_terms_document_id
  BEFORE INSERT ON public.passes
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.set_terms_document_id_on_insert();

-- ---------------------------------------------------------------------------
-- 3. PDF-Jobs + Storage
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.studio_legal_pdf_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  document_id uuid NOT NULL REFERENCES public.studio_legal_documents (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  tries integer NOT NULL DEFAULT 0,
  next_run_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  done_at timestamptz,
  CONSTRAINT studio_legal_pdf_jobs_status_check
    CHECK (status IN ('pending', 'running', 'done', 'failed')),
  CONSTRAINT studio_legal_pdf_jobs_tries_nonneg CHECK (tries >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS studio_legal_pdf_jobs_document_pending_unique
  ON public.studio_legal_pdf_jobs (document_id)
  WHERE status IN ('pending', 'running');

CREATE INDEX IF NOT EXISTS studio_legal_pdf_jobs_claim_idx
  ON public.studio_legal_pdf_jobs (status, next_run_at);

COMMENT ON TABLE public.studio_legal_pdf_jobs IS
  'RT-1: Outbox legal_pdf.render — Edge Function legal-pdf.';

ALTER TABLE public.studio_legal_pdf_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.studio_legal_pdf_jobs
  FROM PUBLIC, anon, authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'studio-legal',
  'studio-legal',
  false,
  5242880,
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 4. enqueue / set pdf_path / claim / finish
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.enqueue_studio_legal_pdf(p_document_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_doc public.studio_legal_documents%ROWTYPE;
  v_id uuid;
BEGIN
  IF p_document_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_doc
  FROM public.studio_legal_documents
  WHERE id = p_document_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_doc.pdf_path IS NOT NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.studio_legal_pdf_jobs (
    tenant_id, document_id, status, tries, next_run_at
  ) VALUES (
    v_doc.tenant_id, p_document_id, 'pending', 0, pg_catalog.now()
  )
  ON CONFLICT (document_id) WHERE status IN ('pending', 'running')
  DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT j.id INTO v_id
    FROM public.studio_legal_pdf_jobs j
    WHERE j.document_id = p_document_id
      AND j.status IN ('pending', 'running')
    ORDER BY j.created_at DESC
    LIMIT 1;
  END IF;

  RETURN v_id;
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.enqueue_studio_legal_pdf(uuid) IS
  'RT-1: PDF-Auftrag anlegen wenn pdf_path fehlt.';

REVOKE ALL ON FUNCTION yogaflow_private.enqueue_studio_legal_pdf(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION yogaflow_private.set_studio_legal_pdf_path(
  p_document_id uuid,
  p_pdf_path text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_n integer;
BEGIN
  IF p_document_id IS NULL
     OR p_pdf_path IS NULL
     OR btrim(p_pdf_path) = ''
     OR char_length(p_pdf_path) > 500
  THEN
    RETURN false;
  END IF;

  PERFORM pg_catalog.set_config('yogaflow.allow_append_only_delete', 'on', true);

  UPDATE public.studio_legal_documents
  SET pdf_path = btrim(p_pdf_path)
  WHERE id = p_document_id
    AND pdf_path IS NULL;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.set_studio_legal_pdf_path(uuid, text) IS
  'RT-1: pdf_path einmalig setzen (append-only Bypass). Nur service_role.';

REVOKE ALL ON FUNCTION yogaflow_private.set_studio_legal_pdf_path(uuid, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_studio_legal_pdf_path(
  p_document_id uuid,
  p_pdf_path text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT yogaflow_private.set_studio_legal_pdf_path(p_document_id, p_pdf_path);
$function$;

REVOKE ALL ON FUNCTION public.set_studio_legal_pdf_path(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_studio_legal_pdf_path(uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION yogaflow_private.claim_studio_legal_pdf_jobs(p_limit integer)
RETURNS TABLE (
  job_id uuid,
  tenant_id uuid,
  document_id uuid,
  kind text,
  body_md text,
  studio_name text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 5), 20));
  v_job public.studio_legal_pdf_jobs%ROWTYPE;
BEGIN
  FOR v_job IN
    SELECT j.*
    FROM public.studio_legal_pdf_jobs j
    WHERE (
        j.status = 'pending'
        AND j.next_run_at <= pg_catalog.now()
      )
      OR (
        j.status = 'running'
        AND j.updated_at < pg_catalog.now() - interval '10 minutes'
      )
    ORDER BY j.next_run_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  LOOP
    UPDATE public.studio_legal_pdf_jobs
    SET status = 'running',
        tries = v_job.tries + 1,
        updated_at = pg_catalog.now()
    WHERE id = v_job.id;

    RETURN QUERY
    SELECT
      v_job.id,
      v_job.tenant_id,
      v_job.document_id,
      d.kind,
      d.body_md,
      COALESCE(t.name, 'Studio'),
      d.created_at
    FROM public.studio_legal_documents d
    JOIN public.tenants t ON t.id = d.tenant_id
    WHERE d.id = v_job.document_id;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.claim_studio_legal_pdf_jobs(integer)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_studio_legal_pdf_jobs(p_limit integer DEFAULT 5)
RETURNS TABLE (
  job_id uuid,
  tenant_id uuid,
  document_id uuid,
  kind text,
  body_md text,
  studio_name text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT * FROM yogaflow_private.claim_studio_legal_pdf_jobs(p_limit);
$function$;

REVOKE ALL ON FUNCTION public.claim_studio_legal_pdf_jobs(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_studio_legal_pdf_jobs(integer)
  TO service_role;

CREATE OR REPLACE FUNCTION yogaflow_private.finish_studio_legal_pdf_job(
  p_job_id uuid,
  p_outcome text,
  p_error_code text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_job public.studio_legal_pdf_jobs%ROWTYPE;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('done', 'retry', 'failed') THEN
    RAISE EXCEPTION 'INVALID_OUTCOME' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_job
  FROM public.studio_legal_pdf_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF p_outcome = 'done' THEN
    UPDATE public.studio_legal_pdf_jobs
    SET status = 'done',
        done_at = pg_catalog.now(),
        last_error_code = NULL,
        updated_at = pg_catalog.now()
    WHERE id = p_job_id;
  ELSIF p_outcome = 'failed' OR v_job.tries >= 8 THEN
    UPDATE public.studio_legal_pdf_jobs
    SET status = 'failed',
        last_error_code = COALESCE(p_error_code, 'FAILED'),
        updated_at = pg_catalog.now()
    WHERE id = p_job_id;
  ELSE
    UPDATE public.studio_legal_pdf_jobs
    SET status = 'pending',
        next_run_at = pg_catalog.now() + (interval '30 seconds' * LEAST(v_job.tries, 10)),
        last_error_code = p_error_code,
        updated_at = pg_catalog.now()
    WHERE id = p_job_id;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.finish_studio_legal_pdf_job(uuid, text, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.finish_studio_legal_pdf_job(
  p_job_id uuid,
  p_outcome text,
  p_error_code text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT yogaflow_private.finish_studio_legal_pdf_job(p_job_id, p_outcome, p_error_code);
$function$;

REVOKE ALL ON FUNCTION public.finish_studio_legal_pdf_job(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_studio_legal_pdf_job(uuid, text, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 5. publish: PDF-Job enqueuen
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.publish_studio_legal_document(
  p_kind text,
  p_template_version text,
  p_body_md text,
  p_values jsonb,
  p_content_hash text,
  p_trigger text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member uuid := yogaflow_private.get_my_member_id();
  v_tenant uuid := yogaflow_private.get_my_tenant_id();
  v_hash text;
  v_prev text;
  v_id uuid;
  v_pdf text;
BEGIN
  IF v_member IS NULL OR v_tenant IS NULL OR NOT yogaflow_private.is_tenant_manager() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('imprint', 'terms', 'privacy') THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_KIND');
  END IF;
  IF p_trigger IS NULL OR p_trigger NOT IN ('release', 'settings_change', 'profile_change') THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_TRIGGER');
  END IF;
  IF p_template_version IS NULL
     OR p_template_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_VERSION');
  END IF;
  IF p_body_md IS NULL OR pg_catalog.btrim(p_body_md) = '' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'EMPTY_BODY');
  END IF;

  v_hash := yogaflow_private.hash_legal_text(p_body_md);
  IF p_content_hash IS DISTINCT FROM v_hash THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'HASH_MISMATCH');
  END IF;

  SELECT d.content_hash, d.id, d.pdf_path
    INTO v_prev, v_id, v_pdf
  FROM public.studio_legal_documents d
  WHERE d.tenant_id = v_tenant AND d.kind = p_kind
  ORDER BY d.created_at DESC
  LIMIT 1;

  IF v_prev IS NOT DISTINCT FROM v_hash THEN
    IF v_pdf IS NULL THEN
      PERFORM yogaflow_private.enqueue_studio_legal_pdf(v_id);
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'success', true, 'changed', false, 'id', v_id, 'content_hash', v_hash
    );
  END IF;

  INSERT INTO public.studio_legal_documents (
    tenant_id, kind, template_version, body_md, "values", content_hash, "trigger", created_by
  ) VALUES (
    v_tenant, p_kind, p_template_version, p_body_md,
    COALESCE(p_values, '{}'::jsonb), v_hash, p_trigger, v_member
  )
  RETURNING id INTO v_id;

  PERFORM yogaflow_private.enqueue_studio_legal_pdf(v_id);

  RETURN pg_catalog.jsonb_build_object(
    'success', true, 'changed', true, 'id', v_id, 'content_hash', v_hash
  );
END;
$function$;

COMMENT ON FUNCTION public.publish_studio_legal_document(text, text, text, jsonb, text, text) IS
  'RT-1: Fassung einfügen wenn Hash neu; PDF-Job enqueuen.';

REVOKE ALL ON FUNCTION public.publish_studio_legal_document(text, text, text, jsonb, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_studio_legal_document(text, text, text, jsonb, text, text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Cron → legal-pdf
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.invoke_legal_pdf_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_url text;
  v_secret text;
  v_due boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.studio_legal_pdf_jobs j
    WHERE (
        j.status = 'pending'
        AND j.next_run_at <= pg_catalog.now()
      )
      OR (
        j.status = 'running'
        AND j.updated_at < pg_catalog.now() - interval '10 minutes'
      )
  ) INTO v_due;

  IF NOT v_due THEN
    RETURN;
  END IF;

  SELECT ds.decrypted_secret INTO v_url
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'legal_pdf_url';

  SELECT ds.decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'legal_pdf_secret';

  IF v_url IS NULL OR btrim(v_url) = ''
     OR v_secret IS NULL OR btrim(v_secret) = ''
  THEN
    RAISE LOG 'legal_pdf: Vault-Eintrag fehlt (legal_pdf_url/secret)';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := btrim(v_url),
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || btrim(v_secret)
    ),
    body := '{}'::jsonb
  );
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.invoke_legal_pdf_jobs() IS
  'Ruft legal-pdf per pg_net, wenn fällige PDF-Jobs da sind.';

REVOKE ALL ON FUNCTION yogaflow_private.invoke_legal_pdf_jobs()
  FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT jobid FROM cron.job WHERE jobname = 'yogaflow_process_legal_pdf'
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
  PERFORM cron.schedule(
    'yogaflow_process_legal_pdf',
    '* * * * *',
    $cron$SELECT yogaflow_private.invoke_legal_pdf_jobs();$cron$
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. ops_alert Notiz (Mail ohne PDF nach 10 min)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.note_ops_alert(p_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_key text := btrim(COALESCE(p_key, ''));
  v_now timestamptz := pg_catalog.now();
BEGIN
  IF v_key = '' OR char_length(v_key) < 3 OR char_length(v_key) > 200 THEN
    RETURN;
  END IF;

  INSERT INTO public.ops_alerts (key, first_seen, last_seen, count, notified_at, resolved_at)
  VALUES (v_key, v_now, v_now, 1, v_now, NULL)
  ON CONFLICT (key) DO UPDATE
    SET last_seen = v_now,
        count = public.ops_alerts.count + 1,
        resolved_at = NULL;
END;
$function$;

COMMENT ON FUNCTION public.note_ops_alert(text) IS
  'RT-1/B2: Ops-Alert-Zähler erhöhen. Nur service_role.';

REVOKE ALL ON FUNCTION public.note_ops_alert(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.note_ops_alert(text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 8. delete_tenant_complete: PDF-Jobs vor Dokumenten
-- ---------------------------------------------------------------------------

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

    UPDATE public.registrations
      SET terms_document_id = NULL
      WHERE tenant_id = p_tenant_id;
    UPDATE public.payment_attempts
      SET terms_document_id = NULL
      WHERE tenant_id = p_tenant_id;
    UPDATE public.passes
      SET terms_document_id = NULL
      WHERE tenant_id = p_tenant_id;

    DELETE FROM public.studio_legal_pdf_jobs WHERE tenant_id = p_tenant_id;
    DELETE FROM public.studio_legal_documents WHERE tenant_id = p_tenant_id;

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
    DELETE FROM public.pass_withdrawal_lookups WHERE tenant_id = p_tenant_id;
    DELETE FROM public.pass_purchase_consents WHERE tenant_id = p_tenant_id;
    DELETE FROM public.pass_validity_changes WHERE tenant_id = p_tenant_id;
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
  TO service_role;

-- ---------------------------------------------------------------------------
-- 9. Selbstprüfung
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_def text;
  v_n integer;
BEGIN
  IF to_regclass('public.studio_legal_pdf_jobs') IS NULL THEN
    RAISE EXCEPTION 'RT-1: studio_legal_pdf_jobs fehlt';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'studio-legal') THEN
    RAISE EXCEPTION 'RT-1: Bucket studio-legal fehlt';
  END IF;

  SELECT count(*) INTO v_n FROM cron.job WHERE jobname = 'yogaflow_process_legal_pdf';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'RT-1: Cron yogaflow_process_legal_pdf count=%', v_n;
  END IF;

  IF has_table_privilege('authenticated', 'public.studio_legal_pdf_jobs', 'SELECT')
     OR has_table_privilege('anon', 'public.studio_legal_pdf_jobs', 'SELECT')
  THEN
    RAISE EXCEPTION 'RT-1: Client darf studio_legal_pdf_jobs lesen';
  END IF;

  IF has_function_privilege('authenticated', 'public.claim_studio_legal_pdf_jobs(integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.claim_studio_legal_pdf_jobs(integer)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'RT-1: claim_studio_legal_pdf_jobs für Client';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.publish_studio_legal_document(text,text,text,jsonb,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'RT-1: publish nicht für authenticated';
  END IF;

  v_def := pg_catalog.pg_get_functiondef(
    'public.delete_tenant_complete(uuid)'::regprocedure
  );
  IF position('studio_legal_pdf_jobs' IN v_def) = 0 THEN
    RAISE EXCEPTION 'RT-1: delete_tenant_complete ohne studio_legal_pdf_jobs';
  END IF;

  IF to_regprocedure('yogaflow_private.current_terms_document_id(uuid)') IS NULL THEN
    RAISE EXCEPTION 'RT-1: current_terms_document_id fehlt';
  END IF;
END;
$$;
