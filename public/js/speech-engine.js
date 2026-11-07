/**
 * محرك الصوت: التعرف على الكلام (STT) + النطق الصوتي الفوري بالعربية في السماعات (TTS)
 * مخصص لوضع سماعة الأذن الشخصية (Simultaneous Earphone Interpretation)
 */

class SpeechEngine {
  constructor(options = {}) {
    this.onResult = options.onResult || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onAudioActivity = options.onAudioActivity || (() => {});
    this.onSpeakingState = options.onSpeakingState || (() => {});
    
    this.isListening = false;
    this.voiceOutputEnabled = true; // الترجمة الصوتية الفورية في السماعة مفعلة افتراضياً
    this.recognition = null;
    this.speechLang = 'en-US';
    this.arabicVoice = null;
    this.speechQueue = [];
    this.isSpeaking = false;
    this.activeUtterance = null;
    this.speechGeneration = 0;
    this.starting = false;
    this.terminalError = null;
    this.baseRate = 1.15; // سرعة ملائمة لمواكبة المتحدث البشري بدون تأخير
    this.wakeLock = null;
    
    this.initTTS();
  }

  /**
   * تهيئة الأصوات العربية لنظام النطق الصوتي
   */
  initTTS() {
    if (!('speechSynthesis' in window)) {
      console.warn('SpeechSynthesis not supported on this browser');
      return;
    }

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      // البحث عن أفضل صوت عربي طبيعي ومفهوم
      this.arabicVoice = voices.find(v => v.lang.startsWith('ar') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Laila') || v.name.includes('Maged') || v.name.includes('Tarik') || v.name.includes('Salma') || v.name.includes('Youssef'))) 
                      || voices.find(v => v.lang.startsWith('ar'))
                      || null;
    };

    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  /**
   * تفعيل أو كتم الصوت في السماعة
   */
  setVoiceOutput(enabled) {
    this.voiceOutputEnabled = enabled;
    if (!enabled) this.cancelSpeech();
    else if ('speechSynthesis' in window) {
      // This user gesture unlocks audio on mobile.
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    }
  }

  cancelSpeech() {
    this.speechGeneration++;
    this.speechQueue = [];
    this.activeUtterance = null;
    this.isSpeaking = false;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    this.onSpeakingState(false);
  }

  speakArabic(text) {
    if (!this.voiceOutputEnabled || !text?.trim() || !('speechSynthesis' in window)) return;
    this.speechQueue.push(text.trim());
    this.processSpeechQueue();
  }

  processSpeechQueue() {
    if (!this.voiceOutputEnabled || this.activeUtterance || !this.speechQueue.length) return;
    const nextText = this.speechQueue.shift();
    const generation = this.speechGeneration;
    const utterance = new SpeechSynthesisUtterance(nextText);
    this.activeUtterance = utterance;
    this.isSpeaking = true;
    this.onSpeakingState(true, nextText);
    utterance.lang = 'ar-SA';
    if (this.arabicVoice) utterance.voice = this.arabicVoice;
    utterance.rate = Math.min(this.baseRate * (this.speechQueue.length ? 1.1 : 1), 1.4);
    utterance.pitch = 1;
    const finish = () => {
      if (generation !== this.speechGeneration || this.activeUtterance !== utterance) return;
      this.activeUtterance = null;
      this.isSpeaking = false;
      this.onSpeakingState(false);
      setTimeout(() => {
        if (generation === this.speechGeneration) this.processSpeechQueue();
      }, 10);
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  }

  /**
   * منع إطفاء شاشة الهاتف أثناء الاستماع (Keep Screen Awake)
   */
  async requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (!this.isListening) { await lock.release(); return; }
        this.wakeLock = lock;
      } catch (err) {
        console.warn('Wake Lock request failed:', err);
      }
    }
  }

  releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
  }

  /**
   * إعداد محرك الاستماع (التعرف على الصوت من المايك)
   */
  setupRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      throw new Error('متصفحك لا يدعم التعرف على الصوت. يرجى استخدام Google Chrome أو Safari الحديث.');
    }

    this.recognition = new SpeechRec();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;
    this.recognition.lang = this.speechLang;

    const finalizedIndexes = new Set();
    this.recognition.onstart = () => {
      finalizedIndexes.clear();
      if (!this.isListening) { this.recognition.abort(); return; }
      this.onStatusChange('listening');
    };

    this.recognition.onresult = (event) => {
      if (!this.isListening) return;
      let interim = '';
      let final = '';

      for (let i = 0; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          if (i >= event.resultIndex && !finalizedIndexes.has(i)) {
            finalizedIndexes.add(i);
            final += ' ' + event.results[i][0].transcript;
          }
        } else {
          interim += ' ' + event.results[i][0].transcript;
        }
      }
      if (!final.trim() && !interim.trim()) return;

      this.onAudioActivity(true);
      this.onResult({
        final: final.trim(),
        interim: interim.trim(),
        isFinal: !!final.trim()
      });
    };

    this.recognition.onerror = (event) => {
      console.warn('SpeechRecognition error:', event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        this.isListening = false;
        this.releaseWakeLock();
        this.terminalError = 'permission_denied';
        this.onStatusChange(this.terminalError);
      } else if (['network', 'audio-capture', 'language-not-supported'].includes(event.error)) {
        this.isListening = false;
        this.releaseWakeLock();
        this.terminalError = event.error === 'network' ? 'network_error' : event.error === 'audio-capture' ? 'microphone_error' : 'unsupported';
        this.onStatusChange(this.terminalError);
      }
    };

    this.recognition.onend = () => {
      this.onAudioActivity(false);
      // إعادة التشغيل تلقائياً للاستمرار في الاستماع طوال مدة الاجتماع بدون انقطاع
      if (this.isListening) {
        try {
          this.recognition.start();
        } catch (e) {
          setTimeout(() => {
            if (this.isListening) {
              try { this.recognition.start(); } catch (err) {}
            }
          }, 200);
        }
      } else if (!this.terminalError) {
        this.onStatusChange('stopped');
      }
    };
  }

  /**
   * بدء الاستماع والترجمة للسماعة
   */
  async start() {
    if (this.isListening || this.starting) return;
    this.starting = true;
    this.terminalError = null;
    try {
      if (!this.recognition) this.setupRecognition();
      this.cancelSpeech();
      if ('speechSynthesis' in window) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
      }
      this.isListening = true;
      this.recognition.lang = this.speechLang;
      this.recognition.start();
      this.requestWakeLock();
    } catch (error) {
      this.isListening = false;
      this.releaseWakeLock();
      throw error;
    } finally {
      this.starting = false;
    }
  }

  stop() {
    this.isListening = false;
    this.terminalError = null;
    this.releaseWakeLock();
    if (this.recognition) {
      try { this.recognition.abort(); } catch (_) {}
    }
    this.cancelSpeech();
    this.onStatusChange('stopped');
  }

  setLanguage(lang) {
    this.speechLang = lang;
    if (this.recognition) {
      this.recognition.lang = lang;
      if (this.isListening) {
        this.recognition.stop();
      }
    }
  }
}

window.SpeechEngine = SpeechEngine;
