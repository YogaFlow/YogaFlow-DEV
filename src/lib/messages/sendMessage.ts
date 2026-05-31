import { supabase } from '../supabase';
import { Conversation } from './conversations';
import { Course, User } from '../../types';

export type SendMessagePayload = {
  tenantId: string | undefined;
  senderId: string;
  courseId: string;
  content: string;
  isBroadcast: boolean;
  recipientId?: string;
};

export async function sendMessage(payload: SendMessagePayload): Promise<{ error: Error | null }> {
  const trimmed = payload.content.trim();
  if (!payload.courseId || !trimmed) {
    return { error: new Error('Kurs und Nachricht sind erforderlich.') };
  }

  const messageData: Record<string, unknown> = {
    tenant_id: payload.tenantId,
    course_id: payload.courseId,
    sender_id: payload.senderId,
    content: trimmed,
    is_broadcast: payload.isBroadcast,
  };

  if (!payload.isBroadcast && payload.recipientId) {
    messageData.recipient_id = payload.recipientId;
  }

  const { error } = await supabase.from('messages').insert([messageData]);

  if (error) {
    return { error: new Error(error.message) };
  }

  return { error: null };
}

export type ThreadSendOptions = {
  isBroadcastMode?: boolean;
  directRecipientId?: string;
};

export function buildThreadSendPayload(
  conversation: Conversation,
  courses: Course[],
  currentUserId: string,
  isCourseLeader: boolean,
  content: string,
  options: ThreadSendOptions = {}
): SendMessagePayload | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  if (conversation.isBroadcast && conversation.courseId) {
    const course = courses.find((c) => c.id === conversation.courseId);
    const teacherId = course?.teacher_id;

    if (isCourseLeader) {
      const useBroadcast = options.isBroadcastMode !== false;
      if (useBroadcast) {
        return {
          tenantId: undefined,
          senderId: currentUserId,
          courseId: conversation.courseId,
          content: trimmed,
          isBroadcast: true,
        };
      }
      const recipientId = options.directRecipientId;
      if (!recipientId) return null;
      return {
        tenantId: undefined,
        senderId: currentUserId,
        courseId: conversation.courseId,
        content: trimmed,
        isBroadcast: false,
        recipientId,
      };
    }

    if (!teacherId) return null;
    return {
      tenantId: undefined,
      senderId: currentUserId,
      courseId: conversation.courseId,
      content: trimmed,
      isBroadcast: false,
      recipientId: teacherId,
    };
  }

  if (!conversation.otherUserId) return null;

  const latest = conversation.messages[conversation.messages.length - 1];
  const courseId = latest?.course_id;
  if (!courseId) return null;

  return {
    tenantId: undefined,
    senderId: currentUserId,
    courseId,
    content: trimmed,
    isBroadcast: false,
    recipientId: conversation.otherUserId,
  };
}

export function getConversationKeyAfterSend(
  payload: SendMessagePayload,
  currentUserId: string
): string {
  if (payload.isBroadcast) {
    return `broadcast:${payload.courseId}`;
  }
  if (!payload.recipientId) {
    return `broadcast:${payload.courseId}`;
  }
  const [a, b] = [currentUserId, payload.recipientId].sort();
  return `${a}:${b}`;
}
