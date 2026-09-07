-- Teachers need to read other course leaders in the same tenant so that
-- course cards can show Kursleitung (not only on their own courses).
-- Participants already have users_select_participant_staff for this.

DROP POLICY IF EXISTS "users_select_teacher_staff" ON public.users;

CREATE POLICY "users_select_teacher_staff"
  ON public.users FOR SELECT
  TO authenticated
  USING (
    tenant_id = yogaflow_private.get_my_tenant_id()
    AND yogaflow_private.is_teacher()
    AND role IN ('teacher', 'admin', 'owner')
  );
