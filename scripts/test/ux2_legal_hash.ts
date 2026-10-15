/**
 * UX-2/UX-4: AVV-Hash = normalisierter Markdown (nicht HTML-Layout).
 *   node --experimental-strip-types --test scripts/test/ux2_legal_hash.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  hashLegalMarkdown,
  stripImplementationNotes,
  writeLegalHtmlPages,
} from '../render-legal-pages.mjs';
import {
  GENERATED_AVV_CONTENT_HASH,
  GENERATED_AVV_VERSION,
  LEGAL_DOCUMENTS,
} from '../../src/generated/legalDocuments.ts';
import { AVV_CONTENT_HASH, AVV_VERSION } from '../../src/lib/legalVersions.ts';

test('AVV-Hash: generiert = Konstante = normalisierter Markdown', () => {
  writeLegalHtmlPages();
  const md = readFileSync('docs/legal/AVV_Auftragsverarbeitung.md', 'utf8');
  const stripped = stripImplementationNotes(md);
  const mdHash = hashLegalMarkdown(stripped);
  assert.equal(mdHash, GENERATED_AVV_CONTENT_HASH);
  assert.equal(AVV_CONTENT_HASH, GENERATED_AVV_CONTENT_HASH);
  assert.equal(LEGAL_DOCUMENTS.auftragsverarbeitung.pageHash, AVV_CONTENT_HASH);
  assert.equal(AVV_VERSION, GENERATED_AVV_VERSION);
  assert.equal(LEGAL_DOCUMENTS.auftragsverarbeitung.standDate, AVV_VERSION);
  assert.ok(LEGAL_DOCUMENTS.auftragsverarbeitung.bodyHtml.includes('Art. 28'));
  assert.ok(
    LEGAL_DOCUMENTS.auftragsverarbeitung.bodyHtml.includes(
      'Zahlungsdienstleister des Verantwortlichen',
    ),
  );
  assert.notEqual(
    mdHash,
    '081aa26d9251f364dd5594c4f3ddf5786c57bdb813ba1bcbf0f5c17208d639c5',
  );
});
