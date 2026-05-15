import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from '../context/AuthContext';
import type { UserNotification } from '../types';

const POLL_INTERVAL_MS = 30_000;
const NOTIFICATIONS_LIMIT = 20;
export const NOTIFICATIONS_READ_EVENT = 'yogaflow:notifications-read';

/**
 * Lädt Glocken-Benachrichtigungen für den eingeloggten User.
 * markAllAsRead: setzt read_at für alle ungelesenen Einträge (z. B. beim Öffnen des Popups).
 */
export function useNotifications() {
  const { userProfile } = useAuth();
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!userProfile?.id) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    try {
      const [listRes, countRes] = await Promise.all([
        supabase
          .from('user_notifications')
          .select('*')
          .eq('user_id', userProfile.id)
          .order('created_at', { ascending: false })
          .limit(NOTIFICATIONS_LIMIT),
        supabase
          .from('user_notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userProfile.id)
          .is('read_at', null),
      ]);

      if (listRes.error) throw listRes.error;
      if (countRes.error) throw countRes.error;

      setNotifications((listRes.data ?? []) as UserNotification[]);
      setUnreadCount(countRes.count ?? 0);
    } catch (e) {
      console.error('useNotifications: fetch failed', e);
    }
  }, [userProfile?.id]);

  const markAllAsRead = useCallback(async () => {
    if (!userProfile?.id) return;

    const now = new Date().toISOString();
    try {
      const { error } = await supabase
        .from('user_notifications')
        .update({ read_at: now })
        .eq('user_id', userProfile.id)
        .is('read_at', null);

      if (error) throw error;

      setUnreadCount(0);
      setNotifications((prev) =>
        prev.map((n) => (n.read_at ? n : { ...n, read_at: now }))
      );

      window.dispatchEvent(new CustomEvent(NOTIFICATIONS_READ_EVENT));
    } catch (e) {
      console.error('useNotifications: markAllAsRead failed', e);
    }
  }, [userProfile?.id]);

  useEffect(() => {
    if (!userProfile?.id) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    void refresh();

    const intervalId = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);

    const onRead = () => {
      setUnreadCount(0);
    };
    const onFocus = () => {
      void refresh();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };

    window.addEventListener(NOTIFICATIONS_READ_EVENT, onRead);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener(NOTIFICATIONS_READ_EVENT, onRead);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [userProfile?.id, refresh]);

  return { notifications, unreadCount, refresh, markAllAsRead };
}
