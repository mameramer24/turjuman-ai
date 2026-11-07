const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const root = path.join(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

function serverHarness(fetch) {
  const routes = new Map();
  const app = { use() {}, get() {}, post: (url, fn) => routes.set(url, fn) };
  const express = Object.assign(() => app, { json() {}, static() {} });
  vm.runInNewContext(source('server.js'), {
    fetch, AbortController, setTimeout, clearTimeout, console: { log() {}, warn() {} }, process: { env: {} }, __dirname: root,
    require(name) {
      if (name === 'dotenv') return { config() {} };
      if (name === 'express') return express;
      if (name === 'cors') return () => {};
      if (name === 'http') return { createServer: () => ({ listen() {} }) };
      if (name === 'ws') return { WebSocket: { OPEN: 1 }, WebSocketServer: EventEmitter };
      return require(name);
    }
  });
  return async body => {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
    await routes.get('/api/translate')({ body }, res);
    return res;
  };
}

test('API rejects malformed translation input before contacting a provider', async () => {
  let requests = 0;
  const request = serverHarness(() => { requests++; throw new Error(); });
  for (const body of [{ text: 12 }, { text: 'a', engine: 'unknown' }, { text: 'a', from: {} }, { text: 'a', apiKey: {} }, { text: 'a'.repeat(8001) }, null]) {
    assert.equal((await request(body)).code, 400);
  }
  assert.equal(requests, 0);
});

test('API failures are not cached as English translations, allowing a later retry', async () => {
  let available = false;
  const request = serverHarness(async () => {
    if (!available) throw new Error('offline');
    return { ok: true, json: async () => ['مرحبا'] };
  });
  assert.equal((await request({ text: 'Hello' })).code, 503);
  available = true;
  const retry = await request({ text: 'Hello' });
  assert.equal(retry.code, 200);
  assert.equal(retry.data.translated, 'مرحبا');
  const cached = await request({ text: 'Hello' });
  assert.equal(cached.data.engine, 'instant');
  assert.equal(cached.data.cached, true);
});

test('a personal API key does not receive a different client cached translation', async () => {
  const request = serverHarness(async url => ({ ok: true, json: async () => url.includes('generativelanguage') ?
    { candidates: [{ content: { parts: [{ text: 'ترجمة شخصية' }] } }] } : ['ترجمة عامة'] }));
  assert.equal((await request({ text: 'Hello' })).data.translated, 'ترجمة عامة');
  assert.equal((await request({ text: 'Hello', apiKey: 'test-key' })).data.translated, 'ترجمة شخصية');
  assert.equal((await request({ text: 'Hello' })).data.translated, 'ترجمة عامة');
});

function translatorHarness(fetch, timers = {}) {
  const window = {};
  vm.runInNewContext(source('public/js/ai-translator.js'), {
    window, fetch, AbortController, console,
    setTimeout: timers.setTimeout || setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem() {} }
  });
  return new window.AITranslator();
}

test('client coalesces identical requests and preserves the actual engine on cache hits', async () => {
  let requests = 0;
  const translator = translatorHarness(async () => {
    requests++;
    return { ok: true, json: async () => ({ translated: 'مرحبا', engine: 'gemini' }) };
  });
  const results = await Promise.all([translator.translate('Hello'), translator.translate('Hello')]);
  assert.equal(requests, 1);
  assert.equal(results[0].translated, results[1].translated);
  assert.equal((await translator.translate('Hello')).engine, 'gemini');
});

test('client reports complete provider failure without speaking or caching source text', async () => {
  let requests = 0;
  const translator = translatorHarness(async () => { requests++; throw new Error('offline'); });
  assert.equal((await translator.translate('Hello')).engine, 'failed');
  assert.equal((await translator.translate('Hello')).translated, '');
  assert.equal(requests, 6, 'retry must not reuse a failed translation');
});

test('network timeout also aborts a response body that never arrives', async () => {
  const translator = translatorHarness(async (_, { signal }) => ({ ok: true,
    json: () => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))
  }), { setTimeout: fn => setTimeout(fn, 5) });
  assert.equal((await translator.translate('Hello')).engine, 'failed');
});

test('extension translation failure stays retryable and does not return English as Arabic', async () => {
  let available = false, requests = 0;
  const window = {};
  vm.runInNewContext(source('extension/utils/translator.js'), {
    window, AbortController, setTimeout, clearTimeout, console: { warn() {} },
    fetch: async () => {
      requests++;
      if (!available) throw new Error('offline');
      return { ok: true, json: async () => [[['مرحبا']]] };
    }
  });
  const translator = new window.LiveTranslator();
  assert.equal(await translator.translate('Hello'), '');
  available = true;
  assert.equal(await translator.translate('Hello'), 'مرحبا');
  assert.equal(requests, 2);
});
