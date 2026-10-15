/**
 * Worker-Hülle: Navigation → index.html, fehlende Datei → 404 ohne immutable.
 *
 *   node --experimental-strip-types --test scripts/test/asset_shell.test.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker, { isSpaNavigation } from '../../src/worker.ts';

const STUDIO = 'https://demoalpha.omlify-dev.de';

function assets(files: Record<string, { body: string; type: string; cache?: string }>) {
  const calls: string[] = [];
  return {
    calls,
    async fetch(input: Request | URL) {
      const url = input instanceof URL ? input : new URL((input as Request).url);
      calls.push(url.pathname);
      const hit = files[url.pathname];
      if (!hit) {
        return new Response('<!doctype html><title>fallback</title>', {
          status: 404,
          headers: {
            'content-type': 'text/html',
            'cache-control': 'public, max-age=31536000, immutable',
          },
        });
      }
      return new Response(hit.body, {
        status: 200,
        headers: {
          'content-type': hit.type,
          'cache-control': hit.cache ?? 'public, max-age=31536000, immutable',
        },
      });
    },
  };
}

test('Navigation /courses liefert index.html mit no-cache', async () => {
  const env = {
    ASSETS: assets({
      '/index.html': { body: '<!doctype html><script src="/assets/index-abc.js"></script>', type: 'text/html' },
    }),
  };
  const response = await worker.fetch(new Request(`${STUDIO}/courses`), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/);
  assert.equal(response.headers.get('cache-control'), 'no-cache');
  assert.match(await response.text(), /index-abc\.js/);
  assert.deepEqual(env.ASSETS.calls, ['/courses', '/index.html']);
});

test('fehlendes /assets/x.js ist 404 ohne HTML und ohne immutable', async () => {
  const env = { ASSETS: assets({}) };
  const response = await worker.fetch(new Request(`${STUDIO}/assets/x.js`), env);
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('content-type'), null);
  assert.equal(await response.text(), '');
  assert.deepEqual(env.ASSETS.calls, ['/assets/x.js']);
});

test('/foo.js mit Accept text/html ist 404, nicht die Hülle', async () => {
  const env = { ASSETS: assets({ '/index.html': { body: '<!doctype html>', type: 'text/html' } }) };
  const response = await worker.fetch(
    new Request(`${STUDIO}/foo.js`, { headers: { Accept: 'text/html' } }),
    env,
  );
  assert.equal(isSpaNavigation(new Request(`${STUDIO}/foo.js`, { headers: { Accept: 'text/html' } })), false);
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(await response.text(), '');
  assert.deepEqual(env.ASSETS.calls, ['/foo.js']);
});

test('vorhandenes Asset wird durchgereicht', async () => {
  const env = {
    ASSETS: assets({
      '/favicon.svg': { body: '<svg></svg>', type: 'image/svg+xml' },
    }),
  };
  const response = await worker.fetch(new Request(`${STUDIO}/favicon.svg`), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/svg+xml');
  assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(await response.text(), '<svg></svg>');
});

test('version.json bekommt no-cache', async () => {
  const env = {
    ASSETS: assets({
      '/version.json': { body: '{"build":"abc"}\n', type: 'application/json', cache: 'public, max-age=31536000, immutable' },
    }),
  };
  const response = await worker.fetch(new Request(`${STUDIO}/version.json`), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-cache');
  assert.equal(await response.text(), '{"build":"abc"}\n');
});
