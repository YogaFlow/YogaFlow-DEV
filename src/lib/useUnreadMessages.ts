import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from '../context/AuthContext';

const POLL_INTERVAL_MS = 30_000;
const STORAGE_PREFIX = 'yogaflow:messages_last_seen:';
const MARK_SEEN_EVENT = 'yogaflow:messages-seen';

const storageKey = (userId: string) => `${STORAGE_PREFIX}${userId}`;

/**
 * Liest den "zuletzt gesehen"-Zeitstempel für die Messages-Seite aus dem LocalStorage.
 * Beim ersten Aufruf auf einem Browser wird der aktuelle Zeitpunkt als Baseline gesetzt,
 * damit alte Nachrichten nicht alle plötzlich als ungelesen markiert werden.
 */
const readLastSeen = (userId: string): string => {
  try {
    const v = localStorage.getItem(storageKey(userId));
    if (v) return v;
  } catch {
    // ignore
  }
  const now = new Date().toISOString();
  try {
    localStorage.setItem(storageKey(userId), now);
  } catch {
    // ignore
  }
  return now;
};

const writeLastSeen = (userId: string, iso: string) => {
  try {
    localStorage.setItem(storageKey(userId), iso);
  } catch {
    // ignore
  }
};

/**
 * Zählt ungelesene Nachrichten für den eingeloggten User:
 * - direkte Nachrichten an mich (recipient_id = me, kein Broadcast)
 * - Broadcasts in Kursen, in denen ich aktuell registriert bin
 * jeweils mit created_at > lastSeen.
 *
 * Refresh-Strategie: Initial-Fetch, Polling (30 s), Window-Focus,
 * und ein Cross-Komponenten-Event (`notifyMessagesSeen`) zum sofortigen Zurücksetzen.
 */
export function useUnreadMessages() {
  const { userProfile } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const lastSeenRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userProfile?.id) {
      setUnreadCount(0);
      return;
    }
    const userId = userProfile.id;
    const lastSeen = lastSeenRef.current ?? readLastSeen(userId);
    lastSeenRef.current = lastSeen;

    try {
      const direct = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', userId)
        .neq('sender_id', userId)
        .eq('is_broadcast', false)
        .gt('created_at', lastSeen);

      const { data: regs } = await supabase
        .from('registrations')
        .select('course_id')
        .eq('user_id', userId)
        .is('cancellation_timestamp', null);

      let broadcastCount = 0;
      const courseIds = (regs ?? []).map((r) => r.course_id);
      if (courseIds.length > 0) {
        const bc = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('is_broadcast', true)
          .in('course_id', courseIds)
          .neq('sender_id', userId)
          .gt('created_at', lastSeen);
        broadcastCount = bc.count ?? 0;
      }

      setUnreadCount((direct.count ?? 0) + broadcastCount);
    } catch (e) {
      console.error('useUnreadMessages: fetch failed', e);
    }
  }, [userProfile?.id]);

  const markAllAsRead = useCallback(() => {
    if (!userProfile?.id) return;
    const now = new Date().toISOString();
    writeLastSeen(userProfile.id, now);
    lastSeenRef.current = now;
    setUnreadCount(0);
  }, [userProfile?.id]);

  useEffect(() => {
    if (!userProfile?.id) {
      setUnreadCount(0);
      return;
    }
    lastSeenRef.current = readLastSeen(userProfile.id);
    void refresh();

    const intervalId = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);

    const onSeen = () => {
      if (!userProfile.id) return;
      lastSeenRef.current = readLastSeen(userProfile.id);
      setUnreadCount(0);
    };
    const onFocus = () => {
      void refresh();
    };

    window.addEventListener(MARK_SEEN_EVENT, onSeen);
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener(MARK_SEEN_EVENT, onSeen);
      window.removeEventListener('focus', onFocus);
    };
  }, [userProfile?.id, refresh]);

  return { unreadCount, refresh, markAllAsRead };
}

export const notifyMessagesSeen = () => {
  try {
    window.dispatchEvent(new CustomEvent(MARK_SEEN_EVENT));
  } catch {
    // ignore
  }
};
