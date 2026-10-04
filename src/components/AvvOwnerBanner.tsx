import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AVV_ATTENTION } from '../lib/legalVersions';
import { acceptAvv, loadAvvStatus } from '../lib/legalAcceptances';

/** V4: nicht blockierend — Banner für Owner ohne aktuelle AVV. */
export default function AvvOwnerBanner() {
  const { userProfile } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    let active = true;
    if (userProfile?.role !== 'owner') {
      setShow(false);
      return;
    }
    void (async () => {
      try {
        if (sessionStorage.getItem('yogaflow_pending_avv_accept') === '1') {
          const res = await acceptAvv();
          if (res.ok) sessionStorage.removeItem('yogaflow_pending_avv_accept');
        }
      } catch {
        /* ignore */
      }
      const s = await loadAvvStatus();
      if (!active) return;
      setShow(s != null && !s.accepted);
    })();
    return () => {
      active = false;
    };
  }, [userProfile?.role, userProfile?.id]);

  if (!show) return null;

  return (
    <div
      className="mb-4 rounded-md border border-accent/40 bg-accentSoft px-3 py-3 text-[15px] text-text"
      data-testid="avv-banner"
      role="status"
    >
      <p className="font-medium text-text">{AVV_ATTENTION}</p>
      <Link
        to="/settings/rechtliches"
        className="mt-1 inline-block font-medium text-brand underline-offset-2 hover:underline"
      >
        Zu Einstellungen › Rechtliches
      </Link>
    </div>
  );
}
