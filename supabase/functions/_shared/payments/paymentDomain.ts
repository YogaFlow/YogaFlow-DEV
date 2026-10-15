/**
 * C11: Studio-Subdomain am Connected Account (Direct Charges).
 * Eine Formel für Onboarding-Refresh, Online-Schalter und Checkout-prepare.
 */
export function studioPaymentDomain(tenantSlug: string, appBaseDomain: string): string | null {
  const base = appBaseDomain.trim().toLowerCase();
  const slug = tenantSlug.trim().toLowerCase();
  if (!base || !slug) return null;
  return `${slug}.${base}`;
}
