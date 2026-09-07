import { supabase } from './supabase';

export type CourseParticipantCounts = Record<string, { registered: number; waitlist: number }>;

/** Tenant-safe counts via SECURITY DEFINER RPC (not limited by participant RLS). */
export async function fetchCourseParticipantCounts(
  courseIds: string[]
): Promise<CourseParticipantCounts> {
  if (courseIds.length === 0) return {};

  const { data, error } = await supabase.rpc('get_course_participant_counts', {
    p_course_ids: courseIds,
  });

  if (error || !data) return {};

  const counts: CourseParticipantCounts = {};
  for (const row of data as {
    course_id: string;
    registered_count: number;
    waitlist_count: number;
  }[]) {
    counts[row.course_id] = {
      registered: row.registered_count,
      waitlist: row.waitlist_count,
    };
  }
  return counts;
}
