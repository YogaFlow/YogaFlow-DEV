/**
 * Lokal dieselben Schritte wie .github/workflows/ci.yml (ohne checkout/setup/npm ci).
 *   npm run check:ci
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';
const npx = isWin ? 'npx.cmd' : 'npx';

function run(label, command, args, env = {}) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: isWin,
  });
  if (result.status !== 0) {
    console.error(`\ncheck:ci abgebrochen bei: ${label}`);
    process.exit(result.status ?? 1);
  }
}

function checkNoSecretsInRepo() {
  console.log('\n==> Keine Zugangsdaten im Repo');
  const listed = spawnSync('git', ['ls-files'], {
    cwd: root,
    encoding: 'utf8',
    shell: isWin,
  });
  if (listed.status !== 0) {
    console.error('git ls-files fehlgeschlagen');
    process.exit(1);
  }
  const files = listed.stdout.split(/\r?\n/).filter(Boolean);
  const bad = files.filter((f) => {
    if (f.endsWith('.example')) return false;
    return (
      /(^|\/)\.env(\.|$)/.test(f) ||
      /(^|\/)\.env\.deploy$/.test(f) ||
      /(^|\/)github-secrets\.txt$/.test(f)
    );
  });
  if (bad.length) {
    console.error('Diese Dateien gehören nicht ins Repo:');
    for (const f of bad) console.error(f);
    process.exit(1);
  }
  console.log('Keine Secret-Dateien im Repo.');
}

run('Typen prüfen', npx, ['tsc', '-p', 'tsconfig.app.json', '--noEmit']);
run('Lint', npm, ['run', 'lint']);
run('Stripe nur im Adapter', npm, ['run', 'check:provider-boundary']);
run('Edge-Function-Tests', npm, ['run', 'test:deno']);
run('Build', npm, ['run', 'build'], {
  VITE_SUPABASE_URL: 'https://ci-platzhalter.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'ci-platzhalter',
  VITE_APP_BASE_DOMAIN: 'example.invalid',
});
checkNoSecretsInRepo();

console.log('\ncheck:ci grün.');
