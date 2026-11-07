# Implementation Plan: Live Arabic interpreter and autocue

## Summary
Keep the existing Node/Express/vanilla JS stack and IBM fonts. Repair playback state and introduce a bounded phrase segmenter and scrollable reading track. Native Arabic synthesis is preferred; a fixed-host audio proxy provides fallback when device voices fail.

## Technical Context
Node >=18, Express 4, ws 8; browser Web Speech and HTMLAudioElement. No new dependency, database or migration.

## Constitution Check
Installed constitution is an unratified template; user AGENTS.md governs: targeted changes, measured performance, regression tests and browser verification. Canonical specs are kept here. No native events or agent delegation.

## Phase 0: Research
See research.md. Failing tests reproduce paused synthesis, swallowed speech errors and English content occupying the live view. Timed continuous-speech fixture establishes finalization delay before changing segmentation.

## Phase 1: Design
- public/js/speech-engine.js: playback state, gesture recovery, cancellation and fallback.
- public/js/live-segments.js: stable source-prefix commitment, final-tail handling and bounded phrases.
- public/js/autocue.js: one Arabic slide, timed advancement and pause/reduced-motion support.
- public/js/app.js: preserve ordered commits and room deduplication; use the player, expose audio feedback/test.
- server.js: additive POST /api/speech with validation and fixed upstream.
- public/index.html, css/style.css, sw.js: Arabic-only stage, motion and asset refresh.

## Verification
Node regression tests; same virtual-time recognition benchmark before/after; real translation/audio HTTP smoke; mobile/desktop screenshots; production push after checks under existing user authorization. Physical iPhone audio remains a hardware verification gap.

User refinement: retain prior phrases at 50% opacity, center the current phrase at 100%, and suspend viewport following on manual input with contextual return-to-live. Regression tests cover retained rows and follow/resume. Browser verification of this refinement is unavailable while local browser use is disabled in Work settings.
