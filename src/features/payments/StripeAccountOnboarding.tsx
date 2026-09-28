/**
 * Einzige Stelle in src/, die @stripe/connect-js / @stripe/react-connect-js importiert (U8).
 * fetchClientSecret ruft payments-onboarding start; onExit ruft refresh.
 * client_secret bleibt nur innerhalb dieses Moduls / der Stripe-Komponente.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadConnectAndInitialize, type StripeConnectInstance } from '@stripe/connect-js';
import { ConnectAccountOnboarding, ConnectComponentsProvider } from '@stripe/react-connect-js';
import { tokens } from '../../design/tokens';
import { copy } from './paymentSetupCopy';
import { startOnboardingSession } from './usePaymentSetup';

type Props = {
  publishableKey: string;
  onExit: () => void;
};

export default function StripeAccountOnboarding({ publishableKey, onExit }: Props) {
  const [instance, setInstance] = useState<StripeConnectInstance | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchClientSecret = useCallback(async () => {
    const session = await startOnboardingSession();
    return session.clientSecret;
  }, []);

  const appearance = useMemo(
    () => ({
      overlays: 'dialog' as const,
      variables: {
        colorPrimary: tokens.colors.brand,
        colorBackground: tokens.colors.bg,
        colorText: tokens.colors.text,
        colorDanger: tokens.colors.danger,
        borderRadius: tokens.radii.sm,
      },
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    try {
      const next = loadConnectAndInitialize({
        publishableKey,
        fetchClientSecret,
        locale: 'de',
        appearance,
      });
      if (!cancelled) setInstance(next);
    } catch {
      if (!cancelled) setError(copy.formError);
    }
    return () => {
      cancelled = true;
    };
  }, [appearance, fetchClientSecret, publishableKey]);

  if (error) {
    return (
      <p role="alert" className="text-[15px] text-text">
        {error}
      </p>
    );
  }

  if (!instance) {
    return <p className="text-[15px] text-textMuted">{copy.loading}</p>;
  }

  return (
    <div className="min-h-[320px] rounded-md border border-border bg-bg p-2">
      <ConnectComponentsProvider connectInstance={instance}>
        <ConnectAccountOnboarding
          onExit={onExit}
          collectionOptions={{ fields: 'eventually_due' }}
          onLoadError={() => {
            setError(copy.formError);
          }}
        />
      </ConnectComponentsProvider>
    </div>
  );
}
