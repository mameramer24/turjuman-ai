/**
 * وحدة الذكاء الاصطناعي للترجمة الفورية (Gemini AI + المحرك العصبي السريع)
 * مصممة لأقصى سرعة ممكنة (Latency < 80ms) وأعلى دقة لغوية لاجتماعات زوم
 */

class AITranslator {
  constructor() {
    this.cache = new Map();
    this.engine = localStorage.getItem('turjuman_engine') || 'auto'; // 'auto' | 'gemini' | 'instant'
    this.customApiKey = localStorage.getItem('turjuman_gemini_key') || '';
    this.pendingRequests = new Map();
  }

  setEngine(engine) {
    this.engine = engine;
    localStorage.setItem('turjuman_engine', engine);
  }

  setCustomApiKey(key) {
    this.customApiKey = key.trim();
    localStorage.setItem('turjuman_gemini_key', this.customApiKey);
  }

  getCustomApiKey() {
    return this.customApiKey;
  }

  /**
   * ترجمة الجملة فورياً مع نظام سباق السرعة (Fast Racing Fallback)
   */
  async translate(text, from = 'en', to = 'ar') {
    const trimmed = text.trim();
    if (!trimmed) return { translated: '', engine: 'none' };

    const cacheKey = `${this.engine}:${from}:${to}:${trimmed}`;
    if (this.cache.has(cacheKey)) {
      return { translated: this.cache.get(cacheKey), cached: true, engine: this.engine };
    }

    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey);
    }

    const fetchPromise = (async () => {
      // مؤقت إحباط للشبكة في حال بطء السيرفر لضمان سرعة الصوت
      const controller = new AbortController();
      const timeoutTimer = setTimeout(() => controller.abort(), 950);

      try {
        const response = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            text: trimmed,
            from,
            to,
            engine: this.engine,
            apiKey: this.customApiKey
          })
        });

        clearTimeout(timeoutTimer);

        if (!response.ok) {
          throw new Error(`API status: ${response.status}`);
        }

        const data = await response.json();
        const result = data.translated || trimmed;

        this.cache.set(cacheKey, result);
        return {
          translated: result,
          engine: data.engine || this.engine,
          cached: false
        };
      } catch (err) {
        clearTimeout(timeoutTimer);
        // في حال أي بطء أو انقطاع، يتم التحويل الفوري المباشر من المتصفح لمنع أي تأخير في السماعة
        return this.clientSideFallback(trimmed, from, to);
      } finally {
        this.pendingRequests.delete(cacheKey);
      }
    })();

    this.pendingRequests.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  /**
   * محرك الترجمة المباشر فائق السرعة من المتصفح (Zero Server Lag)
   */
  async clientSideFallback(text, from, to) {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json && Array.isArray(json[0])) {
        const trans = json[0].map(item => item[0] || '').join('').trim();
        return { translated: trans, engine: 'ultra_fast_client' };
      }
    } catch (e) {
      console.warn('Fallback error:', e);
    }
    return { translated: text, engine: 'failed' };
  }
}

window.AITranslator = AITranslator;
