import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Message, Course, User } from '../types';
import { MessageSquare, Send, Users } from 'lucide-react';
import { format } from 'date-fns';

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

  useEffect(() => {
    if (userProfile) {
      fetchCourses();
      fetchMessages();
    }
  }, [userProfile]);

  useEffect(() => {
    if (selectedCourse) {
      fetchParticipants(selectedCourse);
    }
  }, [selectedCourse]);

  const fetchCourses = async () => {
    try {
      let query = supabase.from('courses').select('*');

      if (isCourseLeader) {
        query = query.eq('teacher_id', userProfile?.id);
      } else {
        const { data: registrations } = await supabase
          .from('registrations')
          .select('course_id')
          .eq('user_id', userProfile?.id)
          .is('cancellation_timestamp', null);

        if (registrations && registrations.length > 0) {
          const courseIds = registrations.map(r => r.course_id);
          query = query.in('id', courseIds);
        }
      }

      const { data, error } = await query.order('date', { ascending: true });

      if (error) throw error;
      setCourses(data || []);
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
      const users = data?.map(r => r.user).filter(Boolean) as User[];
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
      alert('Nachricht erfolgreich gesendet');
    } catch (error: any) {
      console.error('Error sending message:', error);
      alert('Fehler beim Senden der Nachricht: ' + error.message);
    }
  };

  const getCourseLeaderForCourse = async (courseId: string): Promise<string> => {
    const course = courses.find(c => c.id === courseId);
    return course?.teacher_id || '';
  };

  const filteredMessages = selectedCourse
    ? messages.filter(m => m.course_id === selectedCourse)
    : messages;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="p-8">
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
                      <option value={courses.find(c => c.id === selectedCourse)?.teacher_id}>
                        Kursleiter
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

        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Nachrichtenverlauf</h2>
            <div className="space-y-4 max-h-[600px] overflow-y-auto">
              {filteredMessages.length === 0 ? (
                <p className="text-gray-500 text-center py-8">Noch keine Nachrichten</p>
              ) : (
                filteredMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`p-4 rounded-lg ${
                      message.sender_id === userProfile?.id
                        ? 'bg-gray-100 ml-8'
                        : 'bg-white border border-gray-200 mr-8'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-medium text-gray-900">
                          {message.sender_id === userProfile?.id
                            ? 'Sie'
                            : `${(message.sender as any)?.first_name} ${(message.sender as any)?.last_name}`}
                        </p>
                        <p className="text-xs text-gray-500">
                          {(message.course as any)?.title}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">
                          {format(new Date(message.created_at), 'dd.MM.yyyy HH:mm')}
                        </p>
                        {message.is_broadcast && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-600 mt-1">
                            <Users size={12} />
                            Rundnachricht
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-gray-700 whitespace-pre-wrap">{message.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
