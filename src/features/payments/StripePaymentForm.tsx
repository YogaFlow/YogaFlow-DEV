/**
 * Einzige Stelle in src/, die @stripe/stripe-js / @stripe/react-stripe-js importiert (Z9).
 * acct_… nur als stripeAccount an loadStripe — nie anzeigen, loggen oder speichern.
 */
import { useEffect, useMemo, useState } from 'react';
import { loadStripe, type Stripe, type StripeElementsOptions } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { payAmountLabel } from '../../lib/paymentTexts';
import { formatCents } from '../../lib/format';

type FormProps = {
  amountCents: number;
  currency: string;
  disabled: boolean;
  holdExpired: boolean;
  onSubmitToken: (confirmationTokenId: string) => Promise<void>;
  onRequiresAction: (clientSecret: string, stripe: Stripe) => Promise<void>;
};

function PaymentFormInner({
  amountCents,
  disabled,
  holdExpired,
  onSubmitToken,
}: Omit<FormProps, 'currency' | 'onRequiresAction'>) {
  const stripe = useStripe();
  const elements = useElements();
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const locked = disabled || holdExpired || submitting || !stripe || !elements;

  const onPay = async () => {
    if (!stripe || !elements || locked) return;
    setLocalError(null);
    setSubmitting(true);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setLocalError(submitError.message ?? 'Bitte prüfe die Angaben.');
        return;
      }
      const { error, confirmationToken } = await stripe.createConfirmationToken({
        elements,
      });
      if (error || !confirmationToken?.id) {
        setLocalError(error?.message ?? 'Bitte prüfe die Angaben.');
        return;
      }
      await onSubmitToken(confirmationToken.id);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <PaymentElement
        options={{
          layout: 'tabs',
          paymentMethodOrder: ['card'],
        }}
      />
      {localError ? (
        <p role="alert" className="text-[13px] text-text">
          {localError}
        </p>
      ) : null}
      <button
        type="button"
        disabled={locked}
        onClick={() => void onPay()}
        className="inline-flex h-11 w-full items-center justify-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand active:bg-brandPressed disabled:opacity-50"
      >
        {submitting ? '…' : payAmountLabel(formatCents(amountCents))}
      </button>
    </div>
  );
}

type Props = {
  publishableKey: string;
  /** Nur an loadStripe({ stripeAccount }) — nicht rendern. */
  accountRef: string;
  amountCents: number;
  currency: string;
  disabled: boolean;
  holdExpired: boolean;
  onSubmitToken: (confirmationTokenId: string) => Promise<void>;
};

export default function StripePaymentForm({
  publishableKey,
  accountRef,
  amountCents,
  currency,
  disabled,
  holdExpired,
  onSubmitToken,
}: Props) {
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(
    null,
  );
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    try {
      const promise = loadStripe(publishableKey, { stripeAccount: accountRef });
      if (!cancelled) setStripePromise(promise);
    } catch {
      if (!cancelled) setInitError('Das Zahlungsformular konnte nicht geladen werden.');
    }
    return () => {
      cancelled = true;
    };
  }, [publishableKey, accountRef]);

  const options = useMemo<StripeElementsOptions>(
    () => ({
      mode: 'payment',
      amount: amountCents,
      currency: currency.toLowerCase(),
      paymentMethodTypes: ['card'],
      locale: 'de',
    }),
    [amountCents, currency],
  );

  if (initError) {
    return (
      <p role="alert" className="text-[15px] text-text">
        {initError}
      </p>
    );
  }

  if (!stripePromise) {
    return <p className="text-[15px] text-textMuted">Formular wird geladen …</p>;
  }

  return (
    <Elements stripe={stripePromise} options={options}>
      <PaymentFormInner
        amountCents={amountCents}
        disabled={disabled}
        holdExpired={holdExpired}
        onSubmitToken={onSubmitToken}
      />
    </Elements>
  );
}

/** Von außen nach confirm: 3-D-Secure mit demselben Stripe-Konto. */
export async function handleStripeNextAction(
  publishableKey: string,
  accountRef: string,
  clientSecret: string,
): Promise<{ ok: true } | { ok: false }> {
  const stripe = await loadStripe(publishableKey, { stripeAccount: accountRef });
  if (!stripe) return { ok: false };
  const { error } = await stripe.handleNextAction({ clientSecret });
  if (error) return { ok: false };
  return { ok: true };
}
