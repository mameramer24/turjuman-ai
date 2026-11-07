# Data model

- Recognition state per result index: previous tokens, consumed count, final state and quiet timer.
- Committed segment: stable segment ID, source phrase, translated phrase, revision; existing WebSocket fields remain unchanged.
- Slide: Arabic text, segment ID, reading duration. Displayed phrases retain DOM nodes for manual history scrolling; only the current phrase is fully opaque. Queued phrases remain data until displayed. Viewport-follow state is independent of phrase progression.
- Speech job: generation, phrase, started flag, native utterance or audio controller/object URL. Muting/stopping invalidates the generation and releases resources.
