# Continuous speech latency

Measured 2026-11-07 with `scripts/benchmark-streaming.js`, using the same virtual recognition fixture (40 words, interim events at 0/300/600/900ms, browser final at 8000ms). The benchmark asserts that no committed source words are repeated or lost.

| Change | Before | After | Verdict |
| --- | --- | --- | --- |
| Commit stable source phrases before browser finalization | First phrase 8000ms; one 40-word paragraph | First phrase 300ms; four bounded phrases | Kept; source order and all 40 words preserved |

Reproduce baseline from commit `082570e` without changing the working tree:

```sh
git show 082570e:public/js/speech-engine.js > /tmp/turjuman-baseline-speech.js
SPEECH_ENGINE_SOURCE=/tmp/turjuman-baseline-speech.js node scripts/benchmark-streaming.js
node scripts/benchmark-streaming.js
```

This measures the recognition-to-commit wait, not total network translation or audible latency. The regression budget is <=1500ms in this fixture. The live fallback probe returned HTTP 200 audio/mpeg (9600 bytes, 0.68s) for a public Arabic word; one sample does not establish provider latency or reliability.

The app no longer translates each uncommitted interim revision. Only accepted source phrases enter the translation queue. Provider round trips, native voice availability and iOS audio policy still need device/field measurements. A fresh browser UI audio test observed the playback-start event, and separate tests cover blocked playback, cancellation, missing Arabic voice, and no replay after partial speech.
