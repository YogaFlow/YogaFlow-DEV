#!/usr/bin/env node
/**
 * Führt die Geldkette-Regressionstests nacheinander aus.
 * Zwischen den Skripten 5 s Pause. Bei Auth-Rate-Limit einmal 60 s warten und neu.
 * Bricht beim ersten dauerhaft roten Skript ab und gibt eine Übersicht aus.
 *
 * Verwendung: npm run test:geldkette
 *             node scripts/test/run_geldkette.mjs
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const PAUSE_MS = 5000;
const RETRY_WAIT_MS = 60_000;

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
  'a6_3_reverse.mjs',
  'a7_1_ledger.mjs',
  'a7_2_export.mjs',
  'a8_1_bulk_waive.mjs',
  'a9_cancel.mjs',
  'a5_teacher_guard.mjs',
  's4_3_remove_member.mjs',
  's4_3_delete_user_fn.mjs',
  'security_signup_role.mjs',
  's1_2a_provider_schema.mjs',
  's2_1b_a_pending.mjs',
  's2_1b_b_promotion.mjs',
  's2_2a_1_online_payment.mjs',
];

function sleepMs(ms) {
  const ia = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(ia, 0, 0, ms);
}

function isRateLimit(text) {
  return /rate limit|over_request_rate_limit|\b429\b/i.test(text ?? '');
}

function runSkript(datei) {
  const ergebnis = spawnSync(process.execPath, [join(root, 'scripts', 'test', datei)], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  });

  const stdout = ergebnis.stdout ?? '';
  const stderr = ergebnis.stderr ?? '';
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  const code = ergebnis.status ?? 1;
  const ok = code === 0 && !ergebnis.error;
  const output = stdout + stderr + (ergebnis.error?.message ?? '');
  return { ok, code, rateLimit: !ok && isRateLimit(output) };
}

/** @type {{ datei: string, label: string }[]} */
const ergebnisse = [];

for (let i = 0; i < SKRIPTE.length; i++) {
  const datei = SKRIPTE[i];

  if (i > 0) {
    console.log(`\n  … ${PAUSE_MS / 1000} s Pause …\n`);
    sleepMs(PAUSE_MS);
  }

  console.log('\n════════════════════════════════════════');
  console.log(`  ${datei}`);
  console.log('════════════════════════════════════════\n');

  let lauf = runSkript(datei);

  if (!lauf.ok && lauf.rateLimit) {
    console.error(
      `\n  Rate-Limit bei ${datei} — warte ${RETRY_WAIT_MS / 1000} s und versuche einmal neu …\n`
    );
    sleepMs(RETRY_WAIT_MS);
    console.log('\n════════════════════════════════════════');
    console.log(`  ${datei} (Wiederholung)`);
    console.log('════════════════════════════════════════\n');
    lauf = runSkript(datei);
    if (lauf.ok) {
      ergebnisse.push({ datei, label: 'grün nach Wiederholung' });
      continue;
    }
  }

  if (lauf.ok) {
    ergebnisse.push({ datei, label: 'grün' });
  } else {
    ergebnisse.push({ datei, label: 'rot' });
    console.error(`\n  Abbruch bei ${datei} (Exit ${lauf.code})\n`);
    break;
  }
}

console.log('\n── Übersicht ──');
for (const e of ergebnisse) {
  console.log(`  ${e.label.padEnd(22)}  ${e.datei}`);
}
const offen = SKRIPTE.filter((d) => !ergebnisse.some((e) => e.datei === d));
for (const d of offen) {
  console.log(`  ${'—'.padEnd(22)}  ${d} (nicht gelaufen)`);
}

const alleGruen =
  ergebnisse.length === SKRIPTE.length &&
  ergebnisse.every((e) => e.label === 'grün' || e.label === 'grün nach Wiederholung');
process.exit(alleGruen ? 0 : 1);
