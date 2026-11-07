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
    this.onSpeechError = options.onSpeechError || (() => {});
    
    this.isListening = false;
    this.voiceOutputEnabled = true; // الترجمة الصوتية الفورية في السماعة مفعلة افتراضياً
    this.recognition = null;
    this.speechLang = 'en-US';
    this.arabicVoice = null;
    this.speechQueue = [];
    this.isSpeaking = false;
    this.activeUtterance = null;
    this.activeSpeech = null;
    this.needsAudioGesture = false;
    this.preferRemoteSpeech = false;
    this.audio = typeof Audio !== 'undefined' ? new Audio('/audio/unlock.wav') : null;
    if (this.audio) this.audio.preload = 'auto';
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
    else {
      this.prepareAudio();
      this.processSpeechQueue();
    }
  }

  prepareAudio() {
    this.needsAudioGesture = false;
    const synth = window.speechSynthesis;
    if (synth) {
      synth.resume?.();
      if (!this.activeSpeech && this.arabicVoice && !this.preferRemoteSpeech) {
        // A nonempty utterance is required to establish a speech session on iOS.
        const prime = new SpeechSynthesisUtterance('جاهز');
        prime.lang = this.arabicVoice.lang;
        prime.voice = this.arabicVoice;
        prime.volume = 0;
        this.unlockUtterance = prime;
        prime.onend = () => { this.unlockUtterance = null; };
        synth.speak(prime);
      }
    }
    if (this.audio && !this.activeSpeech) {
      this.audio.src = '/audio/unlock.wav';
      this.audio.volume = 0;
      this.audio.play().then(() => {
        if (!this.activeSpeech) { this.audio.pause(); this.audio.currentTime = 0; }
      }).catch(() => {});
    }
  }

  cancelSpeech() {
    this.speechGeneration++;
    const job = this.activeSpeech;
    this.activeSpeech = null;
    this.activeUtterance = null;
    this.speechQueue = [];
    clearTimeout(job?.timer);
    job?.controller?.abort();
    if (job?.url) URL.revokeObjectURL(job.url);
    if (this.audio) {
      this.audio.onplaying = this.audio.onended = this.audio.onerror = null;
      this.audio.pause();
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    this.isSpeaking = false;
    this.onSpeakingState(false);
  }

  speakArabic(text) {
    if (!this.voiceOutputEnabled || !text?.trim()) return;
    let phrase = '';
    for (const token of text.trim().split(/\s+/)) {
      for (let offset = 0; offset < token.length; offset += 180) {
        const word = token.slice(offset, offset + 180);
        if (phrase && phrase.length + word.length + 1 > 180) { this.speechQueue.push(phrase); phrase = ''; }
        phrase += (phrase ? ' ' : '') + word;
      }
    }
    if (phrase) this.speechQueue.push(phrase);
    this.processSpeechQueue();
  }

  isCurrentSpeech(job) {
    return this.activeSpeech === job && job.generation === this.speechGeneration;
  }

  speechStarted(job) {
    if (!this.isCurrentSpeech(job)) return;
    clearTimeout(job.timer);
    job.started = true;
    this.isSpeaking = true;
    this.onSpeakingState(true, job.text);
    job.timer = setTimeout(() => this.speechFailed(job, 'stalled', 'توقف الصوت. اضغط السماعة لإعادة تفعيله.'), 30000);
  }

  finishSpeech(job) {
    if (!this.isCurrentSpeech(job)) return;
    clearTimeout(job.timer);
    if (job.url) URL.revokeObjectURL(job.url);
    this.activeSpeech = null;
    this.activeUtterance = null;
    this.isSpeaking = false;
    this.onSpeakingState(false);
    setTimeout(() => {
      if (job.generation === this.speechGeneration) this.processSpeechQueue();
    }, 10);
  }

  speechFailed(job, code, message) {
    if (!this.isCurrentSpeech(job)) return;
    this.needsAudioGesture = true;
    // Retry only audio that never began; partial speech must not be repeated.
    if (!job.started) this.speechQueue.unshift(job.text);
    clearTimeout(job.timer);
    job.controller?.abort();
    if (job.url) URL.revokeObjectURL(job.url);
    this.activeSpeech = null;
    this.activeUtterance = null;
    if (this.audio) this.audio.pause();
    window.speechSynthesis?.cancel();
    this.isSpeaking = false;
    this.onSpeakingState(false);
    this.onSpeechError({ code, message });
  }

  async playRemoteSpeech(job) {
    if (!this.isCurrentSpeech(job)) return;
    this.preferRemoteSpeech = true;
    clearTimeout(job.timer);
    if (this.activeUtterance) {
      this.activeUtterance.onstart = this.activeUtterance.onend = this.activeUtterance.onerror = null;
      this.activeUtterance = null;
      window.speechSynthesis?.cancel();
    }
    if (!this.audio) {
      this.speechFailed(job, 'unsupported', 'الصوت غير متاح في هذا المتصفح. جرّب Safari أو Chrome.');
      return;
    }
    job.controller = new AbortController();
    job.timer = setTimeout(() => job.controller.abort(), 5000);
    try {
      const response = await fetch('/api/speech', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: job.text }), signal: job.controller.signal
      });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('audio/')) throw new Error('Speech unavailable');
      const blob = await response.blob();
      if (!this.isCurrentSpeech(job)) return;
      clearTimeout(job.timer);
      job.url = URL.createObjectURL(blob);
      this.audio.src = job.url;
      this.audio.volume = 1;
      this.audio.playbackRate = this.baseRate;
      this.audio.onplaying = () => this.speechStarted(job);
      this.audio.onended = () => this.finishSpeech(job);
      this.audio.onerror = () => this.speechFailed(job, 'audio-error', 'تعذر تشغيل الصوت العربي. اضغط السماعة للمحاولة مجدداً.');
      job.timer = setTimeout(() => this.speechFailed(job, 'not-started', 'لم يبدأ الصوت. اضغط السماعة لإعادة تفعيله.'), 4000);
      await this.audio.play();
    } catch (error) {
      const blocked = error.name === 'NotAllowedError';
      this.speechFailed(job, blocked ? 'not-allowed' : 'unavailable', blocked ?
        'المتصفح منع الصوت. اضغط السماعة لتفعيل النطق.' : 'تعذر تحميل الصوت العربي. تحقق من الاتصال واضغط السماعة للمحاولة.');
    }
  }

  processSpeechQueue() {
    if (!this.voiceOutputEnabled || this.needsAudioGesture || this.activeSpeech || !this.speechQueue.length) return;
    const job = { text: this.speechQueue.shift(), generation: this.speechGeneration, started: false };
    this.activeSpeech = job;
    if (this.preferRemoteSpeech || !this.arabicVoice || !window.speechSynthesis) { this.playRemoteSpeech(job); return; }
    const synth = window.speechSynthesis;
    if (synth.paused) synth.resume?.();
    const utterance = new SpeechSynthesisUtterance(job.text);
    this.activeUtterance = utterance;
    utterance.lang = this.arabicVoice.lang;
    utterance.voice = this.arabicVoice;
    utterance.rate = Math.min(this.baseRate * (this.speechQueue.length ? 1.1 : 1), 1.4);
    utterance.onstart = () => this.speechStarted(job);
    utterance.onend = () => this.finishSpeech(job);
    utterance.onerror = (event) => {
      if (!this.isCurrentSpeech(job)) return;
      if (!job.started && event.error !== 'not-allowed') this.playRemoteSpeech(job);
      else {
        this.preferRemoteSpeech = true;
        this.speechFailed(job, event.error, 'تعذر النطق. اضغط السماعة أو استخدم اختبار الصوت من الإعدادات.');
      }
    };
    // A missing onstart is a silent failure, not successful playback.
    job.timer = setTimeout(() => {
      if (!this.isCurrentSpeech(job) || job.started) return;
      utterance.onend = utterance.onerror = null;
      synth.cancel();
      this.playRemoteSpeech(job);
    }, 2500);
    try { synth.speak(utterance); }
    catch (_) { this.playRemoteSpeech(job); }
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
    this.segments = new window.LiveSegments(text => {
      if (this.isListening) this.onResult({ final: text, interim: '', isFinal: true });
    });
    this.recognition.onstart = () => {
      finalizedIndexes.clear();
      this.segments.reset();
      if (!this.isListening) { this.recognition.abort(); return; }
      this.onStatusChange('listening');
    };

    this.recognition.onresult = (event) => {
      if (!this.isListening) return;
      const drafts = [];
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (finalizedIndexes.has(i)) continue;
        const draft = this.segments.update(i, result[0].transcript, result.isFinal);
        if (result.isFinal) finalizedIndexes.add(i);
        else if (draft) drafts.push(draft);
      }
      this.onAudioActivity(true);
      if (drafts.length) this.onResult({ final: '', interim: drafts.join(' '), isFinal: false });
    };

    this.recognition.onerror = (event) => {
      console.warn('SpeechRecognition error:', event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        this.isListening = false;
        this.releaseWakeLock();
        this.terminalError = 'permission_denied';
        this.segments?.reset();
        this.onStatusChange(this.terminalError);
      } else if (['network', 'audio-capture', 'language-not-supported'].includes(event.error)) {
        this.isListening = false;
        this.releaseWakeLock();
        this.terminalError = event.error === 'network' ? 'network_error' : event.error === 'audio-capture' ? 'microphone_error' : 'unsupported';
        this.segments?.reset();
        this.onStatusChange(this.terminalError);
      }
    };

    this.recognition.onend = () => {
      this.onAudioActivity(false);
      // إعادة التشغيل تلقائياً للاستمرار في الاستماع طوال مدة الاجتماع بدون انقطاع
      if (this.isListening) {
        this.segments.finish();
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
      if (this.voiceOutputEnabled) this.prepareAudio();
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
    this.segments?.reset();
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
