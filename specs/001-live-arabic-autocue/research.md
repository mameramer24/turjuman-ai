# Research

- Native speech can remain paused; resume before queuing. Confirmed by MDN SpeechSynthesis.paused/resume documentation.
- iOS WebKit requires a user gesture for synthesis. Empty utterances and swallowed errors do not prove playback. Use nonempty gesture priming and onstart/onerror state, plus a reusable HTML audio element.
- Fixed Google Translate TTS host returned HTTP 200 audio/mpeg, 9600 bytes in 0.68s for a public Arabic test word. It is an unofficial free fallback with no availability guarantee; errors stay visible.
- Continuous interim source can grow for seconds without a browser final. Commit only repeated stable prefixes (6–12 words), retain the uncommitted tail, and never re-speak accepted prefixes. Late recognition corrections to an already committed prefix cannot rewrite audio already heard.
- Autocue animates transform and opacity for <=180ms, only on the current text, and disables motion for reduced-motion users.
