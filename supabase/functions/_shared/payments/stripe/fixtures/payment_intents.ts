/**
 * Gespeicherte Stripe-PaymentIntent-Beispiele für Q4-Mapping-Tests.
 * Keine echten API-Aufrufe.
 */
export const piSucceeded = {
  id: "pi_fixture_succeeded",
  object: "payment_intent",
  amount: 1800,
  currency: "eur",
  status: "succeeded",
  livemode: false,
  client_secret: "pi_fixture_succeeded_secret_do_not_log",
  metadata: { attempt_id: "att_1", tenant_id: "t1", registration_id: "r1" },
  last_payment_error: null,
  latest_charge: {
    id: "ch_fixture_1",
    object: "charge",
    created: 1_700_000_000,
    amount: 1800,
  },
} as const;

export const piProcessing = {
  id: "pi_fixture_processing",
  object: "payment_intent",
  amount: 1800,
  currency: "eur",
  status: "processing",
  livemode: false,
  client_secret: "pi_fixture_processing_secret",
  metadata: { attempt_id: "att_2" },
  last_payment_error: null,
  latest_charge: null,
} as const;

export const piRequiresAction = {
  id: "pi_fixture_requires_action",
  object: "payment_intent",
  amount: 1800,
  currency: "eur",
  status: "requires_action",
  livemode: false,
  client_secret: "pi_fixture_requires_action_secret_3ds",
  metadata: { attempt_id: "att_3" },
  last_payment_error: null,
  latest_charge: null,
} as const;

export const piRequiresPaymentMethodFailed = {
  id: "pi_fixture_rpm_failed",
  object: "payment_intent",
  amount: 1800,
  currency: "eur",
  status: "requires_payment_method",
  livemode: false,
  client_secret: "pi_fixture_rpm_secret",
  metadata: { attempt_id: "att_4" },
  last_payment_error: { code: "card_declined" },
  latest_charge: null,
} as const;

export const piCanceled = {
  id: "pi_fixture_canceled",
  object: "payment_intent",
  amount: 1800,
  currency: "eur",
  status: "canceled",
  livemode: false,
  client_secret: null,
  metadata: { attempt_id: "att_5" },
  last_payment_error: null,
  latest_charge: null,
} as const;

/** Snapshot-Event-Hüllen für Webhook-Tests (payment_intent.* → payment.updated). */
export function paymentIntentEvent(
  type: "payment_intent.succeeded" | "payment_intent.payment_failed" | "payment_intent.canceled",
  accountRef: string,
  object:
    | typeof piSucceeded
    | typeof piProcessing
    | typeof piRequiresAction
    | typeof piRequiresPaymentMethodFailed
    | typeof piCanceled,
  eventId = "evt_fixture_pi_1",
): Record<string, unknown> {
  return {
    id: eventId,
    type,
    account: accountRef,
    livemode: false,
    data: { object },
  };
}

export const evtPiSucceeded = (accountRef: string, eventId = "evt_pi_succeeded") =>
  paymentIntentEvent("payment_intent.succeeded", accountRef, piSucceeded, eventId);

export const evtPiFailed = (accountRef: string, eventId = "evt_pi_failed") =>
  paymentIntentEvent("payment_intent.payment_failed", accountRef, piRequiresPaymentMethodFailed, eventId);

export const evtPiCanceled = (accountRef: string, eventId = "evt_pi_canceled") =>
  paymentIntentEvent("payment_intent.canceled", accountRef, piCanceled, eventId);

export const evtPiProcessing = (accountRef: string, eventId = "evt_pi_processing") =>
  paymentIntentEvent("payment_intent.succeeded", accountRef, piProcessing, eventId);
