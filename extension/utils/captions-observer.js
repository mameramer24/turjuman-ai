/**
 * مراقب التسميات التوضيحية الحية لمنصات الاجتماعات (Zoom Web, Google Meet, YouTube)
 * يلتقط نصوص الترجمة الإنجليزية التي تظهرها المنصة تلقائياً ويقوم بترجمتها فورياً للعربية
 */

class MeetingCaptionsObserver {
  constructor(onSubtitleCallback) {
    this.onSubtitle = onSubtitleCallback;
    this.observer = null;
    this.active = false;
    this.lastProcessedText = '';
    this.lastCommittedText = '';
    this.revision = 0;
    this.debounceTimer = null;
    this.translator = new LiveTranslator();

    // محددات العناصر لمنصات الاجتماعات الشائعة
    this.platformSelectors = {
      zoom: [
        '.closed-caption-window',
        '.closed-caption-box',
        '.speak-user-caption',
        '.caption-panel',
        '[class*="caption-text"]',
        '[class*="closed-caption"]',
        '.transcript-item',
        'div[aria-live="polite"][class*="caption"]'
      ],
      meet: [
        'div[jsname="ysn7q"]',
        '.iO50nd',
        'div[aria-live="polite"] span',
        '.bh44bd'
      ],
      generic: [
        '.ytp-caption-segment',
        '[aria-label*="caption" i]',
        '[class*="subtitle" i]'
      ]
    };
  }

  /**
   * بدء مراقبة التسميات التوضيحية في الصفحة الحالية
   */
  start() {
    if (this.active) return;
    this.active = true;
    this.lastProcessedText = '';
    this.lastCommittedText = '';
    this.revision++;

    this.observer = new MutationObserver(this.handleMutations.bind(this));
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    console.log('[ZoomLiveAR] Captions observer started on', window.location.hostname);
  }

  /**
   * إيقاف المراقبة
   */
  stop() {
    if (!this.active) return;
    this.active = false;
    this.revision++;
    clearTimeout(this.debounceTimer);
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    console.log('[ZoomLiveAR] Captions observer stopped');
  }

  /**
   * معالجة التغييرات في شجرة العناصر DOM
   */
  async handleMutations(mutations) {
    if (!this.active) return;

    const hostname = window.location.hostname;
    const selectors = hostname.endsWith('.zoom.us') || hostname === 'zoom.us' ? this.platformSelectors.zoom :
      hostname === 'meet.google.com' ? this.platformSelectors.meet :
      hostname === 'www.youtube.com' || hostname === 'youtube.com' ? ['.ytp-caption-segment'] : this.platformSelectors.generic;
    const candidates = Array.from(document.querySelectorAll(selectors.join(', ')))
      .filter(el => !el.closest('#zoomlive-ar-overlay-root'));
    // Parent and child selector matches represent the same caption, not two utterances.
    const elements = candidates.filter(el => !candidates.some(parent => parent !== el && parent.contains(el)));
    let speaker = '';
    const texts = [];
    for (const el of elements) {
      const speakerEl = el.querySelector('[class*="speaker"], [class*="name"], strong, b');
      if (speakerEl && !speaker) speaker = speakerEl.textContent.trim().replace(/[:：]$/, '');
      const text = (el.innerText || el.textContent || '').trim();
      if (text && !texts.includes(text)) texts.push(text);
    }
    const snapshot = texts.join(' ').trim();
    if (snapshot === this.lastProcessedText) return;
    this.lastProcessedText = snapshot;
    const revision = ++this.revision;
    clearTimeout(this.debounceTimer);
    if (!snapshot) return;
    // Caption platforms revise their text repeatedly. Translate after it stabilizes.
    this.debounceTimer = setTimeout(async () => {
      const words = snapshot.split(/\s+/);
      const previous = this.lastCommittedText.split(/\s+/);
      let overlap = 0;
      for (let count = Math.min(words.length, previous.length); count >= 2; count--) {
        if (previous.slice(-count).join(' ').toLowerCase() === words.slice(0, count).join(' ').toLowerCase()) {
          overlap = count;
          break;
        }
      }
      const text = words.slice(overlap).join(' ');
      if (!text) return;
      try {
        const translated = await this.translator.translate(text, 'en', 'ar');
        if (!translated || !this.active || revision !== this.revision) return;
        this.lastCommittedText = snapshot;
        this.onSubtitle?.({ original: text, translated, speaker: speaker || 'المتحدث', timestamp: new Date().toLocaleTimeString('ar-EG') });
      } catch (err) {
        console.warn('[ZoomLiveAR] Caption translation failed');
      }
    }, 650);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MeetingCaptionsObserver };
} else {
  window.MeetingCaptionsObserver = MeetingCaptionsObserver;
}
