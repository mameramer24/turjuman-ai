# POST /api/speech

Input JSON: `{ "text": "عبارة عربية" }`, nonempty string <=180 characters. Reject invalid input with 400 before external requests. Fixed Arabic language and upstream host; no arbitrary URL, API key or voice selection.

Success: 200 `audio/mpeg`, <=1 MiB, `Cache-Control: no-store`. No speech text is cached server-side. Upstream timeout or invalid audio returns 503 JSON with a generic error. Browser prefers device Arabic voice and requests this endpoint only as fallback. Existing translation/WebSocket shapes remain compatible.
