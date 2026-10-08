/**
 * CI: Hash jeder freigegebenen Vorlagen-Version muss zur Datei unter docs/legal/studio/ passen.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashLegalText } from './generate_studio_legal_templates.mjs';
import { STUDIO_LEGAL_TEMPLATE_RELEASES } from '../src/generated/studioLegalTemplates.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'docs/legal/studio');

let n = 0;
for (const kind of /** @type {const} */ (['imprint', 'terms', 'privacy'])) {
  for (const rel of STUDIO_LEGAL_TEMPLATE_RELEASES[kind]) {
    const onDisk = readFileSync(join(dir, rel.file), 'utf8');
    const hash = hashLegalText(onDisk);
    assert.equal(
      hash,
      rel.contentHash,
      `${kind} ${rel.file}: Hash weicht ab (Datei verändert nach Freigabe?)`,
    );
    assert.equal(
      hashLegalText(rel.body),
      rel.contentHash,
      `${kind} ${rel.file}: generierter Body-Hash weicht ab — generate_studio_legal_templates neu laufen`,
    );
    n += 1;
  }
}

assert.ok(n >= 3, 'mindestens Impressum/AGB/Datenschutz');
console.log(`check_studio_legal_template_hashes: ${n} Versionen ok`);
