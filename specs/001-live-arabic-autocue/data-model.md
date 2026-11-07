# Data model

- Recognition state per result index: previous tokens, consumed count, final state and quiet timer.
- Committed segment: stable segment ID, source phrase, translated phrase, revision; existing WebSocket fields remain unchanged.
- Slide: Arabic text, segment ID, reading duration. Only current slide owns a DOM node; queued slides remain data.
- Speech job: generation, phrase, started flag, native utterance or audio controller/object URL. Muting/stopping invalidates the generation and releases resources.
