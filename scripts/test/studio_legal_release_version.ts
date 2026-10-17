/**
 * FS-1 Nachtrag A: Freigabe nutzt pro Dokument die Version aus ACCEPTANCE_DOCS.
 *
 *   node --experimental-strip-types --test scripts/test/studio_legal_release_version.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STUDIO_LEGAL_ACCEPTANCE_DOCS } from '../../src/generated/studioLegalTemplates.ts';
import { studioLegalReleaseVersion } from '../../src/lib/studioLegalVersion.ts';

test('Datenschutz-Freigabe: Version 2026-10-08 (nicht globaler AGB-Stand)', () => {
  assert.equal(studioLegalReleaseVersion('privacy'), '2026-10-08');
  assert.equal(studioLegalReleaseVersion('privacy'), STUDIO_LEGAL_ACCEPTANCE_DOCS.privacy.version);
  assert.notEqual(studioLegalReleaseVersion('privacy'), STUDIO_LEGAL_ACCEPTANCE_DOCS.terms.version);
});

test('AGB-Freigabe: Version 2026-10-16', () => {
  assert.equal(studioLegalReleaseVersion('terms'), '2026-10-16');
  assert.equal(studioLegalReleaseVersion('terms'), STUDIO_LEGAL_ACCEPTANCE_DOCS.terms.version);
});

test('Privacy-Hash beginnt mit f8966bceddfe', () => {
  assert.match(STUDIO_LEGAL_ACCEPTANCE_DOCS.privacy.contentHash, /^f8966bceddfe/);
});
