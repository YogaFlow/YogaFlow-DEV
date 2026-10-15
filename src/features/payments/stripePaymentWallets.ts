/**
 * Q2 / K6: eine Zahlungs-Konfiguration für Kurs- und Karten-Checkout.
 * Link aus. Apple Pay und Google Pay bleiben über card (auto).
 * Option von @stripe/stripe-js 9.17.0: PaymentElement `wallets.link`.
 * Eigene Datei, damit der Unit-Test sie ohne Design-Tokens laden kann.
 */
export const STRIPE_PAYMENT_ELEMENT_WALLETS = {
  applePay: 'auto',
  googlePay: 'auto',
  link: 'never',
} as const;

/** Elements-Init (deferred). Betrag und Währung kommen vom prepare — sonst identisch. */
export function stripePaymentElementsOptions(input: {
  amountCents: number;
  currency: string;
}) {
  return {
    mode: 'payment' as const,
    amount: Math.round(input.amountCents),
    currency: input.currency.trim().toLowerCase(),
    paymentMethodTypes: ['card'] as ['card'],
    locale: 'de' as const,
  };
}

/**
 * Payment Element. Accordion mit Radio-Zeilen (UX-10): jede Zahlart eigene Zeile;
 * bei „Karte“ Logos → eindeutig Kreditkarte. Wallets fest vor der Karte.
 */
export const STRIPE_PAYMENT_ELEMENT_OPTIONS = {
  layout: {
    type: 'accordion' as const,
    /** Story: radios true — Stripe-Typen: always (Radio je Zahlart). */
    radios: 'always' as const,
    spacedAccordionItems: true,
  },
  wallets: STRIPE_PAYMENT_ELEMENT_WALLETS,
  paymentMethodOrder: ['apple_pay', 'google_pay', 'card'] as string[],
};
