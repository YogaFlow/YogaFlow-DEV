/**
 * Sitzungswächter: Klassifizierer, einmaliger Ablauf, Rücksprung.
 *
 *   node --test scripts/test/session_guard.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isSessionError,
  loginSearchForReturn,
  resetForcedSignOutForTests,
  runForcedSignOutOnce,
  safeReturnPath,
} from '../../src/lib/sessionRules.mjs';

test('session_not_found ist ein Sitzungsfehler', () => {
  assert.equal(isSessionError({ code: 'session_not_found' }), true);
});

test('Auth session missing ist ein Sitzungsfehler', () => {
  assert.equal(isSessionError({ message: 'Auth session missing!', status: 400 }), true);
});

test('PGRST301 (JWT abgelaufen) ist ein Sitzungsfehler', () => {
  assert.equal(
    isSessionError({
      status: 401,
      code: 'PGRST301',
      message: 'JWT expired',
      source: 'postgrest',
    }),
    true,
  );
});

test('401 von einer Function ist ein Sitzungsfehler', () => {
  assert.equal(
    isSessionError({
      status: 401,
      code: 'invalid_token',
      message: 'Anmeldung ungültig',
      source: 'function',
    }),
    true,
  );
});

test('401 und 403 von /auth/v1/user sind Sitzungsfehler', () => {
  assert.equal(isSessionError({ status: 401, source: 'auth_user' }), true);
  assert.equal(isSessionError({ status: 403, source: 'auth_user' }), true);
});

test('42501 ist kein Sitzungsfehler', () => {
  assert.equal(
    isSessionError({
      status: 401,
      code: '42501',
      message: 'permission denied for function register_for_course',
      source: 'postgrest',
    }),
    false,
  );
});

test('403 von PostgREST mit Rechte-Code ist kein Sitzungsfehler', () => {
  assert.equal(
    isSessionError({
      status: 403,
      code: '42501',
      message: 'permission denied for table users',
      source: 'postgrest',
    }),
    false,
  );
});

test('Validierung ist kein Sitzungsfehler', () => {
  assert.equal(
    isSessionError({
      status: 400,
      code: 'password_too_short',
      message: 'Das Passwort muss mindestens 8 Zeichen lang sein.',
      source: 'function',
    }),
    false,
  );
});

test('Netzwerk ist kein Sitzungsfehler', () => {
  assert.equal(
    isSessionError({ source: 'network', message: 'Failed to fetch' }),
    false,
  );
});

test('drei gleichzeitige Fehler lösen den Abmelde-Ablauf nur einmal aus', async () => {
  resetForcedSignOutForTests();
  let runs = 0;
  const results = await Promise.all([
    runForcedSignOutOnce(async () => {
      runs += 1;
    }),
    runForcedSignOutOnce(async () => {
      runs += 1;
    }),
    runForcedSignOutOnce(async () => {
      runs += 1;
    }),
  ]);
  assert.deepEqual(results, [true, false, false]);
  assert.equal(runs, 1);
});

test('Rücksprung lehnt fremde Hosts ab', () => {
  assert.equal(safeReturnPath('https://fremd.example/users'), null);
  assert.equal(safeReturnPath('https://fremd.example'), null);
  assert.equal(safeReturnPath('//fremd.example/users'), null);
  const params = new URLSearchParams(loginSearchForReturn('https://fremd.example/phish'));
  assert.equal(params.get('signed_out'), '1');
  assert.equal(params.get('next'), null);
  assert.equal(safeReturnPath('/users'), '/users');
  assert.equal(new URLSearchParams(loginSearchForReturn('/users?tab=1')).get('next'), '/users?tab=1');
});
