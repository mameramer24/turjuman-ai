/** A single reading position; the full transcript lives outside the autocue. */
class AutocuePlayer {
  constructor(feed) {
    this.feed = feed;
    this.queue = [];
    this.current = null;
    this.timer = null;
    this.paused = false;
    this.isPreview = false;
  }

  split(text) {
    const parts = [];
    let words = [], size = 0;
    for (const word of text.trim().split(/\s+/)) {
      // Bound even unusually long tokens without dropping any characters.
      for (let offset = 0; offset < word.length; offset += 110) {
        const token = word.slice(offset, offset + 110);
        if (words.length && (words.length >= 12 || size + token.length + 1 > 110)) {
          parts.push(words.join(' ')); words = []; size = 0;
        }
        words.push(token); size += token.length + 1;
        if (words.length >= 6 && /[.!؟،,;:]$/.test(token)) {
          parts.push(words.join(' ')); words = []; size = 0;
        }
      }
    }
    if (words.length) parts.push(words.join(' '));
    return parts;
  }

  show(text, preview = false) {
    const line = document.createElement('div');
    line.className = `autocue-line${preview ? ' interim' : ' slide-enter'}`;
    const arabic = document.createElement('div');
    arabic.className = 'line-arabic';
    arabic.textContent = text;
    line.appendChild(arabic);
    this.feed.replaceChildren(line);
    this.isPreview = preview;
  }

  preview(text) {
    if (this.paused || this.current || this.queue.length) return;
    const slides = this.split(text);
    if (slides.length) this.show(slides.at(-1), true);
  }

  enqueue(text) {
    this.queue.push(...this.split(text));
    if (!this.current && !this.paused) this.next();
  }

  next() {
    clearTimeout(this.timer);
    if (!this.queue.length) { this.current = null; return; }
    this.current = this.queue.shift();
    this.show(this.current);
    this.schedule();
  }

  schedule() {
    if (this.paused || !this.current) return;
    const words = this.current.split(/\s+/).length;
    const duration = Math.max(1400, Math.min(5000, words * 280) / (1 + Math.min(this.queue.length, 6) * 0.12));
    this.timer = setTimeout(() => this.next(), duration);
  }

  setPaused(paused) {
    this.paused = paused;
    clearTimeout(this.timer);
    if (!paused) {
      if (!this.current && this.queue.length) this.next();
      else this.schedule();
    }
  }

  clearPreview() {
    if (this.isPreview) { this.feed.replaceChildren(); this.isPreview = false; }
  }

  clear() {
    clearTimeout(this.timer);
    this.queue = [];
    this.current = null;
    this.isPreview = false;
    this.feed.replaceChildren();
  }
}
window.AutocuePlayer = AutocuePlayer;
