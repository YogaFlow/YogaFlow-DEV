import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { Message, Course, User } from '../../types';
import { isCourseUpcoming } from '../courseDateTime';
import { isStudioAdmin, isTeacherOnly } from '../userRoles';
import { getMessagesLastSeen } from '../useUnreadMessages';

const MESSAGE_SELECT = `
  *,
  sender:sender_id(first_name, last_name),
  recipient:recipient_id(first_name, last_name),
  course:course_id(title)
`;

export function useMessagesData(userProfile: User | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [participants, setParticipants] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLastSeen, setMessagesLastSeen] = useState<string>(() =>
    userProfile?.id ? getMessagesLastSeen(userProfile.id) : ''
  );

  const getUserCourseIds = useCallback(async (): Promise<string[]> => {
    if (!userProfile?.id) return [];

    const { data } = await supabase
      .from('registrations')
      .select('course_id')
      .eq('user_id', userProfile.id)
      .is('cancellation_timestamp', null);

    return data?.map((r) => r.course_id) || [];
  }, [userProfile?.id]);

  const fetchCourses = useCallback(async () => {
    if (!userProfile) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      let query = supabase
        .from('courses')
        .select('*, teacher:users!courses_teacher_id_fkey(first_name, last_name)')
        .neq('status', 'canceled')
        .gte('date', today);

      if (isStudioAdmin(userProfile)) {
        if (userProfile.tenant_id) {
          query = query.eq('tenant_id', userProfile.tenant_id);
        }
      } else if (isTeacherOnly(userProfile)) {
        query = query.eq('teacher_id', userProfile.id);
      } else {
        const { data: registrations } = await supabase
          .from('registrations')
          .select('course_id')
          .eq('user_id', userProfile.id)
          .is('cancellation_timestamp', null);

        if (!registrations || registrations.length === 0) {
          setCourses([]);
          return;
        }

        const courseIds = registrations.map((r) => r.course_id);
        query = query.in('id', courseIds);
      }

      const { data, error } = await query.order('date', { ascending: true });

      if (error) throw error;
      const upcomingCourses = (data || []).filter((course) => isCourseUpcoming(course));
      setCourses(upcomingCourses);
    } catch (error) {
      console.error('Error fetching courses:', error);
    }
  }, [userProfile]);

  const fetchMessages = useCallback(async () => {
    if (!userProfile?.id) return;

    try {
      const userCourseIds = await getUserCourseIds();

      const { data: sentMessages } = await supabase
        .from('messages')
        .select(MESSAGE_SELECT)
        .eq('sender_id', userProfile.id);

      const { data: receivedMessages } = await supabase
        .from('messages')
        .select(MESSAGE_SELECT)
        .eq('recipient_id', userProfile.id);

      const { data: broadcastMessages } = await supabase
        .from('messages')
        .select(MESSAGE_SELECT)
        .eq('is_broadcast', true)
        .in('course_id', userCourseIds.length > 0 ? userCourseIds : ['']);

      const allMessages = [
        ...(sentMessages || []),
        ...(receivedMessages || []),
        ...(broadcastMessages || []),
      ];

      const uniqueMessages = Array.from(
        new Map(allMessages.map((msg) => [msg.id, msg])).values()
      ).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setMessages(uniqueMessages);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  }, [userProfile?.id, getUserCourseIds]);

  const fetchParticipants = useCallback(async (courseId: string) => {
    try {
      const { data, error } = await supabase
        .from('registrations')
        .select('user:user_id(id, first_name, last_name, email)')
        .eq('course_id', courseId)
        .is('cancellation_timestamp', null);

      if (error) throw error;
      const users = data?.map((r) => r.user).filter(Boolean) as unknown as User[];
      setParticipants(users || []);
    } catch (error) {
      console.error('Error fetching participants:', error);
    }
  }, []);

  useEffect(() => {
    if (userProfile?.id) {
      setMessagesLastSeen(getMessagesLastSeen(userProfile.id));
    }
  }, [userProfile?.id]);

  useEffect(() => {
    if (userProfile) {
      void fetchCourses();
      void fetchMessages();
    }
  }, [userProfile, fetchCourses, fetchMessages]);

  useEffect(() => {
    if (!userProfile?.id) return;

    const pollId = window.setInterval(() => {
      void fetchMessages();
    }, 30_000);

    const onFocus = () => {
      setMessagesLastSeen(getMessagesLastSeen(userProfile.id));
      void fetchMessages();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(pollId);
      window.removeEventListener('focus', onFocus);
    };
  }, [userProfile?.id, fetchMessages]);

  const refreshLastSeen = useCallback(() => {
    if (userProfile?.id) {
      setMessagesLastSeen(getMessagesLastSeen(userProfile.id));
    }
  }, [userProfile?.id]);

  return {
    messages,
    courses,
    participants,
    loading,
    messagesLastSeen,
    fetchCourses,
    fetchMessages,
    fetchParticipants,
    refreshLastSeen,
  };
}
