import React, { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { withDevTenant } from '../context/TenantContext';
import { isStudioAdmin } from '../lib/userRoles';
import { fetchOpenPaymentsCount } from '../lib/openPaymentsCount';
import { openPaymentsBadge, resolvePaymentsTab, type PaymentsTab } from '../lib/paymentsTabs';
import SegmentControl from '../components/ui/SegmentControl';
import OpenPayments from './OpenPayments';
import Payments from './Payments';

const PaymentsHub: React.FC = () => {
  const { userProfile } = useAuth();
  const allowed = isStudioAdmin(userProfile);
  const [params, setParams] = useSearchParams();
  const [openCount, setOpenCount] = useState<number | null>(null);

  useEffect(() => {
    if (!allowed) {
      setOpenCount(0);
      return;
    }
    let active = true;
    void fetchOpenPaymentsCount().then((count) => {
      if (active) setOpenCount(count);
    });
    return () => {
      active = false;
    };
  }, [allowed]);

  const tabParam = params.get('tab');
  const paymentId = params.get('payment');
  const tab =
    openCount == null && !tabParam && !paymentId
      ? null
      : resolvePaymentsTab(tabParam, paymentId, openCount ?? 0);

  useEffect(() => {
    if (!allowed || tab == null) return;
    if (tabParam === tab) return;
    const next = new URLSearchParams(params);
    next.set('tab', tab);
    setParams(next, { replace: true });
  }, [allowed, tab, tabParam, params, setParams]);

  const setTab = (nextTab: PaymentsTab) => {
    const next = new URLSearchParams(params);
    next.set('tab', nextTab);
    if (nextTab === 'offen') next.delete('payment');
    setParams(next, { replace: false });
  };

  if (!allowed) {
    return (
      <div className="p-8">
        <div className="rounded-sm border border-danger bg-dangerSoft px-4 py-3 text-danger">
          Zugriff verweigert. Diese Seite ist nur für die Studioleitung.
        </div>
      </div>
    );
  }

  if (tab == null) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-brand" />
      </div>
    );
  }

  const badge = openPaymentsBadge(openCount ?? 0);

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 -mx-3 bg-sand px-3 py-2 sm:-mx-6 sm:px-6">
        <SegmentControl
          aria-label="Zahlungen"
          value={tab}
          onChange={setTab}
          options={[
            {
              value: 'offen',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  Offen
                  {badge ? (
                    <span className="min-w-[1.25rem] rounded-full bg-brand px-1.5 text-center text-[12px] font-semibold leading-5 text-onBrand tabular-nums">
                      {badge}
                    </span>
                  ) : null}
                </span>
              ),
            },
            { value: 'alle', label: 'Alle' },
          ]}
        />
      </div>
      {tab === 'offen' ? <OpenPayments embedded /> : <Payments />}
    </div>
  );
};

export function OpenPaymentsRedirect() {
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  next.set('tab', 'offen');
  return <Navigate to={withDevTenant(`/payments?${next.toString()}`)} replace />;
}

export default PaymentsHub;
