/*
  # Add function to get course participant counts

  1. New Function
    - `get_course_participant_counts(course_ids uuid[])` returns participant counts for given courses
    - Uses SECURITY DEFINER to bypass RLS and count all registrations
    - Returns course_id, registered_count, and waitlist_count for each course

  2. Security
    - Function is accessible to authenticated users
    - Only returns counts, not personal data
*/

CREATE OR REPLACE FUNCTION public.get_course_participant_counts(p_course_ids uuid[])
RETURNS TABLE (
  course_id uuid,
  registered_count bigint,
  waitlist_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as course_id,
    COUNT(r.id) FILTER (
      WHERE r.status = 'registered' 
      AND r.is_waitlist = false 
      AND r.cancellation_timestamp IS NULL
    ) as registered_count,
    COUNT(r.id) FILTER (
      WHERE r.is_waitlist = true 
      AND r.cancellation_timestamp IS NULL
    ) as waitlist_count
  FROM courses c
  LEFT JOIN registrations r ON c.id = r.course_id
  WHERE c.id = ANY(p_course_ids)
  GROUP BY c.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_course_participant_counts(uuid[]) TO authenticated;
