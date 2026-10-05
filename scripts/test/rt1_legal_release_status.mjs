/**
 * RT-1 Nachtrag — Freigabe-Status-Kombinationen (Unit, ohne DB).
 */
import assert from 'node:assert/strict';
import { computeTermsPillStatus } from '../../src/lib/studioLegalStatus.ts';

assert.equal(
  computeTermsPillStatus({
    imprintComplete: true,
    hasAcceptance: false,
    templateCurrent: true,
    extraRulesChangedSinceRelease: false,
  }),
  'release',
  'erstmalig freigeben',
);

assert.equal(
  computeTermsPillStatus({
    imprintComplete: true,
    hasAcceptance: true,
    templateCurrent: false,
    extraRulesChangedSinceRelease: false,
  }),
  'new_template',
  'Vorlage neu → neue Freigabe',
);

assert.equal(
  computeTermsPillStatus({
    imprintComplete: true,
    hasAcceptance: true,
    templateCurrent: true,
    extraRulesChangedSinceRelease: true,
  }),
  'change_release',
  'Weitere Regeln geändert → Änderung freigeben',
);

assert.equal(
  computeTermsPillStatus({
    imprintComplete: true,
    hasAcceptance: true,
    templateCurrent: true,
    extraRulesChangedSinceRelease: false,
  }),
  'current',
  'nur Einstellung geändert → keine neue Freigabe',
);

assert.equal(
  computeTermsPillStatus({
    imprintComplete: false,
    hasAcceptance: false,
    templateCurrent: true,
    extraRulesChangedSinceRelease: false,
  }),
  'missing',
  'Impressum fehlt',
);

console.log('rt1_legal_release_status: ok');
