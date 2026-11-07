const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const root = path.join(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

class Element {
  constructor() {
    this.children = [];
    this.style = { setProperty(name, value) { this[name] = value; } };
    this.listeners = {};
    this.attributes = {};
    this.parts = new Map();
    this.className = '';
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  set innerHTML(value) { this.html = value; this.children = []; }
  get innerHTML() { return this.html ?? String(this.textContent ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }
  querySelector(selector) {
    if (!this.parts.has(selector)) this.parts.set(selector, new Element());
    return this.parts.get(selector);
  }
  querySelectorAll() { return []; }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  async click() { return this.listeners.click?.({ target: this }); }
  appendChild(child) { this.children.push(child); child.parent = this; return child; }
  insertBefore(child) { this.children.unshift(child); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  scrollTo() {}
  setAttribute(name, value) { this.attributes[name] = value; }
  focus() {}
}

function appHarness(translate = async text => ({ translated: `عربي: ${text}` })) {
  const elements = new Map();
  for (const [, id] of source('public/index.html').matchAll(/id="([^"]+)"/g)) elements.set(id, new Element());
  const spoken = [];
  const broadcasts = [];
  let ready, engine, socket;
  const storage = new Map();
  const context = {
    console, setTimeout, clearTimeout, URLSearchParams, URL, Blob,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    navigator: { userAgent: 'test' },
    window: { navigator: {}, location: { pathname: '/room/test', search: '', origin: 'http://localhost' }, addEventListener() {}, matchMedia: () => ({ matches: false }) },
    document: { addEventListener: (_, fn) => { ready = fn; }, getElementById: id => elements.get(id), createElement: () => new Element() },
    AITranslator: class { constructor() { this.engine = 'auto'; } translate(...args) { return translate(...args); } },
    SpeechEngine: class {
      constructor(options) { engine = this; this.options = options; this.voiceOutputEnabled = true; this.baseRate = 1.15; }
      async start() { this.isListening = true; this.options.onStatusChange('listening'); }
      stop() { this.isListening = false; this.options.onStatusChange('stopped'); }
      speakArabic(text) { spoken.push(text); }
      setVoiceOutput(value) { this.voiceOutputEnabled = value; }
    },
    SocketClient: class {
      constructor(options) { socket = this; this.options = options; }
      connect() {}
      broadcastSubtitle(data) { broadcasts.push(data); }
    }
  };
  vm.runInNewContext(source('public/js/app.js'), context);
  ready();
  return { engine, socket, elements, spoken, broadcasts };
}

test('server delivers each subtitle to peers once without echoing to its sender', () => {
  let wss;
  const app = { use() {}, get() {}, post() {} };
  const express = Object.assign(() => app, { json() {}, static() {} });
  vm.runInNewContext(source('server.js'), {
    console, process: { env: {} }, __dirname: root, setTimeout, clearTimeout,
    require(name) {
      if (name === 'dotenv') return { config() {} };
      if (name === 'express') return express;
      if (name === 'cors') return () => {};
      if (name === 'http') return { createServer: () => ({ listen() {} }) };
      if (name === 'ws') return { WebSocket: { OPEN: 1 }, WebSocketServer: class extends EventEmitter { constructor() { super(); wss = this; } } };
      return require(name);
    }
  });
  const client = room => {
    const ws = Object.assign(new EventEmitter(), { readyState: 1, messages: [], send(data) { this.messages.push(JSON.parse(data)); } });
    wss.emit('connection', ws);
    ws.emit('message', JSON.stringify({ type: 'join', roomId: room }));
    return ws;
  };
  const sender = client('test'), peer = client('test'), other = client('other');
  sender.emit('message', JSON.stringify({ type: 'broadcast_subtitle', original: 'Hello', translated: 'مرحبا', isInterim: false }));
  assert.equal(peer.messages.filter(m => m.type === 'live_subtitle').length, 1);
  assert.equal(sender.messages.filter(m => m.type === 'live_subtitle').length, 0, 'local translation must not return as a second subtitle');
  assert.equal(other.messages.filter(m => m.type === 'live_subtitle').length, 0);
});

test('changing interim captions stay silent, then final translation is spoken exactly once', async () => {
  const h = appHarness();
  await h.elements.get('btn-main-listen').click();
  await h.engine.options.onResult({ interim: 'Welcome to the', final: '' });
  await h.engine.options.onResult({ interim: 'Welcome to the meeting', final: '' });
  assert.deepEqual(h.spoken, [], 'revisable drafts must not be read aloud');
  await h.engine.options.onResult({ interim: '', final: 'Welcome to the meeting' });
  await tick();
  assert.deepEqual(h.spoken, ['عربي: Welcome to the meeting']);
  assert.equal(h.elements.get('autocue-feed').children.length, 1);
});

test('room listeners read final subtitles once and never read cumulative drafts', () => {
  const h = appHarness();
  h.socket.options.onSubtitle({ original: 'Welcome', translated: 'مرحبا', isInterim: true, segmentId: 'a', revision: 1 });
  h.socket.options.onSubtitle({ original: 'Welcome all', translated: 'مرحبا بالجميع', isInterim: true, segmentId: 'a', revision: 2 });
  assert.deepEqual(h.spoken, []);
  const final = { original: 'Welcome all', translated: 'مرحبا بالجميع', isInterim: false, segmentId: 'a', revision: 3 };
  h.socket.options.onSubtitle(final);
  h.socket.options.onSubtitle(final);
  assert.deepEqual(h.spoken, ['مرحبا بالجميع']);
  assert.equal(h.elements.get('transcript-items-box').children.length, 1);
});

test('late draft cannot reappear after a final subtitle', async () => {
  const pending = deferred();
  const h = appHarness(text => text === 'Welcome to' ? pending.promise : Promise.resolve({ translated: 'مرحبا بكم' }));
  await h.elements.get('btn-main-listen').click();
  await h.engine.options.onResult({ interim: 'Welcome to', final: '' });
  await delay(150);
  await h.engine.options.onResult({ interim: '', final: 'Welcome to the meeting' });
  await tick();
  pending.resolve({ translated: 'مرحبا' });
  await tick();
  assert.equal(h.elements.get('autocue-feed').children.length, 1, 'old draft created an extra row after final');
  assert.equal(h.broadcasts.filter(m => m.isInterim).length, 0, 'late draft was broadcast after final');
});

test('final translations and audio retain source order when requests finish out of order', async () => {
  const first = deferred();
  const h = appHarness(text => text === 'First sentence' ? first.promise : Promise.resolve({ translated: 'الثانية' }));
  await h.elements.get('btn-main-listen').click();
  const a = h.engine.options.onResult({ interim: '', final: 'First sentence' });
  const b = h.engine.options.onResult({ interim: '', final: 'Second sentence' });
  await tick();
  first.resolve({ translated: 'الأولى' });
  await Promise.all([a, b]);
  await tick();
  assert.deepEqual(h.spoken, ['الأولى', 'الثانية']);
  assert.deepEqual(h.broadcasts.filter(m => !m.isInterim).map(m => m.original), ['First sentence', 'Second sentence']);
});

test('stopping discards an in-flight translation and its audio', async () => {
  const pending = deferred();
  const h = appHarness(() => pending.promise);
  await h.elements.get('btn-main-listen').click();
  const result = h.engine.options.onResult({ interim: '', final: 'Do not replay after stop' });
  await h.elements.get('btn-main-listen').click();
  pending.resolve({ translated: 'متوقف' });
  await result;
  await tick();
  assert.deepEqual(h.spoken, []);
  assert.equal(h.elements.get('autocue-feed').children.length, 0);
});

test('recognition does not emit an already-finalized result index twice', () => {
  const results = [];
  class Recognition { start() {} stop() {} }
  const window = { SpeechRecognition: Recognition };
  vm.runInNewContext(source('public/js/speech-engine.js'), { window, navigator: {}, console, setTimeout });
  const engine = new window.SpeechEngine({ onResult: result => results.push(result) });
  engine.setupRecognition();
  engine.isListening = true;
  engine.recognition.onstart();
  const final = Object.assign([{ transcript: 'Hello again' }], { isFinal: true });
  engine.recognition.onresult({ resultIndex: 0, results: [final] });
  engine.recognition.onresult({ resultIndex: 0, results: [final] });
  assert.equal(results.filter(result => result.final).length, 1);
});

test('intentional repetition in separate speech segments is preserved', async () => {
  const h = appHarness();
  await h.elements.get('btn-main-listen').click();
  await h.engine.options.onResult({ interim: '', final: 'Thank you' });
  await h.engine.options.onResult({ interim: '', final: 'Thank you' });
  assert.deepEqual(h.spoken, ['عربي: Thank you', 'عربي: Thank you']);
  assert.equal(h.elements.get('transcript-items-box').children.length, 2);
});

test('speech queue retains every phrase under load and cancels old callbacks on stop', async () => {
  const spoken = [];
  const synthesis = { getVoices: () => [], cancel() { this.speaking = false; }, speak(u) { this.speaking = true; spoken.push(u); } };
  const window = { speechSynthesis: synthesis };
  vm.runInNewContext(source('public/js/speech-engine.js'), {
    window, navigator: {}, console, setTimeout,
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } }
  });
  const engine = new window.SpeechEngine();
  for (let i = 0; i < 8; i++) engine.speakArabic(`Phrase ${i}`);
  for (let i = 0; i < 8; i++) {
    assert.equal(spoken[i]?.text, `Phrase ${i}`, 'queue discarded or reordered speech');
    synthesis.speaking = false;
    spoken[i].onend();
    await delay(15);
  }
  engine.speakArabic('Cancel this');
  const cancelled = spoken.at(-1);
  engine.stop();
  engine.speakArabic('New session');
  cancelled.onerror();
  await delay(15);
  assert.equal(spoken.at(-1).text, 'New session');
  assert.equal(spoken.filter(u => u.text === 'New session').length, 1);
});

test('extension observes source captions once, excluding nested duplicates and its own UI', async () => {
  const translated = [];
  const emitted = [];
  const own = { innerText: 'Own translated text', closest: () => ({}), querySelector: () => null, contains: () => false };
  const child = { innerText: 'Welcome to our meeting', closest: () => null, querySelector: () => null, contains: () => false };
  const parent = { ...child, contains: el => el === child };
  const window = { location: { hostname: 'example.com' } };
  vm.runInNewContext(source('extension/utils/captions-observer.js'), {
    window, console, setTimeout, clearTimeout,
    document: { querySelectorAll: () => [parent, child, own], body: {} },
    LiveTranslator: class { async translate(text) { translated.push(text); return 'مرحبا'; } },
    MutationObserver: class { observe() {} disconnect() {} }
  });
  const observer = new window.MeetingCaptionsObserver(data => emitted.push(data));
  observer.start();
  await observer.handleMutations([]);
  await delay(750);
  assert.deepEqual(translated, ['Welcome to our meeting']);
  assert.equal(emitted.length, 1);
  observer.stop();
});
