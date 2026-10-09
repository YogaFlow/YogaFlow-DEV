import { useEffect } from 'react';
import { supabase } from './supabase';
import { beginForcedSignOut, consumeVoluntarySignOut, isSessionAuthFailure } from './sessionGuard';

const CHECK_INTERVAL_MS = 60_000;

/**
 * Eine Stelle für „die Sitzung ist serverseitig weg“.
 * Eigenes Abmelden setzt vorher das Freiwillig-Flag und löst den Hinweis nicht aus.
 */
export function useSessionGuard(): void {
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      // Fehlgeschlagenes Token-Refresh ruft in dieser supabase-js-Version
      // _removeSession auf und feuert SIGNED_OUT. Freiwilliges Abmelden setzt
      // vorher das Flag, damit hier kein Hinweis entsteht.
      if (event !== 'SIGNED_OUT') return;
      if (consumeVoluntarySignOut()) return;
      beginForcedSignOut();
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let lastCheck = 0;
    let cancelled = false;

    const checkServerSession = () => {
      const now = Date.now();
      if (now - lastCheck < CHECK_INTERVAL_MS) return;
      lastCheck = now;
      void (async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled || !session) return;
        const { error } = await supabase.auth.getUser();
        if (cancelled || !error) return;
        if (isSessionAuthFailure(error)) beginForcedSignOut();
      })();
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') checkServerSession();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', checkServerSession);
    window.addEventListener('online', checkServerSession);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', checkServerSession);
      window.removeEventListener('online', checkServerSession);
    };
  }, []);
}
