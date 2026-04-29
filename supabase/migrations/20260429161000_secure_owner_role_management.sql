-- Secure Owner role management:
-- - only owners can assign owner
-- - at least one owner must remain in each tenant
-- - owner self-downgrade only if another owner exists

CREATE OR REPLACE FUNCTION public.count_tenant_owners(p_tenant_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COUNT(*)::integer
  FROM public.users
  WHERE tenant_id = p_tenant_id
    AND role = 'owner';
$$;

GRANT EXECUTE ON FUNCTION public.count_tenant_owners(uuid) TO authenticated;

DROP POLICY IF EXISTS "managers_update_tenant_users" ON public.users;
CREATE POLICY "managers_update_tenant_users"
  ON public.users FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id()
    AND public.is_tenant_manager()
    AND id != auth.uid()
  )
  WITH CHECK (
    tenant_id = public.get_my_tenant_id()
  );

CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role text;
  v_actor_tenant uuid;
  v_owner_count integer;
BEGIN
  IF OLD.role IS NOT DISTINCT FROM NEW.role THEN
    RETURN NEW;
  END IF;

  SELECT role, tenant_id
  INTO v_actor_role, v_actor_tenant
  FROM public.users
  WHERE id = auth.uid();

  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'ROLE_CHANGE_FORBIDDEN: actor profile missing';
  END IF;

  IF v_actor_tenant IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'ROLE_CHANGE_FORBIDDEN: cross-tenant role change is not allowed';
  END IF;

  -- Non-managers cannot change any role.
  IF v_actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'ROLE_CHANGE_FORBIDDEN: only owner or admin can change roles';
  END IF;

  -- Admins (or lower roles) may never grant owner.
  IF NEW.role = 'owner' AND v_actor_role <> 'owner' THEN
    RAISE EXCEPTION 'OWNER_ASSIGNMENT_FORBIDDEN: only existing owners can assign owner role';
  END IF;

  -- Any change that touches owner records requires owner privileges.
  IF (OLD.role = 'owner' OR NEW.role = 'owner') AND v_actor_role <> 'owner' THEN
    RAISE EXCEPTION 'OWNER_ROLE_CHANGE_FORBIDDEN: only owners can modify owner role assignments';
  END IF;

  -- When owner role is removed, ensure at least one owner remains in tenant.
  IF OLD.role = 'owner' AND NEW.role <> 'owner' THEN
    v_owner_count := public.count_tenant_owners(OLD.tenant_id);
    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'LAST_OWNER_REQUIRED: at least one owner must remain in this studio';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_last_owner_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_count integer;
BEGIN
  IF OLD.role = 'owner' THEN
    v_owner_count := public.count_tenant_owners(OLD.tenant_id);
    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'LAST_OWNER_REQUIRED: at least one owner must remain in this studio';
    END IF;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_last_owner_delete ON public.users;
CREATE TRIGGER prevent_last_owner_delete
  BEFORE DELETE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_last_owner_delete();
