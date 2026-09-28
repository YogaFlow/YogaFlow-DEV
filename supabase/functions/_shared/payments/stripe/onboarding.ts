/**
 * Account Session für die eingebettete Onboarding-Komponente (1.3). Liegt bewusst
 * außerhalb des Ports: Die Onboarding-Oberfläche wird nicht abstrahiert (Epic 4.3).
 */
import { ProviderError } from "../port.ts";
import { createStripeClient, type StripeClientConfig, toProviderError } from "./sdk.ts";

export interface OnboardingSession {
  /** Geht nur an den Browser der Owner-Sitzung; nie loggen. */
  clientSecret: string;
  /** Unix-Sekunden. */
  expiresAt: number;
}

export async function createOnboardingSession(
  config: StripeClientConfig,
  accountRef: string,
): Promise<OnboardingSession> {
  if (!accountRef) throw new ProviderError("PROVIDER_REJECTED", "missing_input");
  const client = createStripeClient(config);
  try {
    const session = await client.accountSessions.create({
      account: accountRef,
      components: { account_onboarding: { enabled: true } },
    });
    return { clientSecret: session.client_secret, expiresAt: session.expires_at };
  } catch (err) {
    throw toProviderError(err);
  }
}
