-- RT-2 — Omlify AGB/Datenschutz v2: Seed terms/privacy, Nachweise überleben
-- Studio-Löschung, retention_cleanup (ops_alerts / email_deliveries /
-- provider_events_raw / verwaiste legal_acceptances).
-- allow: delete_tenant_complete,retention_cleanup,invoke_retention_cleanup
--
-- Hashes (normalizeLegalMarkdown, strip Hinweise):
--   terms:   4b9d13096b488d3d92142e58b041a2727ffc163c77449eff4912d23f6dc55f96
--   privacy: 17cdc32a2d38d6871050a29354857c8e5d24a8e1cc80013e2f6012b57f2f352d

-- ---------------------------------------------------------------------------
-- 1. legal_document_versions: terms + privacy (AGB / Datenschutz v2)
-- ---------------------------------------------------------------------------

INSERT INTO public.legal_document_versions (document, version, content_hash)
VALUES
  (
    'terms',
    '2026-10-08',
    '4b9d13096b488d3d92142e58b041a2727ffc163c77449eff4912d23f6dc55f96'
  ),
  (
    'privacy',
    '2026-10-08',
    '17cdc32a2d38d6871050a29354857c8e5d24a8e1cc80013e2f6012b57f2f352d'
  )
ON CONFLICT (document) DO UPDATE
  SET version = EXCLUDED.version,
      content_hash = EXCLUDED.content_hash,
      updated_at = pg_catalog.now();

-- ---------------------------------------------------------------------------
-- 2. legal_acceptances: Schnappschuss + FK ON DELETE SET NULL
-- ---------------------------------------------------------------------------

ALTER TABLE public.legal_acceptances
  ADD COLUMN IF NOT EXISTS tenant_name_snapshot text;

COMMENT ON COLUMN public.legal_acceptances.tenant_name_snapshot IS
  'RT-2: Studio-Name beim Löschen; Nachweise überleben delete_tenant_complete 3 Jahre.';

ALTER TABLE public.legal_acceptances
  ALTER COLUMN tenant_id DROP NOT NULL;

ALTER TABLE public.legal_acceptances
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.legal_acceptances
  DROP CONSTRAINT IF EXISTS legal_acceptances_tenant_id_fkey;

ALTER TABLE public.legal_acceptances
  ADD CONSTRAINT legal_acceptances_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants (id)
  ON DELETE SET NULL;

ALTER TABLE public.legal_acceptances
  DROP CONSTRAINT IF EXISTS legal_acceptances_user_id_fkey;

