/** Commit repeated source prefixes, while browser recognition is still interim. */
class LiveSegments {
  constructor(onSegment, quietMs = 700) {
    this.onSegment = onSegment;
    this.quietMs = quietMs;
    this.states = new Map();
  }

  update(index, text, isFinal) {
    const words = text.trim().split(/\s+/).filter(Boolean);
    let state = this.states.get(index);
    if (!state) {
      state = { previous: [], consumed: 0, timer: null, final: false };
      this.states.set(index, state);
    }
    if (state.final) return '';
    clearTimeout(state.timer);
    let stable = 0;
    while (stable < words.length && stable < state.previous.length &&
      words[stable].toLowerCase() === state.previous[stable].toLowerCase()) stable++;
    const limit = isFinal ? words.length : Math.max(state.consumed, stable - 2);
    while (limit - state.consumed >= (isFinal ? 1 : 6)) {
      let end = Math.min(state.consumed + 12, limit);
      for (let i = state.consumed + 5; i < end; i++) {
        if (/[.!?,;:]$/.test(words[i])) { end = i + 1; break; }
      }
      const phrase = words.slice(state.consumed, end).join(' ');
      state.consumed = end;
      if (phrase) this.onSegment(phrase);
    }
    state.previous = words;
    state.final = isFinal;
    if (!isFinal && words.length - state.consumed >= 3) {
      state.timer = setTimeout(() => {
        if (state.final) return;
        const remaining = state.previous.slice(state.consumed);
        // A quiet, unchanged phrase can be accepted without waiting for browser finalization.
        while (remaining.length) {
          const phrase = remaining.splice(0, 12);
          state.consumed += phrase.length;
          this.onSegment(phrase.join(' '));
        }
      }, this.quietMs);
    }
    return words.slice(state.consumed).join(' ');
  }

  finish() {
    for (const [index, state] of this.states) {
      if (!state.final) this.update(index, state.previous.join(' '), true);
    }
  }

  reset() {
    for (const state of this.states.values()) clearTimeout(state.timer);
    this.states.clear();
  }
}
window.LiveSegments = LiveSegments;
