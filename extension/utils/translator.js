/**
 * وحدة الترجمة الفورية من الإنجليزية إلى العربية
 * تستخدم محرك ترجمة سريع جداً ومجاني بدون الحاجة لمفاتيح API
 */

class LiveTranslator {
  constructor() {
    this.cache = new Map();
    this.pendingQueue = new Map();
  }

  /**
   * ترجمة نص من الإنجليزية إلى العربية
   * @param {string} text - النص الإنجليزي المراد ترجمته
   * @param {string} from - لغة المصدر (افتراضي en)
   * @param {string} to - لغة الهدف (افتراضي ar)
   * @returns {Promise<string>} - النص المترجم بالعربية
   */
  async translate(text, from = 'en', to = 'ar') {
    const trimmed = text.trim();
    if (!trimmed) return '';

    // التحقق من الذاكرة المؤقتة (Cache) لتوفير الوقت والطلبات
    const cacheKey = `${from}:${to}:${trimmed}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // تجنب إرسال طلبات مكررة لنفس النص في نفس اللحظة
    if (this.pendingQueue.has(cacheKey)) {
      return this.pendingQueue.get(cacheKey);
    }

    const promise = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(trimmed)}`;
        const response = await fetch(url, { signal: controller.signal });
        
        if (!response.ok) {
          throw new Error(`Translation API error: ${response.status}`);
        }

        const data = await response.json();
        
        // استخراج النص المترجم من مصفوفة الاستجابة
        let translatedText = '';
        if (data && Array.isArray(data[0])) {
          translatedText = data[0].map(item => (item && item[0]) ? item[0] : '').join('').trim();
        }

        if (!translatedText) {
          return ''; // A failed translation must not masquerade as translated speech.
        }

        // حفظ في الكاش
        this.cache.set(cacheKey, translatedText);
        // حد أقصى للكاش 1000 عنصر لتوفير الذاكرة
        if (this.cache.size > 1000) {
          const firstKey = this.cache.keys().next().value;
          this.cache.delete(firstKey);
        }

        return translatedText;
      } catch (err) {
        console.warn('LiveTranslator unavailable');
        return '';
      } finally {
        clearTimeout(timer);
      }
    })();

    this.pendingQueue.set(cacheKey, promise);
    try { return await promise; }
    finally { this.pendingQueue.delete(cacheKey); }
  }

  /**
   * مسح الذاكرة المؤقتة
   */
  clearCache() {
    this.cache.clear();
  }
}

// تصدير للاستخدام في المتصفح أو بيئة Service Worker
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LiveTranslator };
} else {
  window.LiveTranslator = LiveTranslator;
}