ALTER TABLE public.legal_acceptances
  ADD CONSTRAINT legal_acceptances_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users (id)
  ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 3. delete_tenant_complete: Nachweise behalten (Schnappschuss), nicht löschen
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_tenant_complete(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tenant_name text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND: Kein Tenant mit dieser ID.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT t.name INTO v_tenant_name
  FROM public.tenants t
  WHERE t.id = p_tenant_id;

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

    -- Nachweise: Schnappschuss, dann FK SET NULL beim User-/Tenant-Löschen
    UPDATE public.legal_acceptances
      SET tenant_name_snapshot = COALESCE(tenant_name_snapshot, v_tenant_name),
          user_id = NULL
      WHERE tenant_id = p_tenant_id;

    DELETE FROM public.studio_legal_pdf_jobs WHERE tenant_id = p_tenant_id;
    DELETE FROM public.studio_legal_documents WHERE tenant_id = p_tenant_id;

    DELETE FROM public.ledger_event_log WHERE tenant_id = p_tenant_id;
    DELETE FROM public.ledger_entries WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenant_tax_settings WHERE tenant_id = p_tenant_id;
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

COMMENT ON FUNCTION public.delete_tenant_complete(uuid) IS
  'Löscht einen Mandanten vollständig. legal_acceptances bleiben mit Studio-Namen-Schnappschuss (RT-2, 3 Jahre via retention_cleanup). Nur service_role.';

-- ---------------------------------------------------------------------------
-- 4. retention_cleanup (täglich)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.retention_cleanup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_ops integer := 0;
  v_mail integer := 0;
  v_events integer := 0;
  v_legal integer := 0;
BEGIN
  SET LOCAL yogaflow.allow_append_only_delete = 'on';
  SET LOCAL yogaflow.allow_payment_delete = 'on';
  SET LOCAL yogaflow.allow_email_delivery_delete = 'on';

  DELETE FROM public.ops_alerts a
  WHERE a.resolved_at IS NOT NULL
    AND a.resolved_at < pg_catalog.now() - interval '90 days';
  GET DIAGNOSTICS v_ops = ROW_COUNT;

  DELETE FROM public.email_deliveries e
  WHERE e.created_at < pg_catalog.now() - interval '12 months';
  GET DIAGNOSTICS v_mail = ROW_COUNT;

  DELETE FROM public.provider_events_raw e
  WHERE e.received_at < pg_catalog.now() - interval '13 months'
    AND (e.processed_at IS NOT NULL OR e.reviewed_at IS NOT NULL);
  GET DIAGNOSTICS v_events = ROW_COUNT;

  DELETE FROM public.legal_acceptances a
  WHERE a.tenant_id IS NULL
    AND a.accepted_at < pg_catalog.now() - interval '3 years';
  GET DIAGNOSTICS v_legal = ROW_COUNT;

  RAISE LOG 'retention_cleanup ops_alerts=% email_deliveries=% provider_events_raw=% legal_acceptances=%',
    v_ops, v_mail, v_events, v_legal;

  RETURN pg_catalog.jsonb_build_object(
    'ops_alerts', v_ops,
    'email_deliveries', v_mail,
    'provider_events_raw', v_events,
    'legal_acceptances', v_legal
  );
END;
$function$;

COMMENT ON FUNCTION public.retention_cleanup() IS
  'RT-2: Aufbewahrung — ops_alerts 90d nach resolved, email_deliveries 12m, provider_events_raw 13m (processed/reviewed), verwaiste legal_acceptances 3y. Nur service_role.';

REVOKE ALL ON FUNCTION public.retention_cleanup()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retention_cleanup()
  TO service_role;

CREATE OR REPLACE FUNCTION yogaflow_private.invoke_retention_cleanup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM public.retention_cleanup();
END;
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.invoke_retention_cleanup()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION yogaflow_private.invoke_retention_cleanup()
  TO postgres;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT jobid FROM cron.job WHERE jobname = 'yogaflow_retention_cleanup'
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
  PERFORM cron.schedule(
    'yogaflow_retention_cleanup',
    '15 3 * * *',
    $cron$SELECT yogaflow_private.invoke_retention_cleanup();$cron$
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Selbstprüfung
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_terms text;
  v_priv text;
  v_def text;
  v_n integer;
BEGIN
  SELECT content_hash INTO v_terms
  FROM public.legal_document_versions WHERE document = 'terms';
  IF v_terms IS DISTINCT FROM
    '4b9d13096b488d3d92142e58b041a2727ffc163c77449eff4912d23f6dc55f96'
  THEN
    RAISE EXCEPTION 'RT-2: terms hash=%', v_terms;
  END IF;

  SELECT content_hash INTO v_priv
  FROM public.legal_document_versions WHERE document = 'privacy';
  IF v_priv IS DISTINCT FROM
    '17cdc32a2d38d6871050a29354857c8e5d24a8e1cc80013e2f6012b57f2f352d'
  THEN
    RAISE EXCEPTION 'RT-2: privacy hash=%', v_priv;
  END IF;

  v_def := pg_catalog.pg_get_functiondef(
    'public.delete_tenant_complete(uuid)'::regprocedure
  );
  IF position('tenant_name_snapshot' IN v_def) = 0 THEN
    RAISE EXCEPTION 'RT-2: delete_tenant_complete ohne tenant_name_snapshot';
  END IF;
  IF position('DELETE FROM public.legal_acceptances' IN v_def) > 0 THEN
    RAISE EXCEPTION 'RT-2: delete_tenant_complete löscht legal_acceptances noch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'legal_acceptances'
      AND column_name = 'tenant_name_snapshot'
  ) THEN
    RAISE EXCEPTION 'RT-2: Spalte tenant_name_snapshot fehlt';
  END IF;

  SELECT COUNT(*)::integer INTO v_n
  FROM cron.job WHERE jobname = 'yogaflow_retention_cleanup';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'RT-2: Cron yogaflow_retention_cleanup count=%', v_n;
  END IF;

  IF has_function_privilege('anon', 'public.retention_cleanup()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.retention_cleanup()', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'RT-2: retention_cleanup darf nicht für anon/authenticated';
  END IF;
END;
$$;
