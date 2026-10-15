/**
 * DEV-only: ein Online-Zahlung-Zustand für Screenshots (Query ?paymentSetup=…).
 * Kein Auth nötig; nur mit import.meta.env.DEV erreichbar.
 */
import { Navigate } from 'react-router-dom';
import OnlinePaymentSection from '../features/payments/OnlinePaymentSection';
import { DEV_MOCK_STATUSES, readDevMockStatus } from '../features/payments/paymentSetupTypes';

export default function DevPaymentSetupStates() {
  if (!import.meta.env.DEV) {
    return <Navigate to="/" replace />;
  }

  const mock = readDevMockStatus();
  if (!mock) {
    return (
      <div className="min-h-screen bg-bg p-8 text-[15px] text-text">
        <p>
          DEV-Vorschau: setze{' '}
          <code className="text-brand">?paymentSetup=not_started|in_progress|in_review|active|disconnected</code>
        </p>
        <p className="mt-2 text-textMuted">Erlaubt: {DEV_MOCK_STATUSES.join(', ')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg p-4 md:p-8">
      <p className="mb-3 text-[13px] font-medium uppercase tracking-wide text-textSubtle">
        DEV · paymentSetup={mock}
      </p>
      <div className="mx-auto max-w-4xl">
        <OnlinePaymentSection isOwner />
      </div>
    </div>
  );
}
