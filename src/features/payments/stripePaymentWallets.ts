/**
 * Q2: nur Karte. Link aus. Apple Pay und Google Pay bleiben über card (auto).
 * Option von @stripe/stripe-js 9.17.0: PaymentElement `wallets.link`.
 * Eigene Datei, damit der Unit-Test sie ohne Design-Tokens laden kann.
 */
export const STRIPE_PAYMENT_ELEMENT_WALLETS = {
  applePay: 'auto',
  googlePay: 'auto',
  link: 'never',
} as const;
