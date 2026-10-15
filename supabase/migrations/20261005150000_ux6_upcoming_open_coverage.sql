-- UX-6 T4: Offene Deckung kommender Kurse („Kommt noch · zahlt vor Ort“).
-- allow: get_upcoming_open_coverage
-- Gleiche Rechte/Filter wie get_open_coverage, nur course_starts_at >= now().

CREATE OR REPLACE FUNCTION public.get_upcoming_open_coverage()
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
    AND (c.date + COALESCE(c.time, TIME '00:00')) AT TIME ZONE 'Europe/Berlin' >= pg_catalog.now()
  ORDER BY
    (c.date + COALESCE(c.time, TIME '00:00')) AT TIME ZONE 'Europe/Berlin',
    COALESCE(u.last_name, ''),
    COALESCE(u.first_name, '')
  LIMIT 2000;
END;
$function$;

COMMENT ON FUNCTION public.get_upcoming_open_coverage() IS
  'UX-6: Offene Deckung kommender Kurse. Nur Owner/Admin. Ohne Archiv/Abgemeldete.';

REVOKE ALL ON FUNCTION public.get_upcoming_open_coverage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_upcoming_open_coverage() TO authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.get_upcoming_open_coverage()') IS NULL THEN
    RAISE EXCEPTION 'UX-6: get_upcoming_open_coverage fehlt';
  END IF;
  IF position(
    '>= pg_catalog.now()' IN pg_get_functiondef('public.get_upcoming_open_coverage()'::regprocedure)
  ) = 0 THEN
    RAISE EXCEPTION 'UX-6: get_upcoming_open_coverage ohne Zukunfts-Filter';
  END IF;
  IF position(
    'c.archived_at IS NULL' IN pg_get_functiondef('public.get_upcoming_open_coverage()'::regprocedure)
  ) = 0 THEN
    RAISE EXCEPTION 'UX-6: get_upcoming_open_coverage ohne Kurs-Archiv-Filter';
  END IF;
END;
$$;
