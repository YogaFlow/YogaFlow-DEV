import { useEffect, useState } from 'react';
import { listOnlinePassProducts } from './passProducts';
import { supabase } from './supabase';

/** Menüpunkt „Kurskarten“: Studio hat Online-Produkte oder Person besitzt eine Kurskarte. */
export function useMyPassesNav(enabled: boolean): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [{ count }, online] = await Promise.all([
          supabase
            .from('passes')
            .select('id', { count: 'exact', head: true }),
          listOnlinePassProducts(),
        ]);
        if (cancelled) return;
        setVisible((count ?? 0) > 0 || online.length > 0);
      } catch {
        if (!cancelled) setVisible(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return visible;
}
