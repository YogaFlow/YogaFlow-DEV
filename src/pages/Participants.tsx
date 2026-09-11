import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Course, Registration, User } from '../types';
import { isCourseManagerRole, isStudioAdmin, isTeacherOnly } from '../lib/userRoles';
import { Users, Mail, Phone, Search, Filter, Download, UserMinus } from 'lucide-react';
import FeedbackDialog, { FeedbackDialogState } from '../components/ui/FeedbackDialog';
import {
  formatDate,
  formatDateTime,
  formatTimeRange,
} from '../lib/format';
import ConfirmDialog, { ConfirmDialogState } from '../components/ui/ConfirmDialog';
import { isCourseUpcoming } from '../lib/courseDateTime';
import { runPastRegistrationCleanup } from '../lib/registrationMaintenance';
import { formatUserAddress } from '../lib/userAddress';
import { groupParticipantsByCourse } from '../lib/participantGrouping';

interface ParticipantWithDetails extends Registration {
  user: User;
  course: Course;
}

const courseGroupHeading = (course: Course, count: number) => {
  const countLabel = count === 1 ? '1 Anmeldung' : `${count} Anmeldungen`;
  return (
    <>
      <div className="text-[15px] font-medium text-text">{course.title}</div>
      <div className="text-[13px] text-textMuted tabular-nums">
        {formatDate(course.date)} · {formatTimeRange(course.time, course.end_time)} · {countLabel}
      </div>
    </>
  );
};

