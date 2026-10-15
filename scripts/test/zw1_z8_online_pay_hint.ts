/**
 * ZW-1 Z8 — Unit: Online/Vor-Ort-Standard × Hinweis gesehen ja/nein.
 * node --experimental-strip-types --test scripts/test/zw1_z8_online_pay_hint.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ONLINE_PAY_HINT_LINE,
  ONLINE_PAY_HINT_SWITCH_LINE,
  onlinePayHintUi,
} from '../../src/lib/bookingMethodTexts.ts';

describe('ZW-1 Z8 onlinePayHintUi (4 Fälle)', () => {
  it('Online Standard + Hinweis nicht gesehen', () => {
    assert.deepEqual(onlinePayHintUi({ showOnlinePayHint: true, activeMethod: 'online' }), {
      showBadge: true,
      hintLine: ONLINE_PAY_HINT_LINE,
      hintSwitchesToOnline: false,
    });
  });

  it('Online Standard + Hinweis gesehen', () => {
    assert.deepEqual(onlinePayHintUi({ showOnlinePayHint: false, activeMethod: 'online' }), {
      showBadge: false,
      hintLine: null,
      hintSwitchesToOnline: false,
    });
  });

  it('Vor Ort Standard + Hinweis nicht gesehen', () => {
    assert.deepEqual(onlinePayHintUi({ showOnlinePayHint: true, activeMethod: 'onsite' }), {
      showBadge: true,
      hintLine: ONLINE_PAY_HINT_SWITCH_LINE,
      hintSwitchesToOnline: true,
    });
  });

  it('Vor Ort Standard + Hinweis gesehen', () => {
    assert.deepEqual(onlinePayHintUi({ showOnlinePayHint: false, activeMethod: 'onsite' }), {
      showBadge: false,
      hintLine: null,
      hintSwitchesToOnline: false,
    });
  });
});
