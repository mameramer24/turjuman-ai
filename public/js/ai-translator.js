/** Translation requests share results, use bounded retries, and report failure honestly. */
class AITranslator {
  constructor() {
    this.cache = new Map();
    this.engine = localStorage.getItem('turjuman_engine') || 'auto';
    this.customApiKey = localStorage.getItem('turjuman_gemini_key') || '';
    this.pendingRequests = new Map();
    this.configVersion = 0;
  }

  setEngine(engine) {
    this.engine = engine;
    this.configVersion++;
    localStorage.setItem('turjuman_engine', engine);
  }

  setCustomApiKey(key) {
    this.customApiKey = key.trim();
    this.configVersion++;
    localStorage.setItem('turjuman_gemini_key', this.customApiKey);
  }

  getCustomApiKey() { return this.customApiKey; }

  async requestJSON(url, options = {}, timeout = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) throw new Error(`Translation HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async translate(text, from = 'en', to = 'ar') {
    const trimmed = text.trim();
    if (!trimmed) return { translated: '', engine: 'none' };
    const cacheKey = `${this.configVersion}:${this.engine}:${from}:${to}:${trimmed}`;
    if (this.cache.has(cacheKey)) return { ...this.cache.get(cacheKey), cached: true };
    if (this.pendingRequests.has(cacheKey)) return this.pendingRequests.get(cacheKey);
    const request = (async () => {
      let result;
      try {
        const data = await this.requestJSON('/api/translate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: trimmed, from, to, engine: this.engine, apiKey: this.customApiKey })
        });
        if (typeof data.translated !== 'string' || !data.translated.trim()) throw new Error('Empty translation');
        result = { translated: data.translated.trim(), engine: data.engine || this.engine };
      } catch (_) {
        result = await this.clientSideFallback(trimmed, from, to);
      }
      if (result.engine !== 'failed') {
        this.cache.set(cacheKey, result);
        if (this.cache.size > 1000) this.cache.delete(this.cache.keys().next().value);
      }
      return result;
    })();
    this.pendingRequests.set(cacheKey, request);
    try { return await request; }
    finally { this.pendingRequests.delete(cacheKey); }
  }

  async clientSideFallback(text, from, to) {
    const query = `sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}&q=${encodeURIComponent(text)}`;
    try {
      const data = await this.requestJSON(`https://clients5.google.com/translate_a/t?client=dict-chrome-ex&${query}`, {}, 3000);
      const translated = typeof data?.[0] === 'string' ? data[0] : data?.[0]?.[0];
      if (typeof translated === 'string' && translated.trim()) return { translated: translated.trim(), engine: 'instant_fallback' };
    } catch (_) {}
    try {
      const data = await this.requestJSON(`https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&${query}`, {}, 3000);
      const translated = Array.isArray(data?.[0]) ? data[0].map(item => item?.[0] || '').join('').trim() : '';
      if (translated) return { translated, engine: 'instant_fallback' };
    } catch (_) {}
    return { translated: '', engine: 'failed' };
  }
}
window.AITranslator = AITranslator;
