# Feature Specification: Live Arabic interpreter and autocue

**Created**: 2026-11-07 | **Status**: Approved scope from user conversation

## User Scenarios & Testing

### User Story 1 — Hear Arabic speech (Priority: P1)
A listener enables audio and hears each committed phrase once. Paused synthesis resumes; missing Arabic voices use an Arabic audio fallback; blocked playback exposes a recovery action and an audio test.
Acceptance: simulated pause, missing voice, denied playback, mute, stop and resumed playback preserve ordering and surface errors. A live fallback endpoint returns playable Arabic audio. Physical iPhone speaker verification is reported separately.

### User Story 2 — Read an Arabic autocue (Priority: P1)
The reading surface shows one short Arabic slide with a quiet vertical transition, with no English source text. Long translations become multiple timed slides, while the transcript remains in settings.
Acceptance: each slide <=12 words (or <=110 characters for a long token), one visible slide, no horizontal overflow at 390px and 1280px, paused progression and reduced motion respected.

### User Story 3 — Translate continuous speech promptly (Priority: P1)
Stable prefixes of continuous recognition are committed as bounded phrases before the browser finalizes a paragraph. Final results deliver the uncommitted tail without repeating earlier phrases.
Acceptance: a continuous recognition fixture commits a first phrase before finalization, no duplicate source words, ordered translation and speech; revisions of uncommitted text may replace the preview. Measure against the previous implementation with the same timed fixture.

## Requirements

- Preserve IBM fonts, three main controls, room identity and sender-echo protection.
- Keep original English in transcript/export only.
- No automatic retry of partially spoken text. Show blocked/failed audio honestly.
- Network speech accepts Arabic text <=180 characters, fixed upstream and bounded time/size, no API key and no stored speech text.
- Stop and mute cancel active playback and pending effects.
- Translation provider failure never masquerades as successful Arabic.

## Success Criteria

- All previous ordering, replay and room tests remain valid.
- First committed phrase <=1.5s in the fixed continuous-input fixture where the old implementation waits for a final event at 8s.
- One reading slide in the DOM after 100 incoming phrases.
- Arabic audio endpoint returns nonempty audio/mpeg for a public test phrase.
- Live microphone, iOS media restrictions and real network latency remain explicitly qualified until tested on that hardware.

## Key Entities
Source phrase, committed segment, queued Arabic slide, playback state.
