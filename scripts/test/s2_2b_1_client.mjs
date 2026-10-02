/**
 * Unit-Tests 2.2b-1: Key-Sperre, Texte, Zustandsautomat.
 *
 *   node --experimental-strip-types --test scripts/test/s2_2b_1_client.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  attemptIdAfterRetryPrepare,
  reduceCheckoutPhase,
  sheetRemainsOpenAfterRegistrationChange,
  shouldRefreshRegistrationsOnSheetClose,
} from '../../src/lib/checkoutPhaseMachine.ts';
import { resolvePaymentsClientConfig } from '../../src/lib/paymentsClientConfig.ts';
import {
  PAYMENT_AUTH_FAILED,
  PAYMENT_CARD_DECLINED,
  PAYMENT_GENERIC_ERROR,
  PAYMENT_HOLD_EXPIRED,
  PAYMENT_NOT_PENDING,
  PAYMENT_ONLINE_DISABLED,
  PAYMENT_PROCESSING_TIMEOUT,
  PAYMENT_PROVIDER_UNAVAILABLE,
  PAYMENT_REFUND_REQUIRED,
  PAYMENT_SUCCESS,
  paymentMessageForCode,
} from '../../src/lib/paymentTexts.ts';

test('Key-Sperre: test + pk_test_ → enabled', () => {
  const c = resolvePaymentsClientConfig('test', 'pk_test_abc');
  assert.equal(c.enabled, true);
  assert.equal(c.mode, 'test');
  assert.equal(c.publishableKey, 'pk_test_abc');
  assert.equal(c.reason, null);
});

test('Key-Sperre: live + pk_live_ → enabled', () => {
  const c = resolvePaymentsClientConfig('live', 'pk_live_abc');
  assert.equal(c.enabled, true);
  assert.equal(c.mode, 'live');
});

test('Key-Sperre: test + pk_live_ → mismatch', () => {
  const c = resolvePaymentsClientConfig('test', 'pk_live_abc');
  assert.equal(c.enabled, false);
  assert.equal(c.reason, 'KEY_MODE_MISMATCH');
  assert.equal(c.publishableKey, null);
});

test('Key-Sperre: live + pk_test_ → mismatch', () => {
  const c = resolvePaymentsClientConfig('live', 'pk_test_abc');
  assert.equal(c.enabled, false);
  assert.equal(c.reason, 'KEY_MODE_MISMATCH');
});

test('Key-Sperre: Modus fehlt', () => {
  const c = resolvePaymentsClientConfig('', 'pk_test_abc');
  assert.equal(c.enabled, false);
  assert.equal(c.reason, 'MODE_MISSING');
});

test('Key-Sperre: Key fehlt', () => {
  const c = resolvePaymentsClientConfig('test', '');
  assert.equal(c.enabled, false);
  assert.equal(c.reason, 'KEY_MISSING');
});

test('Texte je Code', () => {
  assert.equal(paymentMessageForCode('COMPLETED'), PAYMENT_SUCCESS);
  assert.equal(paymentMessageForCode('ALREADY_COMPLETED'), PAYMENT_SUCCESS);
  assert.equal(paymentMessageForCode('RESTORED'), PAYMENT_SUCCESS);
  assert.equal(paymentMessageForCode('REFUND_REQUIRED'), PAYMENT_REFUND_REQUIRED);
  assert.equal(paymentMessageForCode('HOLD_EXPIRED'), PAYMENT_HOLD_EXPIRED);
  assert.equal(paymentMessageForCode('CARD_DECLINED'), PAYMENT_CARD_DECLINED);
  assert.equal(paymentMessageForCode('AUTHENTICATION_REQUIRED'), PAYMENT_AUTH_FAILED);
  assert.equal(paymentMessageForCode('PROVIDER_UNAVAILABLE'), PAYMENT_PROVIDER_UNAVAILABLE);
  assert.equal(paymentMessageForCode('ONLINE_DISABLED'), PAYMENT_ONLINE_DISABLED);
  assert.equal(paymentMessageForCode('NOT_PENDING'), PAYMENT_NOT_PENDING);
  assert.equal(paymentMessageForCode('FORBIDDEN'), PAYMENT_GENERIC_ERROR);
  assert.equal(paymentMessageForCode('INVALID_REQUEST'), PAYMENT_GENERIC_ERROR);
  assert.equal(paymentMessageForCode('PROCESSING_TIMEOUT'), PAYMENT_PROCESSING_TIMEOUT);
  assert.equal(paymentMessageForCode('UNKNOWN_XYZ'), PAYMENT_GENERIC_ERROR);
});

test('Automat: Erfolgspfad', () => {
  let p = reduceCheckoutPhase('idle', { type: 'PREPARE_START' });
  assert.equal(p, 'preparing');
  p = reduceCheckoutPhase(p, { type: 'PREPARE_OK' });
  assert.equal(p, 'ready');
  p = reduceCheckoutPhase(p, { type: 'CONFIRM_START' });
  assert.equal(p, 'submitting');
  p = reduceCheckoutPhase(p, { type: 'CONFIRM_SUCCEEDED', code: 'COMPLETED' });
  assert.equal(p, 'done');
});

test('Automat: Ablehnung', () => {
  let p = reduceCheckoutPhase('ready', { type: 'CONFIRM_START' });
  p = reduceCheckoutPhase(p, { type: 'CONFIRM_FAILED', code: 'CARD_DECLINED' });
  assert.equal(p, 'error');
});

test('Automat: requires_action → processing → done', () => {
  let p = reduceCheckoutPhase('ready', { type: 'CONFIRM_START' });
  p = reduceCheckoutPhase(p, { type: 'REQUIRES_ACTION' });
  assert.equal(p, 'action');
  p = reduceCheckoutPhase(p, { type: 'POLL_START' });
  assert.equal(p, 'processing');
  p = reduceCheckoutPhase(p, { type: 'POLL_DONE', code: 'COMPLETED' });
  assert.equal(p, 'done');
});

test('Automat: processing Timeout', () => {
  let p = reduceCheckoutPhase('processing', { type: 'POLL_TIMEOUT' });
  assert.equal(p, 'done');
});

test('Automat: HOLD_EXPIRED', () => {
  const p = reduceCheckoutPhase('ready', { type: 'HOLD_EXPIRED' });
  assert.equal(p, 'error');
});

test('L1: Endzustand bleibt bei Statuswechsel sichtbar', () => {
  assert.equal(
    sheetRemainsOpenAfterRegistrationChange(true, 'registered'),
    true,
  );
  assert.equal(
    sheetRemainsOpenAfterRegistrationChange(true, 'pending_payment'),
    true,
  );
  assert.equal(sheetRemainsOpenAfterRegistrationChange(false, 'registered'), false);
});

test('L1: Reload erst beim Schließen', () => {
  assert.equal(shouldRefreshRegistrationsOnSheetClose('done', false), false);
  assert.equal(shouldRefreshRegistrationsOnSheetClose('error', false), false);
  assert.equal(shouldRefreshRegistrationsOnSheetClose('ready', true), false);
  assert.equal(shouldRefreshRegistrationsOnSheetClose('done', true), true);
  assert.equal(shouldRefreshRegistrationsOnSheetClose('error', true), true);
  assert.equal(shouldRefreshRegistrationsOnSheetClose('processing', true), false);
});

test('L2: Ablehnung → Retry → neue attempt_id → Erfolg', () => {
  let p = reduceCheckoutPhase('ready', { type: 'CONFIRM_START' });
  p = reduceCheckoutPhase(p, { type: 'CONFIRM_FAILED', code: 'CARD_DECLINED' });
  assert.equal(p, 'error');
  p = reduceCheckoutPhase(p, { type: 'RETRY_START' });
  assert.equal(p, 'retrying');
  p = reduceCheckoutPhase(p, { type: 'PREPARE_OK' });
  assert.equal(p, 'ready');
  const ids = attemptIdAfterRetryPrepare('attempt-old', {
    ok: true,
    attemptId: 'attempt-new',
  });
  assert.equal(ids.attemptId, 'attempt-new');
  assert.equal(ids.code, null);
  p = reduceCheckoutPhase(p, { type: 'CONFIRM_START' });
  p = reduceCheckoutPhase(p, { type: 'CONFIRM_SUCCEEDED', code: 'COMPLETED' });
  assert.equal(p, 'done');
});

test('L2: Retry nach Ablauf → HOLD_EXPIRED', () => {
  let p = reduceCheckoutPhase('error', { type: 'RETRY_START' });
  assert.equal(p, 'retrying');
  p = reduceCheckoutPhase(p, { type: 'PREPARE_FAIL', code: 'HOLD_EXPIRED' });
  assert.equal(p, 'error');
  const ids = attemptIdAfterRetryPrepare('attempt-old', {
    ok: false,
    code: 'HOLD_EXPIRED',
  });
  assert.equal(ids.attemptId, null);
  assert.equal(ids.code, 'HOLD_EXPIRED');
});
