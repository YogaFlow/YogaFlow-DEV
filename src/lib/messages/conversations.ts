import { Message, User, Course } from '../../types';
import { getConversationUnreadCount } from '../useUnreadMessages';

export type Conversation = {
  key: string;
  isBroadcast: boolean;
  courseId?: string;
  otherUserId?: string;
  displayName: string;
  messages: Message[];
  lastMessageAt: Date;
  preview: string;
  unreadCount: number;
};

export function getDirectConversationKey(userId1: string, userId2: string): string {
  return [userId1, userId2].sort().join(':');
}

export function getMessageConversationKey(message: Message, currentUserId: string): string | null {
  if (message.is_broadcast) {
    return `broadcast:${message.course_id}`;
  }
  const otherId =
    message.sender_id === currentUserId ? message.recipient_id : message.sender_id;
  if (!otherId) return null;
  return getDirectConversationKey(currentUserId, otherId);
}

export function getUserDisplayName(
  user: { first_name?: string; last_name?: string } | undefined
): string {
  if (!user) return 'Unbekannt';
  return `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Unbekannt';
}

export function parseBroadcastCourseId(conversationKey: string): string | null {
  if (!conversationKey.startsWith('broadcast:')) return null;
  return conversationKey.slice('broadcast:'.length) || null;
}

export function getOtherUserIdFromDirectKey(
  conversationKey: string,
  currentUserId: string
): string | null {
  const [id1, id2] = conversationKey.split(':');
  if (!id1 || !id2) return null;
  return id1 === currentUserId ? id2 : id1;
}

function messageBelongsToBroadcastThread(
  message: Message,
  courseId: string,
  teacherId: string | undefined
): boolean {
  if (message.course_id !== courseId) return false;
  if (message.is_broadcast) return true;
  if (!teacherId) return false;
  return message.sender_id === teacherId || message.recipient_id === teacherId;
}

function enrichBroadcastMessages(
  threadMessages: Message[],
  courseId: string,
  allMessages: Message[],
  courses: Course[]
): Message[] {
  const course = courses.find((c) => c.id === courseId);
  const teacherId = course?.teacher_id;
  const ids = new Set(threadMessages.map((m) => m.id));

  const extras = allMessages.filter(
    (m) => !ids.has(m.id) && messageBelongsToBroadcastThread(m, courseId, teacherId)
  );

  if (extras.length === 0) return threadMessages;

  return [...threadMessages, ...extras].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

export function buildConversations(
  messages: Message[],
  currentUserId: string,
  lastSeen: string,
  courses: Course[] = []
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
    const isBroadcast = key.startsWith('broadcast:');
    let sorted = [...threadMessages].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const courseId = isBroadcast ? parseBroadcastCourseId(key) ?? undefined : undefined;

    if (isBroadcast && courseId) {
      sorted = enrichBroadcastMessages(sorted, courseId, messages, courses);
    }

    const latest = sorted[sorted.length - 1];

    let displayName: string;
    let otherUserId: string | undefined;

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
      otherUserId = getOtherUserIdFromDirectKey(key, currentUserId) ?? undefined;
    }

    conversations.push({
      key,
      isBroadcast,
      courseId,
      otherUserId,
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

export function filterConversationsBySearch(
  conversations: Conversation[],
  searchTerm: string
): Conversation[] {
  const term = searchTerm.trim().toLowerCase();
  if (!term) return conversations;
  return conversations.filter((c) => c.displayName.toLowerCase().includes(term));
}
