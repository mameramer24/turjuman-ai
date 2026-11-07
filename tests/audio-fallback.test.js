const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const tick = () => new Promise(resolve => setImmediate(resolve));

function audioHarness() {
  let audio, blocked = false, resolveResponse;
  const requests = [], errors = [], states = [], revoked = [];
  class Audio {
    constructor() { audio = this; }
    play() {
      if (this.src?.startsWith('blob:')) {
        if (blocked) return Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
        this.onplaying?.();
      }
      return Promise.resolve();
    }
    pause() {}
  }
  const response = { ok: true, headers: { get: () => 'audio/mpeg' }, blob: async () => ({}) };
  const window = {};
  const context = {
    window, Audio, AbortController, navigator: {}, console: { warn() {} },
    setTimeout, clearTimeout,
    URL: { createObjectURL: () => 'blob:arabic', revokeObjectURL: url => revoked.push(url) },
    fetch: async (_, options) => {
      requests.push(JSON.parse(options.body).text);
      if (resolveResponse === 'hold') return new Promise(resolve => { resolveResponse = resolve; });
      return response;
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/speech-engine.js'), 'utf8'), context);
  const engine = new window.SpeechEngine({ onSpeechError: error => errors.push(error), onSpeakingState: active => states.push(active) });
  return { engine, requests, errors, states, revoked, audio: () => audio,
    block(value) { blocked = value; }, hold() { resolveResponse = 'hold'; }, resolve() { resolveResponse(response); } };
}

test('missing system Arabic voice plays server audio and marks speech only when playback starts', async () => {
  const h = audioHarness();
  h.engine.speakArabic('هذه ترجمة عربية');
  assert.equal(h.states.includes(true), false);
  await tick();
  assert.deepEqual(h.requests, ['هذه ترجمة عربية']);
  assert.equal(h.audio().volume, 1);
  assert.equal(h.audio().src, 'blob:arabic');
  assert.equal(h.states.at(-1), true);
  h.engine.stop();
  assert.deepEqual(h.revoked, ['blob:arabic']);
});

test('a blocked audio element can be enabled and retries the unheard phrase exactly once', async () => {
  const h = audioHarness();
  h.block(true);
  h.engine.speakArabic('اختبار الصوت العربي');
  await tick();
  assert.equal(h.engine.needsAudioGesture, true);
  assert.equal(h.errors[0].code, 'not-allowed');
  h.block(false);
  h.engine.setVoiceOutput(true);
  await tick();
  assert.equal(h.engine.needsAudioGesture, false);
  assert.equal(h.engine.speechQueue.length, 0);
  assert.deepEqual(h.requests, ['اختبار الصوت العربي', 'اختبار الصوت العربي']);
  h.engine.stop();
});

test('muting while Arabic audio is downloading prevents late playback', async () => {
  const h = audioHarness();
  h.hold();
  h.engine.speakArabic('عبارة متأخرة');
  h.engine.setVoiceOutput(false);
  h.resolve();
  await tick();
  assert.equal(h.states.includes(true), false);
  assert.equal(h.engine.activeSpeech, null);
  assert.equal(h.engine.speechQueue.length, 0);
});

test('speech phrases are bounded without losing or repeating Arabic text', async () => {
  const h = audioHarness();
  const text = 'ترجمة عربية واضحة '.repeat(30).trim();
  h.engine.speakArabic(text);
  assert.ok([...h.requests, ...h.engine.speechQueue].every(part => part.length <= 180));
  assert.equal([...h.requests, ...h.engine.speechQueue].join(' '), text);
  await tick();
  h.engine.stop();
});

test('audio that already started is not replayed after a playback error', async () => {
  const h = audioHarness();
  h.engine.speakArabic('عبارة بدأ نطقها بالفعل');
  await tick();
  h.audio().onerror();
  h.engine.setVoiceOutput(true);
  await tick();
  assert.equal(h.requests.length, 1);
  assert.equal(h.engine.speechQueue.length, 0);
  h.engine.stop();
});