const Participants: React.FC = () => {
  const { courseId } = useParams<{ courseId?: string }>();
  const { userProfile } = useAuth();
  const [participants, setParticipants] = useState<ParticipantWithDetails[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [feedbackDialog, setFeedbackDialog] = useState<FeedbackDialogState | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [pendingUnregister, setPendingUnregister] = useState<ParticipantWithDetails | null>(null);
  const [unregisteringId, setUnregisteringId] = useState<string | null>(null);

  useEffect(() => {
    if (courseId) {
      setSelectedCourse(courseId);
    }
  }, [courseId]);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      if (!userProfile) return;

      try {
        await runPastRegistrationCleanup();
        const { data: coursesData, error: coursesError } = await supabase
          .from('courses')
          .select('*')
          .order('date', { ascending: true });

        if (coursesError) throw coursesError;
        const upcomingCourses = (coursesData || []).filter((course) => {
          if (!isCourseUpcoming(course)) return false;
          if (isTeacherOnly(userProfile)) {
            return course.teacher_id === userProfile.id;
          }
          return true;
        });
        if (!isMounted) return;
        setCourses(upcomingCourses);

        const { data: registrationsData, error: registrationsError } = await supabase
          .from('registrations')
          .select(`
            *,
            user:users(*),
            course:courses(*)
          `)
          .order('registered_at', { ascending: false });

        if (registrationsError) throw registrationsError;
        if (isMounted) {
          const upcomingParticipants = (registrationsData || []).filter(
            (registration: any) =>
              registration.course &&
              isCourseUpcoming(registration.course) &&
              registration.cancellation_timestamp == null &&
              (!isTeacherOnly(userProfile) || registration.course.teacher_id === userProfile.id)
          );
          setParticipants(upcomingParticipants);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [userProfile]);

  const isActiveRegistration = (participant: ParticipantWithDetails) =>
    participant.status === 'registered' && !participant.is_waitlist;

  const canUnregisterParticipant = (participant: ParticipantWithDetails): boolean => {
    if (!userProfile) return false;
    if (isStudioAdmin(userProfile)) return true;
    if (isTeacherOnly(userProfile)) {
      return (
        participant.course.teacher_id === userProfile.id &&
        isActiveRegistration(participant)
      );
    }
    return false;
  };

  const requestUnregister = (participant: ParticipantWithDetails) => {
    const name = `${participant.user.first_name} ${participant.user.last_name}`.trim();
    const courseTitle = participant.course.title;
    setPendingUnregister(participant);
    setConfirmDialog({
      title: 'Teilnehmer abmelden',
      message: `Möchten Sie ${name || 'diesen Teilnehmer'} wirklich vom Kurs „${courseTitle}" abmelden?`,
      confirmLabel: 'Abmelden',
      cancelLabel: 'Abbrechen',
      variant: 'danger',
    });
  };

  const cancelUnregister = () => {
    if (unregisteringId) return;
    setConfirmDialog(null);
    setPendingUnregister(null);
  };

  const executeUnregister = async () => {
    const participant = pendingUnregister;
    if (!participant) return;

    setUnregisteringId(participant.id);
    try {
      const { data, error } = await supabase.rpc('admin_unregister_user_from_course', {
        p_user_id: participant.user_id,
        p_course_id: participant.course_id,
      });

      if (error) throw error;

      type RpcResult = { success: boolean; error?: string; message?: string };
      const result = data as RpcResult;

      if (!result.success) {
        if (result.error === 'not_registered') {
          setFeedbackDialog({
            title: 'Hinweis',
            message: 'Für diesen Kurs liegt keine aktive Anmeldung vor.',
            type: 'info',
          });
        } else if (result.error === 'Teachers can only unregister active participants from their own courses') {
          setFeedbackDialog({
            title: 'Keine Berechtigung',
            message: 'Lehrer können nur aktive Teilnehmer bei eigenen Kursen abmelden.',
            type: 'error',
          });
        } else {
          throw new Error(result.error || 'Abmeldung fehlgeschlagen.');
        }
        return;
      }

      setParticipants(prev => prev.filter(p => p.id !== participant.id));
      setFeedbackDialog({
        title: 'Abgemeldet',
        message: result.message || 'Teilnehmer wurde erfolgreich abgemeldet.',
        type: 'success',
      });
    } catch (error) {
      console.error('Error unregistering participant:', error);
      const message =
        error instanceof Error
          ? error.message
          : (error as { message?: string })?.message ?? 'Fehler beim Abmelden. Bitte versuchen Sie es erneut.';
      setFeedbackDialog({
        title: 'Abmeldung fehlgeschlagen',
        message,
        type: 'error',
      });
    } finally {
      setUnregisteringId(null);
      setConfirmDialog(null);
      setPendingUnregister(null);
    }
  };

  const exportParticipants = () => {
    const escapeCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

    const rows = [
      ['Kurs', 'Datum', 'Teilnehmer', 'E-Mail', 'Telefon', 'Status', 'Anmeldedatum'],
      ...filteredParticipants.map(p => [
        p.course?.title || '',
        p.course?.date ? formatDate(p.course.date) : '',
        `${p.user?.first_name || ''} ${p.user?.last_name || ''}`.trim(),
        p.user?.email || '',
        p.user?.phone || '',
        p.status === 'registered'
          ? 'Angemeldet'
          : p.waitlist_position
            ? `Warteliste (Pos. ${p.waitlist_position})`
            : 'Warteliste',
        formatDateTime(p.registered_at)
      ])
    ];

    const csvContent = rows
      .map(row => row.map(escapeCell).join(';'))
      .join('\n');

    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `teilnehmer_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const filteredParticipants = participants.filter(participant => {
    if (!participant.user || !participant.course) return false;

    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      (participant.user.first_name || '').toLowerCase().includes(searchLower) ||
      (participant.user.last_name || '').toLowerCase().includes(searchLower) ||
      (participant.user.email || '').toLowerCase().includes(searchLower) ||
      (participant.course.title || '').toLowerCase().includes(searchLower);

    const matchesCourse = !selectedCourse || participant.course_id === selectedCourse;
    const matchesStatus = !selectedStatus || participant.status === selectedStatus;

    return matchesSearch && matchesCourse && matchesStatus;
  });

  const groupedParticipants = groupParticipantsByCourse(filteredParticipants);

  const showActionsColumn = filteredParticipants.some(canUnregisterParticipant);

  const hasPermission = isCourseManagerRole(userProfile);

  if (!hasPermission) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-medium text-text mb-2">Keine Berechtigung</h2>
        <p className="text-textMuted">Sie haben keine Berechtigung, diese Seite zu sehen.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand"></div>
      </div>
    );
  }

  const headingColSpan = showActionsColumn ? 5 : 4;

  return (
    <div className="space-y-6">
      <FeedbackDialog dialog={feedbackDialog} onClose={() => setFeedbackDialog(null)} />
      <ConfirmDialog
        dialog={confirmDialog}
        loading={!!unregisteringId}
        onConfirm={executeUnregister}
        onCancel={cancelUnregister}
      />
      {((userProfile && userProfile.role === 'teacher') || filteredParticipants.length > 0) && (
      <div className={`flex flex-col gap-4 sm:flex-row sm:items-center ${
        userProfile && userProfile.role === 'teacher' ? 'sm:justify-between' : 'sm:justify-end'
      }`}>
        {userProfile && userProfile.role === 'teacher' && (
          <p className="text-textMuted">
            Anmeldungen für Ihre kommenden Kurse
          </p>
        )}

        {filteredParticipants.length > 0 && (
          <button
            onClick={exportParticipants}
            className="self-start inline-flex items-center border border-border text-brand px-4 py-2 rounded-sm hover:bg-surfaceSunken transition-colors"
          >
            <Download className="w-4 h-4 mr-2" />
            CSV Export
          </button>
        )}
      </div>
      )}

      {/* Filters */}
      <div className="bg-surface rounded-md border border-border p-3.5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-textSubtle" />
            <input
              type="text"
              placeholder="Teilnehmer suchen..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-sm focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>
          
          <div className="relative">
            <Filter className="absolute left-3 top-3 h-4 w-4 text-textSubtle" />
            <select
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-sm focus:ring-2 focus:ring-brand focus:border-transparent appearance-none"
            >
              <option value="">Alle Kurse</option>
              {courses.map(course => (
                <option key={course.id} value={course.id}>
                  {course.title} – {formatDate(course.date)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-4 py-2 border border-border rounded-sm focus:ring-2 focus:ring-brand focus:border-transparent"
            >
              <option value="">Alle Status</option>
              <option value="registered">Angemeldet</option>
              <option value="waitlist">Warteliste</option>
            </select>
          </div>
        </div>
        <p className="mt-3 text-[13px] text-textMuted tabular-nums">
          {filteredParticipants.length} Teilnehmer
        </p>
      </div>

      {/* Participants List */}
      {filteredParticipants.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-16 h-16 text-textSubtle mx-auto mb-4" />
          <h3 className="text-lg font-medium text-text mb-2">Keine Teilnehmer gefunden</h3>
          <p className="text-textMuted">
            {searchTerm || selectedCourse || selectedStatus 
              ? 'Versuchen Sie andere Filterkriterien.' 
              : 'Es sind noch keine Teilnehmer angemeldet.'}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile: one block per course */}
          <div className="sm:hidden space-y-8">
            {groupedParticipants.map((group) => (
              <section key={group.courseId}>
                <div className="mb-2">
                  {courseGroupHeading(group.course, group.participants.length)}
                </div>
                <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
                  {group.participants.map((participant) => (
                    <div key={participant.id} className="px-3.5 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[15px] font-medium text-text">
                            {participant.user.first_name} {participant.user.last_name}
                          </div>
                          {formatUserAddress(participant.user) && (
                            <div className="text-[13px] text-textMuted mt-0.5 truncate">
                              {formatUserAddress(participant.user)}
                            </div>
                          )}
                        </div>
                        <span className={`flex-shrink-0 inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          participant.status === 'registered'
                            ? 'bg-sage-100 text-sage-800'
                            : 'bg-accentSoft text-accent'
                        }`}>
                          {participant.status === 'registered'
                            ? 'Angemeldet'
                            : participant.waitlist_position
                              ? `Warteliste ${participant.waitlist_position}`
                              : 'Warteliste'}
                        </span>
                      </div>

                      <div className="mt-2 space-y-1 text-[13px]">
                        <a href={`mailto:${participant.user.email}`} className="flex items-center gap-1.5 text-textMuted hover:text-brandPressed">
                          <Mail className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{participant.user.email}</span>
                        </a>
                        {participant.user.phone && (
                          <a href={`tel:${participant.user.phone}`} className="flex items-center gap-1.5 text-textMuted hover:text-brandPressed">
                            <Phone className="w-3 h-3 flex-shrink-0" />
                            {participant.user.phone}
                          </a>
                        )}
                      </div>

                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[13px] text-textSubtle tabular-nums">
                          {formatDateTime(participant.registered_at)}
                        </span>
                        {canUnregisterParticipant(participant) && (
                          <button
                            type="button"
                            onClick={() => requestUnregister(participant)}
                            disabled={unregisteringId === participant.id}
                            className="inline-flex min-h-11 items-center gap-1 text-[13px] font-medium text-danger hover:text-danger disabled:opacity-50"
                          >
                            {unregisteringId === participant.id ? (
                              <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-danger" />
                            ) : (
                              <UserMinus className="w-3 h-3" />
                            )}
                            Abmelden
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/* Desktop: one table, one tbody per course */}
          <div className="hidden sm:block bg-surface rounded-md border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-surfaceSunken">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-textMuted">
                      Teilnehmer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-textMuted">
                      Kontakt
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-textMuted">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-textMuted">
                      Angemeldet
                    </th>
                    {showActionsColumn && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-textMuted">
                        Aktionen
                      </th>
                    )}
                  </tr>
                </thead>
                {groupedParticipants.map((group) => (
                  <tbody key={group.courseId} className="bg-surface divide-y divide-border">
                    <tr>
                      <th
                        colSpan={headingColSpan}
                        scope="colgroup"
                        className="bg-surfaceSunken px-6 py-3 text-left font-normal"
                      >
                        {courseGroupHeading(group.course, group.participants.length)}
                      </th>
                    </tr>
                    {group.participants.map((participant) => (
                      <tr key={participant.id} className="hover:bg-surfaceSunken">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-text">
                              {participant.user.first_name} {participant.user.last_name}
                            </div>
                            {formatUserAddress(participant.user) && (
                              <div className="text-sm text-textMuted">
                                {formatUserAddress(participant.user)}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-text flex items-center">
                            <Mail className="w-3 h-3 mr-1" />
                            <a href={`mailto:${participant.user.email}`} className="hover:text-brandPressed">
                              {participant.user.email}
                            </a>
                          </div>
                          <div className="text-sm text-textMuted flex items-center mt-1">
                            <Phone className="w-3 h-3 mr-1" />
                            <a href={`tel:${participant.user.phone}`} className="hover:text-brandPressed">
                              {participant.user.phone}
                            </a>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            participant.status === 'registered'
                              ? 'bg-sage-100 text-sage-800'
                              : 'bg-accentSoft text-accent'
                          }`}>
                            {participant.status === 'registered'
                              ? 'Angemeldet'
                              : participant.waitlist_position
                                ? `Warteliste (Pos. ${participant.waitlist_position})`
                                : 'Warteliste'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-textMuted tabular-nums">
                          {formatDateTime(participant.registered_at)}
                        </td>
                        {showActionsColumn && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            {canUnregisterParticipant(participant) ? (
                              <button
                                type="button"
                                onClick={() => requestUnregister(participant)}
                                disabled={unregisteringId === participant.id}
                                className="inline-flex items-center gap-1.5 text-danger hover:text-danger disabled:opacity-50"
                              >
                                {unregisteringId === participant.id ? (
                                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-danger" />
                                ) : (
                                  <UserMinus className="w-4 h-4" />
                                )}
                                Abmelden
                              </button>
                            ) : (
                              <span className="text-textSubtle">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Participants;
