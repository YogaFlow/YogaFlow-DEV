import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { supabase } from './supabase';
import { countActivePassProducts } from './passProducts';
import { fetchReleasedUpdateIds } from './studioUpdateReleases';
import {
  countUnreadUpdates,
  markUpdatesRead,
  visibleUpdates,
  type StudioUpdateContext,
} from './studioUpdates';
import type { PaymentSetupStatus } from '../features/payments/paymentSetupTypes';

const REFRESH_EVENT = 'omlify:updates-read';

async function loadContext(
  studioName: string,
): Promise<StudioUpdateContext> {
  const [setupRes, passCount] = await Promise.all([
    supabase.rpc('get_payment_setup_status'),
    countActivePassProducts().catch(() => 0),
  ]);
  const setup = setupRes.data as PaymentSetupStatus | null;
  const onlinePaymentsActive =
    setup?.success === true &&
    setup.platform_enabled === true &&
    setup.online_payments_enabled === true;
  return {
    onlinePaymentsActive,
    hasPassProducts: passCount > 0,
    allowOnsitePayment: setup?.allow_onsite_payment === true,
    studioName,
  };
}

/**
 * Ungelesene Omlify-Neuigkeiten für Owner/Admin (localStorage), nur freigegebene.
 * Lehrer/Teilnehmende: immer 0. Ladefehler Freigaben → 0.
 */
export function useUnreadUpdates(enabled: boolean) {
  const { userProfile } = useAuth();
  const { tenant } = useTenant();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled || !userProfile?.id || !userProfile.tenant_id || !tenant?.name) {
      setUnread(0);
      return;
    }
    try {
      const [ctx, released] = await Promise.all([
        loadContext(tenant.name),
        fetchReleasedUpdateIds(),
      ]);
      if (released == null) {
        setUnread(0);
        return;
      }
      const visible = visibleUpdates(ctx, released);
      setUnread(countUnreadUpdates(userProfile.tenant_id, userProfile.id, visible));
    } catch {
      setUnread(0);
    }
  }, [enabled, userProfile?.id, userProfile?.tenant_id, tenant?.name]);

  useEffect(() => {
    void refresh();
    const onRead = () => {
      void refresh();
    };
    window.addEventListener(REFRESH_EVENT, onRead);
    return () => window.removeEventListener(REFRESH_EVENT, onRead);
  }, [refresh]);

  return { unreadUpdates: unread, refreshUnreadUpdates: refresh };
}

export function notifyUpdatesRead(
  tenantId: string,
  userId: string,
  visibleIds: string[],
): void {
  markUpdatesRead(tenantId, userId, visibleIds);
  window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
}

export { loadContext as loadStudioUpdateContext };
