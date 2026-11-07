const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
function clock() {
  let now = 0, next = 0;
  const timers = new Map();
  return {
    setTimeout(fn, ms) { const id = ++next; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]); now = due[1].at; due[1].fn();
      }
      now = target;
    }
  };
}
class Element {
  constructor() { this.children = []; this.listeners = {}; this.scrollTop = 0; this.clientHeight = 500; }
  appendChild(el) { this.children.push(el); el.parent = this; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  getBoundingClientRect() { return { top: 0, height: 80 }; }
  scrollTo(options) { this.lastScroll = options; }
  replaceChildren(...children) { this.children = children; }
}
function load(file, extra = {}) {
  const time = clock(), window = {};
  const context = { window, ...time, document: { createElement: () => new Element() }, ...extra };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  return { window, time };
}

test('continuous speech is committed before finalization without missing or repeated words', () => {
  const result = JSON.parse(execFileSync(process.execPath, [path.join(root, 'scripts/benchmark-streaming.js')], { encoding: 'utf8' }));
  assert.ok(result.firstCommittedMs <= 1500, JSON.stringify(result));
  assert.equal(result.sourceWords, 40);
  assert.equal(result.repeatedOrMissingWords, false);
});

test('a quiet source phrase commits once and a later final cannot replay it', () => {
  const { window, time } = load('public/js/live-segments.js');
  const phrases = [];
  const segments = new window.LiveSegments(text => phrases.push(text));
  segments.update(0, 'welcome to the meeting', false);
  time.advance(700);
  segments.update(0, 'welcome to the meeting', true);
  assert.deepEqual(phrases, ['welcome to the meeting']);
  segments.update(1, 'pending source phrase', false);
  segments.reset();
  time.advance(1000);
  assert.equal(phrases.length, 1);
});

test('autocue bounds phrases and retains old Arabic rows for scrolling', () => {
  const { window } = load('public/js/autocue.js');
  const feed = new Element();
  const player = new window.AutocuePlayer(feed);
  const paragraph = 'هذه ترجمة عربية واضحة للمحاضرة '.repeat(100).trim();
  const slides = player.split(paragraph);
  assert.ok(slides.every(slide => slide.split(/\s+/).length <= 12 && slide.length <= 110));
  assert.equal(slides.join(' '), paragraph);
  for (let i = 0; i < 100; i++) player.enqueue('عبارة مترجمة جديدة');
  for (let i = 0; i < 100; i++) player.next();
  assert.equal(feed.children.length, 100);
  assert.equal(feed.children[0].className, 'autocue-line past');
  assert.equal(feed.children.at(-1).className, 'autocue-line current');
  assert.equal(feed.children[0].children.length, 1);
  assert.equal(player.split('ا'.repeat(300)).join('').length, 300);
  player.clear();
});

test('autocue pauses, resumes, and replaces a preview while retaining past phrases', () => {
  const { window, time } = load('public/js/autocue.js');
  const feed = new Element();
  const player = new window.AutocuePlayer(feed);
  player.preview('مسودة قبل اعتماد العبارة');
  player.enqueue('العبارة الأولى');
  player.enqueue('العبارة الثانية');
  player.setPaused(true);
  time.advance(10000);
  assert.equal(feed.children[0].children[0].textContent, 'العبارة الأولى');
  player.setPaused(false);
  time.advance(1500);
  assert.equal(feed.children.at(-1).children[0].textContent, 'العبارة الثانية');
  assert.equal(feed.children.length, 2);
  player.clear();
  time.advance(10000);
  assert.equal(feed.children.length, 0);
});

test('paused autocue holds the last visible slide even after its reading timer expired', () => {
  const { window, time } = load('public/js/autocue.js');
  const feed = new Element();
  const player = new window.AutocuePlayer(feed);
  player.enqueue('المقطع السابق');
  time.advance(10000);
  player.setPaused(true);
  player.enqueue('المقطع التالي');
  assert.equal(feed.children[0].children[0].textContent, 'المقطع السابق');
  player.setPaused(false);
  assert.equal(feed.children.at(-1).children[0].textContent, 'المقطع التالي');
  player.clear();
});


test('manual history browsing disables follow without losing new phrases, and resume recenters', () => {
  const { window, time } = load('public/js/autocue.js');
  const feed = new Element(), viewport = new Element(), following = [];
  const player = new window.AutocuePlayer(feed, viewport, enabled => following.push(enabled));
  player.enqueue('النص الحالي');
  const initialScroll = viewport.lastScroll;
  viewport.listeners.wheel();
  player.enqueue('نص يصل أثناء قراءة القديم');
  time.advance(5000);
  assert.equal(feed.children.length, 2);
  assert.equal(player.following, false);
  assert.equal(viewport.lastScroll, initialScroll);
  player.setFollowing(true);
  assert.notEqual(viewport.lastScroll, initialScroll);
  assert.deepEqual(following, [false, true]);
  player.clear();
});
