/** A continuous Arabic reading track, centered on the current phrase. */
class AutocuePlayer {
  constructor(feed, viewport = feed.parentElement, onFollowChange = () => {}) {
    this.feed = feed;
    this.viewport = viewport;
    this.onFollowChange = onFollowChange;
    this.following = true;
    this.previewLine = null;
    this.activeLine = null;
    const browseHistory = () => this.setFollowing(false);
    viewport?.addEventListener('wheel', browseHistory, { passive: true });
    viewport?.addEventListener('touchmove', browseHistory, { passive: true });
    viewport?.addEventListener('pointerdown', browseHistory, { passive: true });
    viewport?.addEventListener('keydown', event => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) browseHistory();
    });
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
    this.clearPreview();
    if (preview) {
      this.previewLine = line;
    } else {
      if (this.activeLine) this.activeLine.className = 'autocue-line past';
      line.className = 'autocue-line current';
      this.activeLine = line;
    }
    this.feed.appendChild(line);
    this.isPreview = preview;
    if (this.following) this.centerCurrent();
  }

  centerCurrent(behavior = 'smooth') {
    const line = this.previewLine || this.activeLine;
    if (!line || !this.viewport) return;
    const viewport = this.viewport;
    const top = viewport.scrollTop + line.getBoundingClientRect().top - viewport.getBoundingClientRect().top
      - (viewport.clientHeight - line.getBoundingClientRect().height) / 2;
    viewport.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : behavior });
  }

  setFollowing(enabled) {
    this.following = enabled;
    this.onFollowChange(enabled);
    if (enabled) this.centerCurrent();
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
    this.previewLine?.remove();
    this.previewLine = null;
    this.isPreview = false;
  }

  clear() {
    clearTimeout(this.timer);
    this.queue = [];
    this.current = null;
    this.isPreview = false;
    this.activeLine = null;
    this.previewLine = null;
    this.feed.replaceChildren();
  }
}
window.AutocuePlayer = AutocuePlayer;
