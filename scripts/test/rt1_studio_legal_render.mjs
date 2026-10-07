/**
 * RT-1 — Render-Matrix Studio-Rechtstexte (keine Platzhalter-Reste).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatCancellationHoursLabel,
  formatSubprocessorsList,
  renderStudioLegalTemplate,
} from '../../src/lib/studioLegalRender.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const imprint = readFileSync(join(root, 'docs/legal/studio/impressum.v1.md'), 'utf8');
const terms = readFileSync(join(root, 'docs/legal/studio/agb.v1.md'), 'utf8');
const privacy = readFileSync(join(root, 'docs/legal/studio/datenschutz.v1.md'), 'utf8');
const sub = JSON.parse(readFileSync(join(root, 'docs/legal/subprocessors.json'), 'utf8'));

const subprocessors_list = formatSubprocessorsList(sub.items, sub.guarantee);

function base(over = {}) {
  return {
    studio_name: 'Yoga Mitte',
    legal_name: 'Anna Beispiel',
    legal_form_label: '',
    representatives: '',
    street: 'Blumenweg',
    house_number: '3',
    postal_code: '12345',
    city: 'Berlin',
    country: 'Deutschland',
    contact_email: 'studio@example.com',
    phone: '',
    register_court: '',
    register_number: '',
    vat_id: '',
    economic_id: '',
    studio_url: 'https://demo.omlify.de',
    cancellation_hours: formatCancellationHoursLabel(24),
    tax_small_business: true,
    pay_online: true,
    pay_onsite: true,
    passes_any: true,
    passes_online: true,
    extra_rules: '',
    stand_date: '5. Oktober 2026',
    subprocessors_list,
    ...over,
  };
}

const regimes = [true, false];
const pays = [
  { pay_online: true, pay_onsite: false },
  { pay_online: false, pay_onsite: true },
  { pay_online: true, pay_onsite: true },
];
const passes = [
  { passes_any: false, passes_online: false },
  { passes_any: true, passes_online: false },
  { passes_any: true, passes_online: true },
];

let n = 0;
for (const tax_small_business of regimes) {
  for (const pay of pays) {
    for (const pass of passes) {
      const values = base({ tax_small_business, ...pay, ...pass });
      for (const [name, tpl] of [
        ['imprint', imprint],
        ['terms', terms],
        ['privacy', privacy],
      ]) {
        const out = renderStudioLegalTemplate(tpl, values);
        assert.ok(!out.includes('{{'), `${name} Platzhalter-Reste`);
        assert.ok(!out.includes('health_notes'), 'health_notes weg');
        if (name === 'terms' && pass.passes_any === false) {
          assert.ok(!out.includes('Kurskarten'), 'ohne Karten kein Abschnitt 8');
        }
        if (name === 'terms' && pay.pay_onsite) {
          assert.match(out, /dürfen wir weiterhin verlangen/);
          assert.ok(!out.includes('bleibt geschuldet'));
        }
        n += 1;
      }
    }
  }
}

const withExtra = renderStudioLegalTemplate(
  terms,
  base({ extra_rules: 'Bitte Handtuch mitbringen <script>' }),
);
assert.match(withExtra, /Bitte Handtuch mitbringen &lt;script&gt;/);
assert.match(withExtra, /Weitere Regeln von Yoga Mitte/);

console.log(`rt1_studio_legal_render OK (${n} Kombinationen)`);
