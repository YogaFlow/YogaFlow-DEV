import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FeedbackDialogState } from '../components/ui/FeedbackDialog';
import type { Course } from '../types';
import { isCourseUpcoming } from './courseDateTime';
import { fetchCourseParticipantCounts } from './courseParticipantCounts';
import { supabase } from './supabase';

export type CourseDeleteScope = 'single' | 'series';

type SeriesSession = {
  id: string;
  date: string;
  time: string;
  series_id: string | null;
};

const LOAD_ERROR: FeedbackDialogState = {
  title: 'Hinweis',
  message: 'Die Termine der Serie konnten nicht geladen werden. Bitte die Seite neu laden.',
  type: 'error',
};

const COUNTS_ERROR: FeedbackDialogState = {
  title: 'Hinweis',
  message:
    'Die Anmeldungen zu diesem Kurs konnten nicht geprüft werden. Bitte die Seite neu laden.',
  type: 'error',
};

const DELETE_ERROR: FeedbackDialogState = {
  title: 'Hinweis',
  message: 'Der Kurs konnte nicht gelöscht werden. Bitte die Seite neu laden.',
  type: 'error',
};

const REGISTRATIONS_BLOCK_DELETE: FeedbackDialogState = {
  title: 'Hinweis',
  message: 'Dieser Kurs hat noch Anmeldungen. Melde erst die Teilnehmenden ab.',
  type: 'error',
};

const personSum = (
  counts: Record<string, { registered: number; waitlist: number }>,
  id: string
) => (counts[id]?.registered ?? 0) + (counts[id]?.waitlist ?? 0);

export type BlockedSession = {
  date: string;
  time: string;
};

export function useCourseDeletion(course: Course | null) {
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [scope, setScope] = useState<CourseDeleteScope>('single');
  const [upcomingSessions, setUpcomingSessions] = useState<SeriesSession[]>([]);
  const [singlePersonCount, setSinglePersonCount] = useState(0);
  const [seriesPersonCount, setSeriesPersonCount] = useState(0);
  const [blockedSessions, setBlockedSessions] = useState<BlockedSession[]>([]);
  const [feedbackDialog, setFeedbackDialog] = useState<FeedbackDialogState | null>(null);
  const deletingRef = useRef(false);
  const preparingRef = useRef(false);

  const upcomingCount = upcomingSessions.length;
  const personCount = scope === 'series' && upcomingCount > 1 ? seriesPersonCount : singlePersonCount;

  const requestDelete = useCallback(async () => {
    if (!course || preparingRef.current || deletingRef.current) return;
    preparingRef.current = true;

    try {
      let sessions: SeriesSession[] = [
        {
          id: course.id,
          date: course.date,
          time: course.time,
          series_id: course.series_id ?? null,
        },
      ];

      if (course.series_id) {
        const { data, error } = await supabase
          .from('courses')
          .select('id, date, time, series_id')
          .eq('series_id', course.series_id);

        if (error) {
          setFeedbackDialog(LOAD_ERROR);
          return;
        }

        sessions = (data ?? []).map((row) => ({
          id: row.id,
          date: row.date,
          time: row.time,
          series_id: row.series_id ?? null,
        }));
      }

      const upcoming = sessions.filter((row) => isCourseUpcoming(row));
      if (isCourseUpcoming(course) && !upcoming.some((row) => row.id === course.id)) {
        upcoming.push({
          id: course.id,
          date: course.date,
          time: course.time,
          series_id: course.series_id ?? null,
        });
      }

      const countIds = upcoming.length > 0 ? upcoming.map((row) => row.id) : [course.id];
      const counts = await fetchCourseParticipantCounts(countIds);

      if (countIds.some((id) => !(id in counts))) {
        setFeedbackDialog(COUNTS_ERROR);
        return;
      }

      setUpcomingSessions(upcoming);
      setSinglePersonCount(personSum(counts, course.id));
      setSeriesPersonCount(upcoming.reduce((sum, row) => sum + personSum(counts, row.id), 0));
      setBlockedSessions(
        upcoming
          .filter((row) => personSum(counts, row.id) > 0)
          .map((row) => ({ date: row.date, time: row.time }))
          .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
      );
      setScope('single');
      setDialogOpen(true);
    } finally {
      preparingRef.current = false;
    }
  }, [course]);

  const confirmDelete = useCallback(async () => {
    if (!course || deletingRef.current) return;

    const deletingSeries = scope === 'series' && upcomingSessions.length > 1;
    const blocked = deletingSeries ? blockedSessions.length > 0 : singlePersonCount > 0;
    if (blocked) return;

    deletingRef.current = true;
    setDeleting(true);

    const ids =
      scope === 'series' && upcomingSessions.length > 1
        ? upcomingSessions.map((row) => row.id)
        : [course.id];

    try {
      const { data, error } = await supabase.from('courses').delete().in('id', ids).select('id');

      if (error) {
        setFeedbackDialog(error.code === '23503' ? REGISTRATIONS_BLOCK_DELETE : DELETE_ERROR);
        return;
      }

      if ((data?.length ?? 0) !== ids.length) {
        setFeedbackDialog(DELETE_ERROR);
        return;
      }

      setDialogOpen(false);
      setFeedbackDialog({
        title: ids.length === 1 ? 'Kurs gelöscht' : `${ids.length} Termine gelöscht`,
        message:
          ids.length === 1
            ? 'Der Termin wurde entfernt.'
            : 'Die kommenden Termine wurden entfernt.',
        type: 'success',
      });
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }, [blockedSessions, course, scope, singlePersonCount, upcomingSessions]);

  const cancelDelete = useCallback(() => {
    if (deletingRef.current) return;
    setDialogOpen(false);
  }, []);

  const closeFeedback = useCallback(() => {
    const succeeded = feedbackDialog?.type === 'success';
    setFeedbackDialog(null);
    if (succeeded) {
      navigate('/courses', { replace: true });
    }
  }, [feedbackDialog, navigate]);

  return {
    requestDelete,
    confirmDelete,
    cancelDelete,
    closeFeedback,
    dialogOpen,
    deleting,
    scope,
    setScope,
    upcomingCount,
    personCount,
    singleHasRegistrations: singlePersonCount > 0,
    blockedSessions,
    courseTitle: course?.title ?? '',
    feedbackDialog,
  };
}
