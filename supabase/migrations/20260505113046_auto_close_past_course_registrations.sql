/*
  Automatically close active registrations for courses that already started.

  This ensures past courses no longer count as active registrations and do not
  show participants as currently active.
*/

CREATE OR REPLACE FUNCTION public.close_past_course_registrations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated_count integer := 0;
BEGIN
  UPDATE public.registrations r
  SET cancellation_timestamp = NOW()
  FROM public.courses c
  WHERE r.course_id = c.id
    AND r.cancellation_timestamp IS NULL
    AND r.status IN ('registered', 'waitlist')
    AND (
      c.date::timestamp
      + COALESCE(NULLIF(c.time, '')::time, TIME '00:00')
    ) < NOW();

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_past_course_registrations() TO authenticated;
