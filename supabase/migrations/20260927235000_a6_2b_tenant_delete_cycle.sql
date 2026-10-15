-- A6-2b — delete_tenant_complete mit eingelöster Karte (FK-Zyklus).
--
-- Zweck: registrations.pass_id → passes → payments → registrations bildet
-- einen Zyklus. A5 löscht passes vor payments vor registrations; sobald
-- pass_id gesetzt ist, scheitert DELETE FROM passes an
-- registrations_pass_id_fkey (ON DELETE RESTRICT).
--
-- Lösung: FK als DEFERRABLE INITIALLY IMMEDIATE neu anlegen (Alltag
-- unverändert — Prüfung sofort). In delete_tenant_complete zu Beginn
-- SET CONSTRAINTS … DEFERRED, Reihenfolge sonst wie A5.
--
-- Bezug: A6-2 Cleanup-Fehler; A5-Fassung von delete_tenant_complete.
--
-- Rückweg (vollständig, läuft nicht):
--
-- CREATE OR REPLACE FUNCTION public.delete_tenant_complete(p_tenant_id uuid)
-- RETURNS void
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
--     RAISE EXCEPTION 'TENANT_NOT_FOUND: Kein Tenant mit dieser ID.'
--       USING ERRCODE = 'P0002';
--   END IF;
--
--   ALTER TABLE public.users DISABLE TRIGGER prevent_last_owner_delete;
--   BEGIN
--     SET LOCAL yogaflow.allow_append_only_delete = 'on';
--     SET LOCAL yogaflow.allow_payment_delete = 'on';
--     SET LOCAL yogaflow.allow_pass_product_delete = 'on';
--     SET LOCAL yogaflow.allow_pass_delete = 'on';
--
--     DELETE FROM public.audit_log WHERE tenant_id = p_tenant_id;
--     DELETE FROM public.events WHERE tenant_id = p_tenant_id;
--     DELETE FROM public.user_notifications WHERE tenant_id = p_tenant_id;
--     DELETE FROM public.messages WHERE tenant_id = p_tenant_id;
--     DELETE FROM public.pass_movements WHERE tenant_id = p_tenant_id;
--     DELETE FROM public.passes WHERE tenant_id = p_tenant_id;
--     DELETE FROM public.payments
--       WHERE tenant_id = p_tenant_id
--         AND reverses_payment_id IS NOT NULL;
--     DELETE FROM public.payments WHERE tenant_id = p_tenant_id;
--     DELETE FROM public.registrations WHERE tenant_id = p_tenant_id;
--     DELETE FROM public.courses WHERE tenant_id = p_tenant_id;
--     DELETE FROM public.pass_products WHERE tenant_id = p_tenant_id;
--     DELETE FROM public.users WHERE tenant_id = p_tenant_id;
--     DELETE FROM public.tenants WHERE id = p_tenant_id;
--   EXCEPTION WHEN OTHERS THEN
--     ALTER TABLE public.users ENABLE TRIGGER prevent_last_owner_delete;
--     RAISE;
--   END;
--
--   ALTER TABLE public.users ENABLE TRIGGER prevent_last_owner_delete;
-- END;
-- $function$;
--
-- COMMENT ON FUNCTION public.delete_tenant_complete(uuid) IS
--   'Löscht einen Mandanten: audit_log, events, user_notifications, messages, pass_movements (allow_append_only_delete), passes (allow_pass_delete), payments (Gegenzeilen zuerst, allow_payment_delete), registrations, courses, pass_products (allow_pass_product_delete), users, tenants. prevent_last_owner_delete pausiert. auth.users separat. Nur postgres/service_role.';
--
-- ALTER TABLE public.registrations
--   DROP CONSTRAINT IF EXISTS registrations_pass_id_fkey;
-- ALTER TABLE public.registrations
--   ADD CONSTRAINT registrations_pass_id_fkey
--   FOREIGN KEY (pass_id) REFERENCES public.passes (id) ON DELETE RESTRICT;
--   -- (nicht DEFERRABLE — Zustand vor A6-2b)

