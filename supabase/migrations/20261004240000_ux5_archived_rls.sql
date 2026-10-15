-- UX-5 Nachzug: archivierte Kurse/Mitglieder aus Client-SELECT (RLS).
-- Ausnahme: SECURITY-DEFINER-RPCs wie get_studio_payments (p_include_archived).
-- allow: get_open_coverage
--
-- Rückweg:
--   DROP POLICY IF EXISTS "courses_select_own_tenant" ON public.courses;
--   CREATE POLICY "courses_select_own_tenant" ON public.courses FOR SELECT
--     USING (tenant_id = yogaflow_private.get_my_tenant_id());
--   (users-Policies ohne archived_at-Klausel wiederherstellen)
--   get_open_coverage auf Stand 20260928160000 zurücksetzen

DROP POLICY IF EXISTS "courses_select_own_tenant" ON public.courses;
CREATE POLICY "courses_select_own_tenant"
  ON public.courses FOR SELECT
  USING (
    tenant_id = yogaflow_private.get_my_tenant_id()
    AND archived_at IS NULL
  );

DROP POLICY IF EXISTS "users_select_managers" ON public.users;
CREATE POLICY "users_select_managers"
  ON public.users FOR SELECT
  USING (
    tenant_id = yogaflow_private.get_my_tenant_id()
    AND yogaflow_private.is_tenant_manager()
    AND archived_at IS NULL
  );

DROP POLICY IF EXISTS "users_select_teacher_participants" ON public.users;
CREATE POLICY "users_select_teacher_participants"
  ON public.users FOR SELECT
  USING (
    tenant_id = yogaflow_private.get_my_tenant_id()
    AND yogaflow_private.is_teacher()
    AND role = 'user'::text
    AND archived_at IS NULL
  );

DROP POLICY IF EXISTS "users_select_teacher_staff" ON public.users;
CREATE POLICY "users_select_teacher_staff"
  ON public.users FOR SELECT
  USING (
    tenant_id = yogaflow_private.get_my_tenant_id()
    AND yogaflow_private.is_teacher()
    AND role = ANY (ARRAY['teacher'::text, 'admin'::text, 'owner'::text])
    AND archived_at IS NULL
  );

-- Eigenes Profil bleibt lesbar (auch wenn archiviert — Fail-closed Login-Kante).
-- users_select_own unverändert.

CREATE OR REPLACE FUNCTION public.get_open_coverage()
RETURNS TABLE (
  registration_id uuid,
  course_id uuid,
  course_title text,
  course_starts_at timestamptz,
  user_id uuid,
  display_name text,
  price_cents_at_booking integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF NOT yogaflow_private.is_tenant_manager() THEN
    RAISE EXCEPTION 'FORBIDDEN'
      USING ERRCODE = '42501';
  END IF;

  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    c.id,
    c.title,
    (c.date + COALESCE(c.time, TIME '00:00')) AT TIME ZONE 'Europe/Berlin',
    u.id,
    NULLIF(pg_catalog.btrim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''),
    r.price_cents_at_booking
  FROM public.registrations r
  JOIN public.courses c ON c.id = r.course_id
  JOIN public.users u ON u.id = r.user_id
  WHERE r.tenant_id = v_tenant_id
    AND r.status = 'registered'::public.registration_status
    AND r.coverage_status = 'open'::public.registration_coverage_status
    AND c.archived_at IS NULL
    AND u.archived_at IS NULL
    AND (c.date + COALESCE(c.time, TIME '00:00')) AT TIME ZONE 'Europe/Berlin' < pg_catalog.now()
  ORDER BY
    COALESCE(u.last_name, ''),
    COALESCE(u.first_name, ''),
    (c.date + COALESCE(c.time, TIME '00:00')) AT TIME ZONE 'Europe/Berlin'
  LIMIT 2000;
END;
$function$;

COMMENT ON FUNCTION public.get_open_coverage() IS
  'Offene Deckung vergangener Kurse. Nur Owner/Admin. Ohne archivierte Kurse/Personen.';

REVOKE ALL ON FUNCTION public.get_open_coverage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_open_coverage() TO authenticated;

DO $$
DECLARE
  v_using text;
BEGIN
  SELECT pg_get_expr(pol.polqual, pol.polrelid) INTO v_using
  FROM pg_policy pol
  JOIN pg_class rel ON rel.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  WHERE n.nspname = 'public' AND rel.relname = 'courses' AND pol.polname = 'courses_select_own_tenant';
  IF v_using IS NULL OR v_using NOT LIKE '%archived_at%' THEN
    RAISE EXCEPTION 'UX-5: courses_select_own_tenant filtert archived_at nicht';
  END IF;

  SELECT pg_get_expr(pol.polqual, pol.polrelid) INTO v_using
  FROM pg_policy pol
  JOIN pg_class rel ON rel.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  WHERE n.nspname = 'public' AND rel.relname = 'users' AND pol.polname = 'users_select_managers';
  IF v_using IS NULL OR v_using NOT LIKE '%archived_at%' THEN
    RAISE EXCEPTION 'UX-5: users_select_managers filtert archived_at nicht';
  END IF;

  IF position('c.archived_at IS NULL' IN pg_get_functiondef('public.get_open_coverage()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'UX-5: get_open_coverage ohne Kurs-Archiv-Filter';
  END IF;
END;
$$;
