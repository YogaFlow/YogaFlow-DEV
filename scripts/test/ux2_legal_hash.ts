/**
 * UX-2 A2: Hash der angezeigten AVV = gespeicherte Konstante / Apex-HTML.
 *   node --experimental-strip-types --test scripts/test/ux2_legal_hash.ts
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { writeLegalHtmlPages } from '../render-legal-pages.mjs';
import {
  GENERATED_AVV_CONTENT_HASH,
  GENERATED_AVV_VERSION,
  LEGAL_DOCUMENTS,
} from '../../src/generated/legalDocuments.ts';
import { AVV_CONTENT_HASH, AVV_VERSION } from '../../src/lib/legalVersions.ts';

test('AVV-Hash: generiert = Konstante = Apex-HTML', () => {
  writeLegalHtmlPages();
  const html = readFileSync('legal/auftragsverarbeitung.html', 'utf8');
  const pageHash = createHash('sha256').update(html, 'utf8').digest('hex');
  assert.equal(pageHash, GENERATED_AVV_CONTENT_HASH);
  assert.equal(AVV_CONTENT_HASH, GENERATED_AVV_CONTENT_HASH);
  assert.equal(LEGAL_DOCUMENTS.auftragsverarbeitung.pageHash, AVV_CONTENT_HASH);
  assert.equal(AVV_VERSION, GENERATED_AVV_VERSION);
  assert.equal(LEGAL_DOCUMENTS.auftragsverarbeitung.standDate, AVV_VERSION);
  assert.ok(LEGAL_DOCUMENTS.auftragsverarbeitung.bodyHtml.includes('Art. 28'));
});
