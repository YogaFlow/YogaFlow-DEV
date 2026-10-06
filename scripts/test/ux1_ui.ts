/**
 * Unit-Test UX-1: Zahlungs-Reiter, Badge, Einstellungs-Statuszeilen.
 *
 *   node --experimental-strip-types --test scripts/test/ux1_ui.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  countOpenCoveragePeople,
  defaultPaymentsTab,
  openPaymentsBadge,
  parsePaymentsTab,
  resolvePaymentsTab,
} from '../../src/lib/paymentsTabs.ts';
import {
  bookingsStatusLine,
  cardsStatusLine,
  paymentsStatusLine,
  settingsAttentionItems,
  studioStatusLine,
  teamStatusLine,
  visibleSettingsCategories,
} from '../../src/lib/settingsOverview.ts';

test('Badge-Zahl', () => {
  assert.equal(openPaymentsBadge(0), null);
  assert.equal(openPaymentsBadge(-1), null);
  assert.equal(openPaymentsBadge(3), '3');
  assert.equal(openPaymentsBadge(9), '9');
  assert.equal(openPaymentsBadge(10), '9+');
  assert.equal(countOpenCoveragePeople([{ user_id: 'a' }, { user_id: 'a' }, { user_id: 'b' }]), 2);
});

test('Default-Reiter', () => {
  assert.equal(defaultPaymentsTab(3), 'offen');
  assert.equal(defaultPaymentsTab(0), 'alle');
  assert.equal(parsePaymentsTab('offen'), 'offen');
  assert.equal(parsePaymentsTab('alle'), 'alle');
  assert.equal(parsePaymentsTab('x'), null);
  assert.equal(resolvePaymentsTab(null, null, 2), 'offen');
  assert.equal(resolvePaymentsTab(null, null, 0), 'alle');
  assert.equal(resolvePaymentsTab('alle', null, 4), 'alle');
  assert.equal(resolvePaymentsTab(null, 'pay-1', 4), 'alle');
});

test('Statuszeilen der Kategorien', () => {
  assert.equal(studioStatusLine({ name: 'Demo Alpha', hasLogo: true }), 'Demo Alpha · eigenes Logo');
  assert.equal(studioStatusLine({ name: 'Demo Alpha', hasLogo: false }), 'Demo Alpha · ohne Logo');
  assert.equal(bookingsStatusLine({ cancellationWindowHours: 24 }), 'Stornofrist 24 h · Warteliste an');
  assert.equal(bookingsStatusLine({ cancellationWindowHours: 12 }), 'Stornofrist 12 h · Warteliste an');
  assert.equal(paymentsStatusLine({ onlineEnabled: true, taxLabel: 'Kleinunternehmer' }), 'Online aktiv · Kleinunternehmer');
  assert.equal(paymentsStatusLine({ onlineEnabled: false, taxLabel: null }), 'Online aus');
  assert.equal(cardsStatusLine(2), '2 Karten im Angebot');
  assert.equal(cardsStatusLine(1), '1 Karte im Angebot');
  assert.equal(cardsStatusLine(0), 'Keine Karten im Angebot');
  assert.equal(teamStatusLine(3), '3 Personen');
  assert.equal(teamStatusLine(1), '1 Person');
});

test('Aufmerksamkeit und sichtbare Kategorien', () => {
  const tax = settingsAttentionItems({
    onlineEnabled: true,
    taxPresent: false,
    stripeReady: true,
    hasAccount: true,
    platformEnabled: true,
  });
  assert.equal(tax.some((item) => item.id === 'tax'), true);
  assert.equal(tax.some((item) => item.id === 'stripe'), false);

  const stripe = settingsAttentionItems({
    onlineEnabled: false,
    taxPresent: true,
    stripeReady: false,
    hasAccount: true,
    platformEnabled: true,
  });
  assert.equal(stripe.some((item) => item.id === 'stripe'), true);

  const none = settingsAttentionItems({
    onlineEnabled: false,
    taxPresent: true,
    stripeReady: true,
    hasAccount: true,
    platformEnabled: true,
  });
  assert.equal(none.length, 0);

  const legal = settingsAttentionItems({
    onlineEnabled: true,
    taxPresent: true,
    stripeReady: true,
    hasAccount: true,
    platformEnabled: true,
    legalProfilePresent: false,
  });
  assert.equal(legal.some((item) => item.id === 'legal'), true);

  assert.equal(visibleSettingsCategories(true).some((item) => item.id === 'studio'), true);
  assert.equal(visibleSettingsCategories(true).some((item) => item.id === 'rechtliches'), true);
  // UX-7: Studio inkl. Kartenhinweis auch für Admin
  assert.equal(visibleSettingsCategories(false).some((item) => item.id === 'studio'), true);
});
