-- 1) prevent_last_owner_delete: Nur blocken, wenn der letzte Owner gelöscht wird, obwohl noch ANDERE
--    Nutzer im Mandanten existieren. Wenn diese Zeile der einzige User des Tenants ist → erlauben
--    (z. B. letzter Schritt eines CASCADE beim Tenant-Löschen, oder Ein-Personen-Studio).
-- 2) delete_tenant_complete(uuid): Zuverlässiges Löschen eines gesamten Mandanten (DELETE tenants + CASCADE),
--    weil PostgreSQL die abhängigen users-Zeilen in beliebiger Reihenfolge löschen kann — ohne
--    Trigger-Pause kann der alte Trigger CASCADE abbrechen.

-- =============================================================================
-- Trigger: prevent_last_owner_delete (ersetzen)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.prevent_last_owner_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_count integer;
  v_user_count integer;
BEGIN
  IF OLD.role = 'owner' THEN
    v_owner_count := public.count_tenant_owners(OLD.tenant_id);
    IF v_owner_count <= 1 THEN
      SELECT COUNT(*)::integer
      INTO v_user_count
      FROM public.users
      WHERE tenant_id = OLD.tenant_id;

      -- Noch andere Profile im Mandanten (außer der Zeile, die gerade gelöscht wird)?
      IF v_user_count > 1 THEN
        RAISE EXCEPTION 'LAST_OWNER_REQUIRED: at least one owner must remain in this studio';
      END IF;
    END IF;
  END IF;

  RETURN OLD;
END;
$$;

-- =============================================================================
-- RPC: ganzen Tenant löschen (für SQL Editor / service_role)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.delete_tenant_complete(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND: Kein Tenant mit dieser ID.'
      USING ERRCODE = 'P0002';
  END IF;

  ALTER TABLE public.users DISABLE TRIGGER prevent_last_owner_delete;
  BEGIN
    DELETE FROM public.tenants WHERE id = p_tenant_id;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.users ENABLE TRIGGER prevent_last_owner_delete;
    RAISE;
  END;

  ALTER TABLE public.users ENABLE TRIGGER prevent_last_owner_delete;
END;
$$;

COMMENT ON FUNCTION public.delete_tenant_complete(uuid) IS
  'Löscht einen Mandanten inkl. CASCADE (users, courses, …). SQL Editor: SELECT public.delete_tenant_complete(''…''::uuid); auth.users ggf. separat im Dashboard; nur postgres/service_role.';

REVOKE ALL ON FUNCTION public.delete_tenant_complete(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tenant_complete(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.delete_tenant_complete(uuid) TO service_role;
