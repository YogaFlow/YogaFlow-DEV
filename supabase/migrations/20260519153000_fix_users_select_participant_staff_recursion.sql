-- Inline EXISTS on public.users in users_select_participant_staff caused RLS recursion (REST 500)
-- when any authenticated user loaded their own profile (users_select_own OR branch evaluated).

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

DROP POLICY IF EXISTS "users_select_participant_staff" ON public.users;

CREATE POLICY "users_select_participant_staff"
  ON public.users FOR SELECT
  TO authenticated
  USING (
    tenant_id = yogaflow_private.get_my_tenant_id()
    AND yogaflow_private.is_participant()
    AND role IN ('teacher', 'admin', 'owner')
  );
