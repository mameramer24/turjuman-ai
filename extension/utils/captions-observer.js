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

    const allSelectors = [
      ...this.platformSelectors.zoom,
      ...this.platformSelectors.meet,
      ...this.platformSelectors.generic
    ].join(', ');

    const captionElements = document.querySelectorAll(allSelectors);
    if (!captionElements || captionElements.length === 0) return;

    // استخراج أحدث نص ظاهر
    let combinedText = '';
    let speaker = '';

    captionElements.forEach(el => {
      // محاولة استخراج اسم المتحدث إن وجد
      const speakerEl = el.querySelector('[class*="speaker"], [class*="name"], strong, b');
      if (speakerEl && !speaker) {
        speaker = speakerEl.textContent.trim().replace(/[:：]$/, '');
      }

      const text = el.innerText || el.textContent;
      if (text && text.trim().length > 1) {
        combinedText += ' ' + text.trim();
      }
    });

    combinedText = combinedText.trim();
    if (!combinedText || combinedText === this.lastProcessedText) return;

    // تنظيف وتجنب التكرار السريع
    this.lastProcessedText = combinedText;

    // ترجمة النص فورياً
    try {
      const translated = await this.translator.translate(combinedText, 'en', 'ar');
      if (this.onSubtitle && typeof this.onSubtitle === 'function') {
        this.onSubtitle({
          original: combinedText,
          translated: translated,
          speaker: speaker || 'المتحدث',
          timestamp: new Date().toLocaleTimeString('ar-EG')
        });
      }
    } catch (err) {
      console.warn('[ZoomLiveAR] Caption translation error:', err);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MeetingCaptionsObserver };
} else {
  window.MeetingCaptionsObserver = MeetingCaptionsObserver;
}
