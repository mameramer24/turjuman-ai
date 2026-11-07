# Verification

Run `npm test`, `npm run check`, then start the server and run `node scripts/smoke.js`. Compare `node scripts/benchmark-streaming.js` against the pre-change speech engine with the same virtual recognition fixture.

In a browser: enable audio or use settings > test Arabic voice, confirm a retained Arabic track with one fully opaque current phrase and older phrases at 50%, with no source paragraph, send repeated segment IDs, verify transcript once, browse old phrases without viewport snapping and use return-to-live; pause/resume the player, inspect long paragraphs at 390px and 1280px. Test blocked playback recovery separately from muted audio. Test physical iPhone/Safari speakers and microphone before claiming hardware coverage.
