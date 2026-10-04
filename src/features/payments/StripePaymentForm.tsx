/**
 * Einzige Stelle in src/, die @stripe/stripe-js / @stripe/react-stripe-js importiert (Z9).
 * acct_… nur als stripeAccount an loadStripe — nie anzeigen, loggen oder speichern.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  loadStripe,
  type Stripe,
  type StripeElementsOptions,
} from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { Lock, Loader2 } from 'lucide-react';
import {
  PAYMENT_SECURE_SHORT,
  PAYMENT_SUBMITTING,
} from '../../lib/paymentTexts';
import { BINDING_BOOK_LABEL } from '../../lib/legalCheckoutTexts';
import {
  BookingCheckoutFooter,
  type BookingSummaryData,
} from '../../components/payments/BookingSummaryBlock';
import {
  STRIPE_PAYMENT_ELEMENT_LAYOUT,
  stripePaymentAppearance,
} from './stripePaymentAppearance';
import { STRIPE_PAYMENT_ELEMENT_WALLETS } from './stripePaymentWallets';

type FormProps = {
  amountCents: number;
  disabled: boolean;
  holdExpired: boolean;
  studioName: string;
  alertMessage?: string | null;
  submitLabel?: string;
  bookingSummary?: BookingSummaryData | null;
  /** L2: nach Ablehnung neuen prepare-Versuch starten (statt confirm). */
  onRetry?: () => Promise<void>;
  onSubmitToken: (confirmationTokenId: string) => Promise<void>;
};

function PaymentFormInner({
  disabled,
  holdExpired,
  alertMessage,
  submitLabel,
  bookingSummary,
  onRetry,
  onSubmitToken,
}: FormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const needsRetry = Boolean(onRetry && alertMessage);
  const locked =
    holdExpired ||
    submitting ||
    disabled ||
    (!needsRetry && (!stripe || !elements));
  const alertText = localError ?? alertMessage ?? null;
  const buttonLabel = submitLabel ?? BINDING_BOOK_LABEL;

  const onPay = async () => {
    if (needsRetry && onRetry) {
      setLocalError(null);
      setSubmitting(true);
      try {
        await onRetry();
      } finally {
        setSubmitting(false);
      }
      return;
    }
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
        params: {
          payment_method_data: {
            billing_details: {
              address: {
                country: 'DE',
              },
            },
          },
        },
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

  const payButton = (
    <>
      <button
        type="button"
        disabled={locked}
        onClick={() => void onPay()}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand active:bg-brandPressed disabled:opacity-50"
        data-testid="checkout-pay"
      >
        {submitting || disabled ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            <span>{PAYMENT_SUBMITTING}</span>
          </>
        ) : (
          buttonLabel
        )}
      </button>
      <p className="mt-2 inline-flex items-start gap-1.5 text-[12px] leading-snug text-textMuted">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{PAYMENT_SECURE_SHORT}</span>
      </p>
    </>
  );

  return (
    <div className="flex flex-col">
      <div className="min-h-[10rem]">
        <PaymentElement
          options={{
            layout: STRIPE_PAYMENT_ELEMENT_LAYOUT,
            wallets: STRIPE_PAYMENT_ELEMENT_WALLETS,
            fields: {
              billingDetails: {
                address: {
                  // if_required nicht im Stripe-Typen; never + country DE beim Token.
                  country: 'never',
                },
              },
            },
          }}
        />
      </div>

      {bookingSummary ? (
        <BookingCheckoutFooter data={bookingSummary} alertMessage={alertText}>
          {payButton}
        </BookingCheckoutFooter>
      ) : (
        <div className="sticky bottom-0 z-10 -mx-5 mt-4 border-t border-border bg-surface px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {alertText ? (
            <p role="alert" className="mb-3 text-[13px] leading-snug text-danger">
              {alertText}
            </p>
          ) : null}
          {payButton}
        </div>
      )}
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
  studioName: string;
  alertMessage?: string | null;
  submitLabel?: string;
  bookingSummary?: BookingSummaryData | null;
  onRetry?: () => Promise<void>;
  onSubmitToken: (confirmationTokenId: string) => Promise<void>;
};

export default function StripePaymentForm({
  publishableKey,
  accountRef,
  amountCents,
  currency,
  disabled,
  holdExpired,
  studioName,
  alertMessage,
  submitLabel,
  bookingSummary = null,
  onRetry,
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
      appearance: stripePaymentAppearance(),
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
    return (
      <div
        className="flex min-h-[10rem] items-center justify-center rounded-md border border-border bg-surfaceSunken/60 text-[13px] text-textMuted"
        aria-busy="true"
      >
        Formular wird geladen …
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise} options={options}>
      <PaymentFormInner
        amountCents={amountCents}
        disabled={disabled}
        holdExpired={holdExpired}
        studioName={studioName}
        alertMessage={alertMessage}
        submitLabel={submitLabel}
        bookingSummary={bookingSummary}
        onRetry={onRetry}
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
