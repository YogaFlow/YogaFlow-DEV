-- UX-5 Korrektur: archived_at gehört nicht in RLS-SELECT.
-- RLS = Zugriffsschutz (Tenant/Rolle), nicht Anzeige.
-- Anzeige-Filter: visibleScope (Client), get_open_coverage / get_studio_payments (Listen-RPCs).
-- allow: (keine Function-Signatur geändert)
--
-- Stellt die vier Policies auf den Stand vor 20261004240000 wieder her.
-- get_open_coverage bleibt mit archived_at-Filter (Lese-Schicht, gesetzt in 240000).
--
-- Rückweg: Policies wieder mit AND archived_at IS NULL (wie 20261004240000) — nicht empfohlen.

DROP POLICY IF EXISTS "courses_select_own_tenant" ON public.courses;
CREATE POLICY "courses_select_own_tenant"
  ON public.courses FOR SELECT
  USING (tenant_id = yogaflow_private.get_my_tenant_id());

DROP POLICY IF EXISTS "users_select_managers" ON public.users;
CREATE POLICY "users_select_managers"
  ON public.users FOR SELECT
  USING (
    tenant_id = yogaflow_private.get_my_tenant_id()
    AND yogaflow_private.is_tenant_manager()
  );

DROP POLICY IF EXISTS "users_select_teacher_participants" ON public.users;
CREATE POLICY "users_select_teacher_participants"
  ON public.users FOR SELECT
  USING (
    tenant_id = yogaflow_private.get_my_tenant_id()
    AND yogaflow_private.is_teacher()
    AND role = 'user'::text
  );

DROP POLICY IF EXISTS "users_select_teacher_staff" ON public.users;
CREATE POLICY "users_select_teacher_staff"
  ON public.users FOR SELECT
  USING (
    tenant_id = yogaflow_private.get_my_tenant_id()
    AND yogaflow_private.is_teacher()
    AND role = ANY (ARRAY['teacher'::text, 'admin'::text, 'owner'::text])
  );

DO $$
DECLARE
  v_using text;
  v_pol text;
BEGIN
  FOREACH v_pol IN ARRAY ARRAY[
    'courses_select_own_tenant',
    'users_select_managers',
    'users_select_teacher_participants',
    'users_select_teacher_staff'
  ]
  LOOP
    SELECT pg_get_expr(pol.polqual, pol.polrelid) INTO v_using
    FROM pg_policy pol
    JOIN pg_class rel ON rel.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public' AND pol.polname = v_pol;
    IF v_using IS NULL THEN
      RAISE EXCEPTION 'UX-5: Policy % fehlt', v_pol;
    END IF;
    IF v_using LIKE '%archived_at%' THEN
      RAISE EXCEPTION 'UX-5: Policy % darf archived_at nicht filtern (Anzeige ≠ RLS)', v_pol;
    END IF;
  END LOOP;

  -- Listen-RPC behält Anzeige-Filter
  IF position('c.archived_at IS NULL' IN pg_get_functiondef('public.get_open_coverage()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'UX-5: get_open_coverage muss archived_at in der Lese-Schicht filtern';
  END IF;
END;
$$;
