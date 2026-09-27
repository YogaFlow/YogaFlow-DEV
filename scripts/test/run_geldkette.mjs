#!/usr/bin/env node
/**
 * Führt die Geldkette-Regressionstests nacheinander aus.
 * Bricht beim ersten roten Skript ab und gibt eine Übersicht aus.
 *
 * Verwendung: npm run test:geldkette
 *             node scripts/test/run_geldkette.mjs
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const SKRIPTE = [
  'a1_soft_cancel.mjs',
  'a2_visibility.mjs',
  'a2_coverage.mjs',
  'a2_waived.mjs',
  'a3_payments.mjs',
  'a4_pass_products.mjs',
  'a5_passes.mjs',
  'a6_1_foundation.mjs',
  'a6_2_redeem.mjs',
  'a9_cancel.mjs',
  's4_3_remove_member.mjs',
  's4_3_delete_user_fn.mjs',
  'security_signup_role.mjs',
];

const ergebnisse = [];

for (const datei of SKRIPTE) {
  console.log('\n════════════════════════════════════════');
  console.log(`  ${datei}`);
  console.log('════════════════════════════════════════\n');

  const ergebnis = spawnSync(process.execPath, [join(root, 'scripts', 'test', datei)], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });

  const code = ergebnis.status ?? 1;
  const ok = code === 0 && !ergebnis.error;
  ergebnisse.push({ datei, ok, code });

  if (!ok) {
    console.error(`\n  Abbruch bei ${datei} (Exit ${code})\n`);
    break;
  }
}

console.log('\n── Übersicht ──');
for (const e of ergebnisse) {
  console.log(`  ${e.ok ? 'grün' : 'rot '}  ${e.datei}`);
}
const offen = SKRIPTE.filter((d) => !ergebnisse.some((e) => e.datei === d));
for (const d of offen) {
  console.log(`  —     ${d} (nicht gelaufen)`);
}

const alleGruen = ergebnisse.length === SKRIPTE.length && ergebnisse.every((e) => e.ok);
process.exit(alleGruen ? 0 : 1);
