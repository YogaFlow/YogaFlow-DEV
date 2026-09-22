-- Contract-Schritt. Auf PROD erst einspielen, NACHDEM das Frontend mit
-- staff_names live ist.
--
-- Zweck: Policy users_select_participant_staff entfernen. Teilnehmende lesen
-- Staff-Namen nur noch über public.staff_names (20260922154500).
-- Glocke-Migration dazwischen: 20260922154530_waitlist_promoted_notification.
--
-- yogaflow_private.is_participant() wird danach von keiner Policy mehr
-- genutzt — nicht löschen (kann später woanders gebraucht werden).
--
-- Rückweg: Policy aus 20260519153000 wieder anlegen:
--
--   CREATE POLICY "users_select_participant_staff"
--     ON public.users FOR SELECT
--     TO authenticated
--     USING (
--       tenant_id = yogaflow_private.get_my_tenant_id()
--       AND yogaflow_private.is_participant()
--       AND role IN ('teacher', 'admin', 'owner')
--     );

DROP POLICY "users_select_participant_staff" ON public.users;

DO $$
DECLARE
  v_select_policies text[];
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'users'
      AND policyname = 'users_select_participant_staff'
  ) THEN
    RAISE EXCEPTION 'users_select_participant_staff existiert noch';
  END IF;

  SELECT array_agg(policyname ORDER BY policyname)
    INTO v_select_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'users'
    AND cmd = 'SELECT';

  IF v_select_policies IS DISTINCT FROM ARRAY[
    'users_select_managers',
    'users_select_own',
    'users_select_teacher_participants',
    'users_select_teacher_staff'
  ]::text[] THEN
    RAISE EXCEPTION 'unerwartete SELECT-Policies auf public.users: %', v_select_policies;
  END IF;
END $$;
