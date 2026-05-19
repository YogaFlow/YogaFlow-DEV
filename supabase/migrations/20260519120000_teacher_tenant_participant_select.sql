-- Teachers: tenant-wide participant visibility (role=user only).
-- Replaces broad users_select_same_tenant with granular SELECT policies.

-- =============================================================================
-- 1. Helper: is_teacher()
-- =============================================================================
CREATE OR REPLACE FUNCTION yogaflow_private.is_teacher()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'teacher'
  );
$$;

REVOKE ALL ON FUNCTION yogaflow_private.is_teacher() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION yogaflow_private.is_teacher() TO authenticated;
GRANT EXECUTE ON FUNCTION yogaflow_private.is_teacher() TO postgres;

-- =============================================================================
-- 2. Replace users_select_same_tenant with granular policies
-- =============================================================================
DROP POLICY IF EXISTS "users_select_same_tenant" ON public.users;

CREATE POLICY "users_select_own"
  ON public.users FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "users_select_managers"
  ON public.users FOR SELECT
  TO authenticated
  USING (
    tenant_id = yogaflow_private.get_my_tenant_id()
    AND yogaflow_private.is_tenant_manager()
  );

CREATE POLICY "users_select_teacher_participants"
  ON public.users FOR SELECT
  TO authenticated
  USING (
    tenant_id = yogaflow_private.get_my_tenant_id()
    AND yogaflow_private.is_teacher()
    AND role = 'user'
  );

CREATE OR REPLACE FUNCTION yogaflow_private.is_participant()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'user'
  );
$$;

REVOKE ALL ON FUNCTION yogaflow_private.is_participant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION yogaflow_private.is_participant() TO authenticated;
GRANT EXECUTE ON FUNCTION yogaflow_private.is_participant() TO postgres;

CREATE POLICY "users_select_participant_staff"
  ON public.users FOR SELECT
  TO authenticated
  USING (
    tenant_id = yogaflow_private.get_my_tenant_id()
    AND yogaflow_private.is_participant()
    AND role IN ('teacher', 'admin', 'owner')
  );
