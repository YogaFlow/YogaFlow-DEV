import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { Message, Course, User } from '../../types';
import { isCourseUpcoming } from '../courseDateTime';
import { isStudioAdmin, isTeacherOnly } from '../userRoles';
import { getMessagesLastSeen } from '../useUnreadMessages';
import { resolveStaffNames, withCourseTeachers } from '../staffNames';

const MESSAGE_SELECT = `
  *,
  course:course_id(title)
`;

type NamePair = { first_name: string; last_name: string };

async function resolveMessagePartyNames(
  messages: Message[],
  self: User | null
): Promise<Map<string, NamePair>> {
  const ids = new Set<string>();
  for (const message of messages) {
    if (message.sender_id) ids.add(message.sender_id);
    if (message.recipient_id) ids.add(message.recipient_id);
  }

  const map = new Map<string, NamePair>();
  if (self?.id) {
    map.set(self.id, { first_name: self.first_name, last_name: self.last_name });
    ids.delete(self.id);
  }

  const staff = await resolveStaffNames([...ids]);
  for (const [id, row] of staff) {
    map.set(id, { first_name: row.first_name, last_name: row.last_name });
    ids.delete(id);
  }

  // Kursleitung liest Teilnehmernamen weiter über RLS (users_select_teacher_participants).
  // Ein Batch, keine Einzelaufrufe; für Rolle user liefert RLS 0 Zeilen.
  if (ids.size > 0) {
    const { data, error } = await supabase
      .from('users')
      .select('id, first_name, last_name')
      .in('id', [...ids]);
    if (error) {
      console.error('resolveMessagePartyNames: users fallback failed', error);
    } else {
      for (const row of data ?? []) {
        map.set(row.id, { first_name: row.first_name, last_name: row.last_name });
      }
    }
  }

  return map;
}

function attachPartyNames(messages: Message[], names: Map<string, NamePair>): Message[] {
  return messages.map((message) => ({
    ...message,
    sender: message.sender_id ? names.get(message.sender_id) : undefined,
    recipient: message.recipient_id ? names.get(message.recipient_id) : undefined,
  })) as Message[];
}

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
        .select('*')
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
      const upcomingCourses = await withCourseTeachers(
        (data || []).filter((course) => isCourseUpcoming(course))
      );
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

      const names = await resolveMessagePartyNames(uniqueMessages, userProfile);
      setMessages(attachPartyNames(uniqueMessages, names));
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  }, [userProfile, getUserCourseIds]);

  const fetchParticipants = useCallback(async (courseId: string) => {
    try {
      const { data, error } = await supabase
        .from('registrations')
        .select('user:users!registrations_user_id_fkey(id, first_name, last_name, email)')
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
