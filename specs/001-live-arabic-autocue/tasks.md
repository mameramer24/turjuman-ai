# Tasks: Live Arabic interpreter and autocue

## Setup and regression
- [x] T001 Initialize Spec Kit with events disabled and record scope in spec.md.
- [x] T002 Reproduce paused synthesis, hidden errors and English text in tests/live-translation.test.js.
- [x] T003 Add timed continuous-input benchmark in scripts/benchmark-streaming.js.

## US1: Audible Arabic
- [x] T004 Fix gesture/resume/start/error/cancel lifecycle in public/js/speech-engine.js.
- [x] T005 Add validated bounded POST /api/speech fallback in server.js with tests.
- [x] T006 Add audio test/recovery feedback in public/js/app.js and public/index.html.

## US2: Arabic autocue
- [x] T007 Implement one-slide Arabic queue in public/js/autocue.js with pause and long-text tests.
- [x] T008 Replace paragraph feed in public/js/app.js and public/css/style.css; preserve transcript/export.

## US3: Lower latency
- [x] T009 Add stable-prefix phrase commitment in public/js/live-segments.js and wire recognition.
- [x] T010 Compare the fixed fixture before/after; keep source-order and replay tests.

## Final checks
- [x] T011 Update shell assets, README and smoke checks; run all tests and inspect mobile/desktop UI.
- [x] T012 Commit and push the verified change; state real iPhone audio coverage accurately.

Dependencies: T002 -> T004/T005 -> T006; T007 -> T008; T003 -> T009 -> T010; all -> T011 -> T012. Independent file work may be sequenced without agents. Deliver incremental repairs, then integrated validation.

Validation evidence: 40 passing tests, syntax for 22 JavaScript files, real HTTP/WebSocket/translation/MP3 smoke checks; browser audio start and end observed, Arabic-only single-slide view at 390px and 1280px with no horizontal overflow. Final screenshot capture became unavailable after local browser use was disabled in Work settings. Physical iPhone audio remains unverified.

Published implementation commit: `5205a3c` on `origin/main`. GitHub push returned success.
