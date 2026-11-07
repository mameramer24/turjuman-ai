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
    if (!enabled && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      this.speechQueue = [];
      this.isSpeaking = false;
      this.onSpeakingState(false);
    }
  }

  /**
   * تحويل النص العربي المترجم فورياً إلى صوت في سماعة أذن العميل بدون أي تأخير
   */
  speakArabic(text) {
    if (!this.voiceOutputEnabled || !text || !text.trim()) return;
    if (!('speechSynthesis' in window)) return;

    const trimmed = text.trim();

    // فحص عدم تعليق المتصفح في النطق
    if (!window.speechSynthesis.speaking && this.isSpeaking) {
      this.isSpeaking = false;
    }

    // إضافة العبارة المتدفقة فورياً للطابور
    if (this.speechQueue.length >= 4) {
      this.speechQueue = [this.speechQueue.slice(0, 2).join('، '), trimmed];
    } else {
      this.speechQueue.push(trimmed);
    }

    this.processSpeechQueue();
  }

  processSpeechQueue() {
    if (this.speechQueue.length === 0) {
      this.isSpeaking = false;
      this.onSpeakingState(false);
      return;
    }

    // إذا كان المتصفح يتكلم حالياً ننتظر انتهاء العبارة الحالية
    if (window.speechSynthesis.speaking) {
      this.isSpeaking = true;
      return;
    }

    const nextText = this.speechQueue.shift();
    this.isSpeaking = true;
    this.onSpeakingState(true, nextText);

    const utterance = new SpeechSynthesisUtterance(nextText);
    utterance.lang = 'ar-SA';
    if (this.arabicVoice) {
      utterance.voice = this.arabicVoice;
    }

    // سرعة فورية متكيفة لمنع أي بطء أو تراكم
    const dynamicRate = this.speechQueue.length > 0 ? this.baseRate * 1.15 : this.baseRate;
    utterance.rate = Math.min(dynamicRate, 1.35);
    utterance.pitch = 1.0;

    utterance.onend = () => {
      this.isSpeaking = false;
      this.onSpeakingState(false);
      // الانتقال الفوري للعبارة القادمة خلال 10ms فقط
      setTimeout(() => this.processSpeechQueue(), 10);
    };

    utterance.onerror = (e) => {
      console.warn('TTS utterance error:', e);
      this.isSpeaking = false;
      this.onSpeakingState(false);
      setTimeout(() => this.processSpeechQueue(), 10);
    };

    window.speechSynthesis.speak(utterance);
  }

  /**
   * منع إطفاء شاشة الهاتف أثناء الاستماع (Keep Screen Awake)
   */
  async requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
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

    this.recognition.onstart = () => {
      this.isListening = true;
      this.onStatusChange('listening');
    };

    this.recognition.onresult = (event) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      this.onAudioActivity(true);
      this.onResult({
        final: final.trim(),
        interim: interim.trim(),
        isFinal: !!final.trim()
      });
    };

    this.recognition.onerror = (event) => {
      console.warn('SpeechRecognition error:', event.error);
      if (event.error === 'not-allowed') {
        this.isListening = false;
        this.onStatusChange('permission_denied');
      } else if (event.error === 'network') {
        this.onStatusChange('network_error');
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
      } else {
        this.onStatusChange('stopped');
      }
    };
  }

  /**
   * بدء الاستماع والترجمة للسماعة
   */
  async start() {
    // فتح قفل نظام الصوت في iOS و Safari لمنع حظر النطق التلقائي
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const unlock = new SpeechSynthesisUtterance('');
      window.speechSynthesis.speak(unlock);
    }

    // منع قفل شاشة الهاتف
    await this.requestWakeLock();

    if (!this.recognition) {
      this.setupRecognition();
    }

    this.isListening = true;
    this.recognition.lang = this.speechLang;
    this.recognition.start();
  }

  /**
   * إيقاف الاستماع
   */
  stop() {
    this.isListening = false;
    this.releaseWakeLock();
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      this.speechQueue = [];
      this.isSpeaking = false;
      this.onSpeakingState(false);
    }
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