-- ---------------------------------------------------------------------------
-- 1. FK deferrable
-- ---------------------------------------------------------------------------

ALTER TABLE public.registrations
  DROP CONSTRAINT IF EXISTS registrations_pass_id_fkey;

ALTER TABLE public.registrations
  ADD CONSTRAINT registrations_pass_id_fkey
  FOREIGN KEY (pass_id) REFERENCES public.passes (id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY IMMEDIATE;

COMMENT ON CONSTRAINT registrations_pass_id_fkey ON public.registrations IS
  'A6-2b: DEFERRABLE für delete_tenant_complete; INITIALLY IMMEDIATE = Alltag wie RESTRICT.';

-- ---------------------------------------------------------------------------
-- 2. delete_tenant_complete (Basis A5 + SET CONSTRAINTS)
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
    -- A6-2b: Zyklus registrations.pass_id → passes → payments → registrations
    SET CONSTRAINTS public.registrations_pass_id_fkey DEFERRED;

    DELETE FROM public.audit_log WHERE tenant_id = p_tenant_id;
    DELETE FROM public.events WHERE tenant_id = p_tenant_id;
    DELETE FROM public.user_notifications WHERE tenant_id = p_tenant_id;
    DELETE FROM public.messages WHERE tenant_id = p_tenant_id;
    DELETE FROM public.pass_movements WHERE tenant_id = p_tenant_id;
    DELETE FROM public.passes WHERE tenant_id = p_tenant_id;
    DELETE FROM public.payments
      WHERE tenant_id = p_tenant_id
        AND reverses_payment_id IS NOT NULL;
    DELETE FROM public.payments WHERE tenant_id = p_tenant_id;
    DELETE FROM public.registrations WHERE tenant_id = p_tenant_id;
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

COMMENT ON FUNCTION public.delete_tenant_complete(uuid) IS
  'Löscht einen Mandanten: audit_log, events, user_notifications, messages, pass_movements, passes, payments, registrations, courses, pass_products, users, tenants. A6-2b: SET CONSTRAINTS registrations_pass_id_fkey DEFERRED wegen Zyklus pass_id. auth.users separat. Nur postgres/service_role.';

REVOKE ALL ON FUNCTION public.delete_tenant_complete(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tenant_complete(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.delete_tenant_complete(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Selbstprüfung (nur Katalog)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_deferrable boolean;
  v_deferred boolean;
  v_def text;
BEGIN
  SELECT c.condeferrable, c.condeferred
    INTO v_deferrable, v_deferred
  FROM pg_constraint c
  JOIN pg_class r ON r.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = r.relnamespace
  WHERE n.nspname = 'public'
    AND r.relname = 'registrations'
    AND c.conname = 'registrations_pass_id_fkey'
    AND c.contype = 'f';

  IF v_deferrable IS NOT TRUE THEN
    RAISE EXCEPTION 'A6-2b: registrations_pass_id_fkey ist nicht DEFERRABLE';
  END IF;

  IF v_deferred IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'A6-2b: registrations_pass_id_fkey muss INITIALLY IMMEDIATE sein';
  END IF;

  SELECT pg_get_functiondef('public.delete_tenant_complete(uuid)'::regprocedure)
    INTO v_def;

  IF position('SET CONSTRAINTS public.registrations_pass_id_fkey DEFERRED' in v_def) = 0 THEN
    RAISE EXCEPTION 'A6-2b: delete_tenant_complete enthält SET CONSTRAINTS nicht';
  END IF;

  IF position('DELETE FROM public.passes' in v_def) = 0
     OR position('DELETE FROM public.registrations' in v_def) = 0
  THEN
    RAISE EXCEPTION 'A6-2b: delete_tenant_complete Reihenfolge passes/registrations fehlt';
  END IF;
END;
$$;
