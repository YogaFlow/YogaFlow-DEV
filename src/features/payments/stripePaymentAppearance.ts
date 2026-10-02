/**
 * Stripe Appearance aus Design-Tokens (2.2b-2).
 * theme flat: ruhige Flächen wie surface/border; accordion: auf 360 px weniger Tabs.
 */
import type { Appearance, StripeElementsOptionsMode } from '@stripe/stripe-js';
import { tokens } from '../../design/tokens';

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function stripePaymentAppearance(): Appearance {
  return {
    theme: 'flat',
    variables: {
      colorPrimary: cssVar('--color-brand', tokens.colors.brand),
      colorBackground: cssVar('--color-surface', tokens.colors.surface),
      colorText: cssVar('--color-text', tokens.colors.text),
      colorDanger: cssVar('--color-danger', tokens.colors.danger),
      colorTextSecondary: cssVar('--color-text-muted', tokens.colors.textMuted),
      borderRadius: tokens.radii.sm,
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    },
    rules: {
      '.Input': {
        border: `1px solid ${cssVar('--color-border-strong', tokens.colors.borderStrong)}`,
        boxShadow: 'none',
      },
      '.Input:focus': {
        border: `1px solid ${cssVar('--color-brand', tokens.colors.brand)}`,
        boxShadow: 'none',
      },
    },
  };
}

export function stripeElementsModeOptions(
  amountCents: number,
  currency: string,
): StripeElementsOptionsMode {
  return {
    mode: 'payment',
    amount: amountCents,
    currency: currency.toLowerCase(),
    paymentMethodTypes: ['card'],
    locale: 'de',
    appearance: stripePaymentAppearance(),
  };
}

/** Payment Element Layout — accordion wirkt auf schmalen Displays ruhiger als Tabs. */
export const STRIPE_PAYMENT_ELEMENT_LAYOUT = 'accordion' as const;
