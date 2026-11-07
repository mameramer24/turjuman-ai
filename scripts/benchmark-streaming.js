const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
let now = 0, nextId = 0;
const timers = new Map(), commits = [];
const window = { SpeechRecognition: class { start() {} stop() {} } };
const context = vm.createContext({ window, navigator: {}, console: { warn() {} },
  setTimeout(fn, ms) { const id = ++nextId; timers.set(id, { at: now + ms, fn }); return id; },
  clearTimeout(id) { timers.delete(id); }
});
vm.runInContext(fs.readFileSync(path.join(root, 'public/js/live-segments.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(process.env.SPEECH_ENGINE_SOURCE || path.join(root, 'public/js/speech-engine.js'), 'utf8'), context);
const engine = new window.SpeechEngine({ onResult: result => { if (result.final) commits.push({ at: now, text: result.final }); } });
engine.setupRecognition(); engine.isListening = true; engine.recognition.onstart();
const words = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree twentyfour twentyfive twentysix twentyseven twentyeight twentynine thirty thirtyone thirtytwo thirtythree thirtyfour thirtyfive thirtysix thirtyseven thirtyeight thirtynine forty'.split(' ');
function advance(target) {
  for (;;) {
    const due = [...timers].filter(([, value]) => value.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
    if (!due) break;
    timers.delete(due[0]); now = due[1].at; due[1].fn();
  }
  now = target;
}
for (const [at, count, final] of [[0,12,false],[300,16,false],[600,24,false],[900,32,false],[8000,40,true]]) {
  advance(at);
  const result = Object.assign([{ transcript: words.slice(0, count).join(' ') }], { isFinal: final });
  engine.recognition.onresult({ resultIndex: 0, results: [result] });
}
const combined = commits.map(item => item.text).join(' ');
if (combined !== words.join(' ')) throw new Error('Committed speech has missing or repeated source words');
console.log(JSON.stringify({ firstCommittedMs: commits[0]?.at, finalEventMs: 8000, committedPhrases: commits.length, sourceWords: words.length, repeatedOrMissingWords: false }));
engine.stop();
