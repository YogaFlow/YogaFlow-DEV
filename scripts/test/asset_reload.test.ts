/**
 * Reload-Schleifenschutz für fehlende Bundles.
 *
 *   node --experimental-strip-types --test scripts/test/asset_reload.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  ASSET_RELOAD_STOPPED_TEXT,
  ASSET_RELOAD_STORAGE_KEY,
  ASSET_RELOAD_WINDOW_MS,
  assetReloadAction,
  decideAssetReload,
} from '../../src/lib/assetReload.ts';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem(key: string) {
      return values.has(key) ? values.get(key)! : null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

test('ohne Stempel wird neu geladen', () => {
  assert.equal(decideAssetReload(1_000, null), 'reload');
  const storage = memoryStorage();
  assert.equal(assetReloadAction(storage, 1_000), 'reload');
  assert.equal(storage.values.get(ASSET_RELOAD_STORAGE_KEY), '1000');
});

test('zweiter Fehler im Zeitfenster stoppt', () => {
  const storage = memoryStorage();
  assert.equal(assetReloadAction(storage, 5_000), 'reload');
  assert.equal(assetReloadAction(storage, 5_000 + ASSET_RELOAD_WINDOW_MS - 1), 'stop');
});

test('nach dem Zeitfenster darf wieder neu geladen werden', () => {
  const storage = memoryStorage();
  assert.equal(assetReloadAction(storage, 5_000), 'reload');
  assert.equal(assetReloadAction(storage, 5_000 + ASSET_RELOAD_WINDOW_MS), 'reload');
});

test('Speicherfehler stoppt ohne Schleife', () => {
  const storage = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
  };
  assert.equal(assetReloadAction(storage, 1), 'stop');
});

test('index.html enthält denselben Schlüssel, dasselbe Fenster und denselben Hinweis', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(html, new RegExp(ASSET_RELOAD_STORAGE_KEY));
  assert.match(html, new RegExp(String(ASSET_RELOAD_WINDOW_MS)));
  assert.ok(html.includes(ASSET_RELOAD_STOPPED_TEXT));
  assert.match(html, /vite:preloadError/);
  assert.match(html, /\/assets\//);
});
