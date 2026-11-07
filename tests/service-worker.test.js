const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8');

function worker(caches) {
  const events = {};
  vm.runInNewContext(source, {
    URL, Response, caches, fetch: async () => { throw new Error('offline'); },
    self: { location: { origin: 'https://test.local' }, addEventListener: (name, fn) => { events[name] = fn; }, clients: { claim() {} } }
  });
  return events;
}

test('offline shell resolves versioned script URLs from the precached asset', async () => {
  const cached = { body: 'cached script' };
  const events = worker({ match: async (_, options) => options?.ignoreSearch ? cached : undefined });
  let response;
  events.fetch({ request: { url: 'https://test.local/js/app.js?v=3.0', method: 'GET' }, respondWith(promise) { response = promise; } });
  assert.equal(await response, cached);
});

test('cache cleanup preserves other applications and API requests bypass the worker', async () => {
  const deleted = [];
  const events = worker({ keys: async () => ['turjuman-v2.2', 'turjuman-v3.2', 'other-app'], delete: async key => deleted.push(key) });
  let completion;
  events.activate({ waitUntil(promise) { completion = promise; } });
  await completion;
  assert.deepEqual(deleted, ['turjuman-v2.2']);
  let intercepted = false;
  events.fetch({ request: { url: 'https://test.local/api/translate', method: 'POST' }, respondWith() { intercepted = true; } });
  assert.equal(intercepted, false);
});
