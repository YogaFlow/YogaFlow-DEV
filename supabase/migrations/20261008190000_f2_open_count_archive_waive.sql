-- F2: Sammel-Abhaken zählt nur nicht-archivierte offene Anmeldungen (wie get_open_coverage).
-- allow: preview_pre_omlify_waive,waive_pre_omlify_before

CREATE OR REPLACE FUNCTION public.preview_pre_omlify_waive(p_before date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tenant_id uuid;
  v_today date;
  v_cutoff timestamptz;
  v_count integer;
  v_course_count integer;
  v_first date;
  v_last date;
BEGIN
  IF NOT yogaflow_private.is_tenant_manager() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF p_before IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_DATE');
  END IF;

  v_today := (pg_catalog.now() AT TIME ZONE 'Europe/Berlin')::date;
  IF p_before > v_today THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'DATE_IN_FUTURE');
  END IF;

  v_cutoff := p_before::timestamp AT TIME ZONE 'Europe/Berlin';

  SELECT
    count(*)::integer,
    count(DISTINCT r.course_id)::integer,
    min(c.date),
    max(c.date)
  INTO v_count, v_course_count, v_first, v_last
  FROM public.registrations r
  JOIN public.courses c ON c.id = r.course_id
  JOIN public.users u ON u.id = r.user_id
  WHERE r.tenant_id = v_tenant_id
    AND r.status = 'registered'::public.registration_status
    AND r.coverage_status = 'open'::public.registration_coverage_status
    AND c.archived_at IS NULL
    AND u.archived_at IS NULL
    AND (c.date + COALESCE(c.time, TIME '00:00')) AT TIME ZONE 'Europe/Berlin' < v_cutoff
    AND (c.date + COALESCE(c.time, TIME '00:00')) AT TIME ZONE 'Europe/Berlin' < pg_catalog.now();

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'count', v_count,
    'course_count', v_course_count,
    'first_course_date', v_first,
    'last_course_date', v_last,
    'limit', 1000
  );
END;
$function$;

COMMENT ON FUNCTION public.preview_pre_omlify_waive(date) IS
  'F2: Vorschau Sammel-Erlass. Offene Anmeldungen vor Datum, ohne Archiv (wie get_open_coverage).';

CREATE OR REPLACE FUNCTION public.waive_pre_omlify_before(
  p_before date,
  p_expected_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid;
  v_tenant_id uuid;
  v_today date;
  v_cutoff timestamptz;
  v_count integer;
  v_batch_id uuid;
  v_id uuid;
  v_result jsonb;
  v_event_id uuid;
  v_ids uuid[];
BEGIN
  v_member_id := yogaflow_private.get_my_member_id();
  IF NOT yogaflow_private.is_tenant_manager() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_tenant_id IS NULL OR v_member_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF p_before IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_DATE');
  END IF;

  v_today := (pg_catalog.now() AT TIME ZONE 'Europe/Berlin')::date;
  IF p_before > v_today THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'DATE_IN_FUTURE');
  END IF;

  v_cutoff := p_before::timestamp AT TIME ZONE 'Europe/Berlin';

  SELECT coalesce(array_agg(locked.id ORDER BY locked.id), ARRAY[]::uuid[])
    INTO v_ids
  FROM (
    SELECT r.id
    FROM public.registrations r
    JOIN public.courses c ON c.id = r.course_id
    JOIN public.users u ON u.id = r.user_id
    WHERE r.tenant_id = v_tenant_id
      AND r.status = 'registered'::public.registration_status
      AND r.coverage_status = 'open'::public.registration_coverage_status
      AND c.archived_at IS NULL
      AND u.archived_at IS NULL
      AND (c.date + COALESCE(c.time, TIME '00:00')) AT TIME ZONE 'Europe/Berlin' < v_cutoff
      AND (c.date + COALESCE(c.time, TIME '00:00')) AT TIME ZONE 'Europe/Berlin' < pg_catalog.now()
    ORDER BY r.id
    FOR UPDATE OF r
  ) locked;

  v_count := coalesce(pg_catalog.array_length(v_ids, 1), 0);

  IF v_count IS DISTINCT FROM p_expected_count THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error', 'COUNT_CHANGED',
      'count', v_count
    );
  END IF;

  IF v_count = 0 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOTHING_TO_WAIVE');
  END IF;

  IF v_count > 1000 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'TOO_MANY', 'count', v_count);
  END IF;

  INSERT INTO public.coverage_waive_batches (
    tenant_id, before_date, waived_count, created_by
  ) VALUES (
    v_tenant_id, p_before, v_count, v_member_id
  )
  RETURNING id INTO v_batch_id;

  FOREACH v_id IN ARRAY v_ids
  LOOP
    v_result := yogaflow_private.waive_coverage_internal(
      v_id,
      v_member_id,
      'pre_omlify',
      NULL,
      v_batch_id
    );
    IF v_result->>'success' IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'A8 bulk waive failed for %: %', v_id, v_result->>'error';
    END IF;
  END LOOP;

  v_event_id := yogaflow_private.insert_event(
    v_tenant_id,
    'coverage.batch_waived',
    'coverage_waive_batch',
    v_batch_id,
    pg_catalog.jsonb_build_object(
      'batch_id', v_batch_id,
      'before_date', p_before,
      'count', v_count
    ),
    pg_catalog.gen_random_uuid()
  );

  PERFORM yogaflow_private.insert_audit(
    v_tenant_id,
    v_member_id,
    'coverage.batch_waived',
    'coverage_waive_batches',
    v_batch_id,
    ARRAY['before_date', 'waived_count']::text[],
    v_event_id
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'waived', v_count
  );
END;
$function$;

COMMENT ON FUNCTION public.waive_pre_omlify_before(date, integer) IS
  'F2: Sammel-Erlass vor Datum. Dieselbe Filtermenge wie preview (inkl. Archiv).';

DO $$
DECLARE
  v_def text;
BEGIN
  v_def := pg_catalog.pg_get_functiondef('public.preview_pre_omlify_waive(date)'::regprocedure);
  IF position('u.archived_at IS NULL' IN v_def) = 0 THEN
    RAISE EXCEPTION 'F2: preview_pre_omlify_waive ohne User-Archiv-Filter';
  END IF;
  IF position('c.archived_at IS NULL' IN v_def) = 0 THEN
    RAISE EXCEPTION 'F2: preview_pre_omlify_waive ohne Kurs-Archiv-Filter';
  END IF;

  v_def := pg_catalog.pg_get_functiondef('public.waive_pre_omlify_before(date,integer)'::regprocedure);
  IF position('u.archived_at IS NULL' IN v_def) = 0 THEN
    RAISE EXCEPTION 'F2: waive_pre_omlify_before ohne User-Archiv-Filter';
  END IF;
  IF position('waive_coverage_internal' IN v_def) = 0 THEN
    RAISE EXCEPTION 'F2: waive_pre_omlify_before ohne waive_coverage_internal';
  END IF;
END;
$$;
