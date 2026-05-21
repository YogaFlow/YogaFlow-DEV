import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Message, Course, User } from '../types';
import { ArrowLeft, MessageSquare, Send, Users } from 'lucide-react';
import { format } from 'date-fns';
import FeedbackDialog, { FeedbackDialogState } from '../components/ui/FeedbackDialog';
import { isCourseUpcoming } from '../lib/courseDateTime';
import {
  getConversationUnreadCount,
  getMessagesLastSeen,
  markConversationAsRead,
} from '../lib/useUnreadMessages';
import { isStudioAdmin, isTeacherOnly } from '../lib/userRoles';

type Conversation = {
  key: string;
  isBroadcast: boolean;
  displayName: string;
  messages: Message[];
  lastMessageAt: Date;
  preview: string;
  unreadCount: number;
};

function getDirectConversationKey(userId1: string, userId2: string): string {
  return [userId1, userId2].sort().join(':');
}

function getMessageConversationKey(message: Message, currentUserId: string): string | null {
  if (message.is_broadcast) {
    return `broadcast:${message.course_id}`;
  }
  const otherId =
    message.sender_id === currentUserId ? message.recipient_id : message.sender_id;
  if (!otherId) return null;
  return getDirectConversationKey(currentUserId, otherId);
}

function getUserDisplayName(user: { first_name?: string; last_name?: string } | undefined): string {
  if (!user) return 'Unbekannt';
  return `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Unbekannt';
}

function buildConversations(
  messages: Message[],
  currentUserId: string,
  lastSeen: string
): Conversation[] {
  const byKey = new Map<string, Message[]>();

  for (const message of messages) {
    const key = getMessageConversationKey(message, currentUserId);
    if (!key) continue;
    const list = byKey.get(key) ?? [];
    list.push(message);
    byKey.set(key, list);
  }

  const conversations: Conversation[] = [];

  for (const [key, threadMessages] of byKey) {
    const sorted = [...threadMessages].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const latest = sorted[sorted.length - 1];
    const isBroadcast = key.startsWith('broadcast:');

    let displayName: string;
    if (isBroadcast) {
      const courseTitle = (latest.course as { title?: string } | undefined)?.title ?? 'Kurs';
      const senderName = getUserDisplayName(latest.sender as User | undefined);
      displayName =
        latest.sender_id === currentUserId
          ? `Rundnachricht – ${courseTitle}`
          : `${senderName} – Rundnachricht (${courseTitle})`;
    } else {
      const sample = sorted.find((m) => !m.is_broadcast) ?? latest;
      const otherUser =
        sample.sender_id === currentUserId
          ? (sample.recipient as User | undefined)
          : (sample.sender as User | undefined);
      displayName = getUserDisplayName(otherUser);
    }

    conversations.push({
      key,
      isBroadcast,
      displayName,
      messages: sorted,
      lastMessageAt: new Date(latest.created_at),
      preview: latest.content,
      unreadCount: getConversationUnreadCount(sorted, currentUserId, lastSeen, isBroadcast),
    });
  }

  return conversations.sort(
    (a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime()
  );
}

export default function Messages() {
  const { userProfile, isCourseLeader } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [newMessage, setNewMessage] = useState('');
  const [isBroadcast, setIsBroadcast] = useState(false);
  const [recipientId, setRecipientId] = useState<string>('');
  const [participants, setParticipants] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackDialog, setFeedbackDialog] = useState<FeedbackDialogState | null>(null);
  const [activeConversationKey, setActiveConversationKey] = useState<string | null>(null);
  const [messagesLastSeen, setMessagesLastSeen] = useState<string>(() =>
    userProfile?.id ? getMessagesLastSeen(userProfile.id) : ''
  );
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollChatToBottom = useCallback(() => {
    const container = chatScrollRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
    chatEndRef.current?.scrollIntoView({ block: 'end' });
  }, []);

  useEffect(() => {
    if (userProfile?.id) {
      setMessagesLastSeen(getMessagesLastSeen(userProfile.id));
    }
  }, [userProfile?.id]);

  useEffect(() => {
    if (userProfile) {
      fetchCourses();
      fetchMessages();
    }
  }, [userProfile]);

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
  }, [userProfile?.id]);

  useEffect(() => {
    if (selectedCourse) {
      fetchParticipants(selectedCourse);
    }
  }, [selectedCourse]);

  const fetchCourses = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      let query = supabase
        .from('courses')
        .select('*, teacher:users!courses_teacher_id_fkey(first_name, last_name)')
        .neq('status', 'canceled')
        .gte('date', today);

      if (isStudioAdmin(userProfile)) {
        if (userProfile?.tenant_id) {
          query = query.eq('tenant_id', userProfile.tenant_id);
        }
      } else if (isTeacherOnly(userProfile)) {
        query = query.eq('teacher_id', userProfile?.id);
      } else {
        const { data: registrations } = await supabase
          .from('registrations')
          .select('course_id')
          .eq('user_id', userProfile?.id)
          .is('cancellation_timestamp', null);

        if (!registrations || registrations.length === 0) {
          setCourses([]);
          return;
        }

        const courseIds = registrations.map(r => r.course_id);
        query = query.in('id', courseIds);
      }

      const { data, error } = await query.order('date', { ascending: true });

      if (error) throw error;
      const upcomingCourses = (data || []).filter((course) => isCourseUpcoming(course));
      setCourses(upcomingCourses);
    } catch (error) {
      console.error('Error fetching courses:', error);
    }
  };

  const fetchMessages = async () => {
    try {
      if (!userProfile?.id) return;

      const userCourseIds = await getUserCourseIds();

      const { data: sentMessages } = await supabase
        .from('messages')
        .select(`
          *,
          sender:sender_id(first_name, last_name),
          recipient:recipient_id(first_name, last_name),
          course:course_id(title)
        `)
        .eq('sender_id', userProfile.id);

      const { data: receivedMessages } = await supabase
        .from('messages')
        .select(`
          *,
          sender:sender_id(first_name, last_name),
          recipient:recipient_id(first_name, last_name),
          course:course_id(title)
        `)
        .eq('recipient_id', userProfile.id);

      const { data: broadcastMessages } = await supabase
        .from('messages')
        .select(`
          *,
          sender:sender_id(first_name, last_name),
          recipient:recipient_id(first_name, last_name),
          course:course_id(title)
        `)
        .eq('is_broadcast', true)
        .in('course_id', userCourseIds.length > 0 ? userCourseIds : ['']);

      const allMessages = [
        ...(sentMessages || []),
        ...(receivedMessages || []),
        ...(broadcastMessages || [])
      ];

      const uniqueMessages = Array.from(
        new Map(allMessages.map(msg => [msg.id, msg])).values()
      ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setMessages(uniqueMessages);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const getUserCourseIds = async (): Promise<string[]> => {
    if (!userProfile?.id) return [];

    const { data } = await supabase
      .from('registrations')
      .select('course_id')
      .eq('user_id', userProfile.id)
      .is('cancellation_timestamp', null);

    return data?.map(r => r.course_id) || [];
  };

  const fetchParticipants = async (courseId: string) => {
    try {
      const { data, error } = await supabase
        .from('registrations')
        .select('user:user_id(id, first_name, last_name, email)')
        .eq('course_id', courseId)
        .is('cancellation_timestamp', null);

      if (error) throw error;
      const users = data?.map(r => r.user).filter(Boolean) as unknown as User[];
      setParticipants(users || []);
    } catch (error) {
      console.error('Error fetching participants:', error);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse || !newMessage.trim()) return;

    try {
      const messageData: any = {
        tenant_id: userProfile?.tenant_id,
        course_id: selectedCourse,
        sender_id: userProfile?.id,
        content: newMessage.trim(),
        is_broadcast: isBroadcast
      };

      if (!isBroadcast && recipientId) {
        messageData.recipient_id = recipientId;
      }

      const { error } = await supabase
        .from('messages')
        .insert([messageData]);

      if (error) throw error;

      setNewMessage('');
      setRecipientId('');
      setIsBroadcast(false);
      fetchMessages();
      setFeedbackDialog({
        title: 'Nachricht gesendet',
        message: 'Nachricht erfolgreich gesendet.',
        type: 'success',
      });
    } catch (error: any) {
      console.error('Error sending message:', error);
      setFeedbackDialog({
        title: 'Senden fehlgeschlagen',
        message: 'Fehler beim Senden der Nachricht: ' + error.message,
        type: 'error',
      });
    }
  };

  const conversations = useMemo(
    () =>
      userProfile?.id
        ? buildConversations(messages, userProfile.id, messagesLastSeen)
        : [],
    [messages, userProfile?.id, messagesLastSeen]
  );

  const handleOpenConversation = async (conversationKey: string) => {
    const conversation = conversations.find((c) => c.key === conversationKey);
    if (!conversation || !userProfile?.id) {
      setActiveConversationKey(conversationKey);
      return;
    }

    if (conversation.unreadCount > 0) {
      await markConversationAsRead(userProfile.id, conversationKey, conversation.messages);
      setMessagesLastSeen(getMessagesLastSeen(userProfile.id));
      await fetchMessages();
    }

    setActiveConversationKey(conversationKey);
    requestAnimationFrame(() => scrollChatToBottom());
  };

  const activeConversation = useMemo(
    () => conversations.find((c) => c.key === activeConversationKey) ?? null,
    [conversations, activeConversationKey]
  );

  const activeConversationMessageCount = activeConversation?.messages.length ?? 0;
  const activeConversationLastMessageId =
    activeConversation?.messages[activeConversationMessageCount - 1]?.id ?? null;

  useEffect(() => {
    if (!activeConversationKey) return;
    const frameId = requestAnimationFrame(() => {
      scrollChatToBottom();
    });
    return () => cancelAnimationFrame(frameId);
  }, [
    activeConversationKey,
    activeConversationMessageCount,
    activeConversationLastMessageId,
    scrollChatToBottom,
  ]);

  useEffect(() => {
    if (
      activeConversationKey &&
      !conversations.some((c) => c.key === activeConversationKey)
    ) {
      setActiveConversationKey(null);
    }
  }, [conversations, activeConversationKey]);

  const selectedCourseData = courses.find((c) => c.id === selectedCourse);
  const courseLeaderLabel = selectedCourseData?.teacher
    ? `Kursleiter – ${selectedCourseData.teacher.first_name} ${selectedCourseData.teacher.last_name}`.trim()
    : 'Kursleiter';

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <FeedbackDialog dialog={feedbackDialog} onClose={() => setFeedbackDialog(null)} />
      <div className="flex items-center gap-3 mb-6">
        <MessageSquare size={32} className="text-gray-900" />
        <h1 className="text-3xl font-bold text-gray-900">Nachrichten</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Neue Nachricht senden</h2>
            <form onSubmit={handleSendMessage} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kurs
                </label>
                <select
                  value={selectedCourse}
                  onChange={(e) => setSelectedCourse(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  required
                >
                  <option value="">Kurs auswählen</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title} - {format(new Date(course.date), 'dd.MM.yyyy')}
                    </option>
                  ))}
                </select>
              </div>

              {isCourseLeader && selectedCourse && (
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={isBroadcast}
                      onChange={(e) => {
                        setIsBroadcast(e.target.checked);
                        if (e.target.checked) setRecipientId('');
                      }}
                      className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                    />
                    An alle Teilnehmer senden
                  </label>
                </div>
              )}

              {!isBroadcast && selectedCourse && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Empfänger
                  </label>
                  <select
                    value={recipientId}
                    onChange={(e) => setRecipientId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    required={!isBroadcast}
                  >
                    <option value="">Empfänger auswählen</option>
                    {isCourseLeader ? (
                      participants.map((participant) => (
                        <option key={participant.id} value={participant.id}>
                          {participant.first_name} {participant.last_name}
                        </option>
                      ))
                    ) : (
                      <option value={selectedCourseData?.teacher_id ?? ''}>
                        {courseLeaderLabel}
                      </option>
                    )}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nachricht
                </label>
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
                  placeholder="Geben Sie hier Ihre Nachricht ein..."
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
              >
                <Send size={18} />
                Nachricht senden
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-2 lg:min-h-0">
          <div className="bg-white rounded-lg shadow p-6 flex flex-col min-h-[400px] lg:h-[calc(100vh-10rem)] lg:max-h-[720px]">
            {activeConversation ? (
              <>
                <div className="flex shrink-0 items-center gap-3 mb-4 pb-4 border-b border-gray-200">
                  <button
                    type="button"
                    onClick={() => setActiveConversationKey(null)}
                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-700 transition-colors"
                    aria-label="Zurück zur Konversationsliste"
                  >
                    <ArrowLeft size={20} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold text-gray-900 truncate">
                      {activeConversation.displayName}
                    </h2>
                    {activeConversation.isBroadcast && (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                        <Users size={12} />
                        Rundnachricht
                      </span>
                    )}
                  </div>
                </div>
                <div
                  ref={chatScrollRef}
                  className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain space-y-4 pr-1 -mr-1"
                  role="log"
                  aria-label="Chatverlauf"
                >
                  {activeConversation.messages.map((message) => {
                    const isOwnMessage = message.sender_id === userProfile?.id;
                    const senderLabel = isOwnMessage
                      ? 'Sie'
                      : getUserDisplayName(message.sender as User | undefined);

                    return (
                      <div
                        key={message.id}
                        className={`p-4 rounded-lg ${
                          isOwnMessage
                            ? 'bg-gray-100 ml-8'
                            : 'bg-white border border-gray-200 mr-8'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-1 gap-2">
                          <p className="text-xs font-medium text-gray-700 truncate">
                            {senderLabel}
                          </p>
                          <p className="text-xs text-gray-500 shrink-0">
                            {format(new Date(message.created_at), 'dd.MM.yyyy HH:mm')}
                          </p>
                        </div>
                        <p className="text-xs text-gray-500 truncate mb-2">
                          {(message.course as { title?: string } | undefined)?.title}
                        </p>
                        <p className="text-gray-700 whitespace-pre-wrap">{message.content}</p>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} aria-hidden className="h-px shrink-0" />
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-gray-900 mb-4 shrink-0">Nachrichtenverlauf</h2>
                <div className="space-y-2 flex-1 min-h-0 overflow-y-auto overscroll-y-contain">
                  {conversations.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">Noch keine Nachrichten</p>
                  ) : (
                    conversations.map((conversation) => (
                      <button
                        key={conversation.key}
                        type="button"
                        onClick={() => void handleOpenConversation(conversation.key)}
                        className="w-full text-left p-4 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex justify-between items-start gap-2 mb-1">
                          <p className="font-medium text-gray-900 truncate">
                            {conversation.displayName}
                          </p>
                          <div className="flex flex-col items-end shrink-0">
                            <p
                              className={`text-xs shrink-0 ${
                                conversation.unreadCount > 0
                                  ? 'text-emerald-600 font-medium'
                                  : 'text-gray-500'
                              }`}
                            >
                              {format(conversation.lastMessageAt, 'dd.MM.yyyy HH:mm')}
                            </p>
                            {conversation.unreadCount > 0 && (
                              <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 mt-1 text-xs font-semibold text-emerald-700 tabular-nums rounded-full border border-emerald-500 bg-emerald-50">
                                {conversation.unreadCount > 9
                                  ? '9+'
                                  : conversation.unreadCount}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {conversation.isBroadcast && (
                            <Users size={14} className="text-gray-500 shrink-0" />
                          )}
                          <p className="text-sm text-gray-600 truncate">{conversation.preview}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
