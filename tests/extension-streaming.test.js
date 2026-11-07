const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function harness(mode, translate) {
  const elements = new Map();
  class Element {
    constructor() {
      this.children = []; this.listeners = {}; this.style = { setProperty() {} };
      this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
    }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    click() { return this.listeners.click?.(); }
    appendChild(el) { this.children.push(el); if (el.id) elements.set(el.id, el); }
    insertBefore(el) { this.children.unshift(el); }
    querySelector() { return new Element(); }
    scrollTo() {}
    remove() {}
    set innerHTML(value) { this.html = value; }
    get innerHTML() { return this.html || String(this.textContent || '').replaceAll('<', '&lt;'); }
  }
  const file = mode === 'studio' ? 'extension/studio/studio.js' : 'extension/content/content.js';
  const markup = mode === 'studio' ? source('extension/studio/studio.html') : source(file);
  for (const [, id] of markup.matchAll(/id="([^"]+)"/g)) elements.set(id, new Element());
  elements.delete('zoomlive-ar-overlay-root');
  let ready, recognition, receive;
  class Recognition {
    constructor() { recognition = this; }
    start() { this.onstart?.(); }
    stop() {}
  }
  const context = {
    setTimeout, clearTimeout, console,
    window: { SpeechRecognition: Recognition, location: { hostname: 'example.com' }, addEventListener() {} },
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } },
    document: { body: new Element(), addEventListener: (_, fn) => { ready = fn; }, getElementById: id => elements.get(id), createElement: () => new Element() },
    LiveTranslator: class { translate(text) { return translate(text); } },
    MeetingCaptionsObserver: class { start() {} stop() {} },
    chrome: {
      runtime: { onMessage: { addListener(fn) { receive = fn; } } },
      tabs: { query: async () => [], sendMessage: async () => {} },
      storage: { local: { get: async () => ({}), set() {} } }
    },
    alert: message => { throw new Error(message); }
  };
  vm.runInNewContext(source(file), context);
  return { elements, initialize: () => ready?.(), recognition: () => recognition, receive: message => receive(message, {}, () => {}) };
}

test('overlay updates one row per studio segment and ignores replayed finals and late drafts', () => {
  const h = harness('overlay', async () => 'مرحبا');
  const message = { type: 'NEW_SUBTITLE', original: 'Hello', translated: 'مرحبا', segmentId: 'studio:1' };
  h.receive({ ...message, isInterim: true, revision: 1 });
  h.receive({ ...message, isInterim: false, revision: 2 });
  h.receive({ ...message, isInterim: false, revision: 2 });
  h.receive({ ...message, isInterim: true, revision: 1 });
  assert.equal(h.elements.get('zoomlive-autocue-track').children.length, 1);
});

for (const mode of ['overlay', 'studio']) {
  test(`${mode} retains final source order and ignores repeated recognition indices`, async () => {
    let resolve;
    const pending = new Promise(done => { resolve = done; });
    const h = harness(mode, text => text === 'First' ? pending : Promise.resolve('الثانية'));
    await h.initialize();
    if (mode === 'studio') { h.elements.get('btn-toggle-listen').click(); await tick(); }
    else h.receive({ type: 'START_MIC_ON_TAB' });
    const recognition = h.recognition();
    const first = Object.assign([{ transcript: 'First' }], { isFinal: true });
    const second = Object.assign([{ transcript: 'Second' }], { isFinal: true });
    recognition.onresult({ resultIndex: 0, results: [first] });
    recognition.onresult({ resultIndex: 1, results: [first, second] });
    recognition.onresult({ resultIndex: 0, results: [first, second] });
    await tick();
    resolve('الأولى');
    await tick();
    await tick();
    const rows = h.elements.get(mode === 'studio' ? 'transcript-list' : 'zoomlive-autocue-track').children;
    assert.equal(rows.length, 2);
    assert.ok(rows[mode === 'studio' ? 1 : 0].innerHTML.includes('First'));
    assert.ok(rows[mode === 'studio' ? 0 : 1].innerHTML.includes('Second'));
  });

  test(`${mode} cannot display a delayed draft after the final translation`, async () => {
    let resolve;
    const pending = new Promise(done => { resolve = done; });
    const h = harness(mode, text => text === 'Welcome to' ? pending : Promise.resolve('مرحبا بالجميع'));
    await h.initialize();
    if (mode === 'studio') { h.elements.get('btn-toggle-listen').click(); await tick(); }
    else h.receive({ type: 'START_MIC_ON_TAB' });
    const recognition = h.recognition();
    const draft = Object.assign([{ transcript: 'Welcome to' }], { isFinal: false });
    const final = Object.assign([{ transcript: 'Welcome to the meeting' }], { isFinal: true });
    recognition.onresult({ resultIndex: 0, results: [draft] });
    await delay(240);
    recognition.onresult({ resultIndex: 0, results: [final] });
    await tick();
    resolve('مرحبا');
    await tick();
    if (mode === 'studio') assert.equal(h.elements.get('current-arabic').textContent, 'مرحبا بالجميع');
    else assert.equal(h.elements.get('zoomlive-autocue-track').children.length, 1);
  });
}
