/**
 * السكريبت الرئيسي لتطبيق ترجمان AI (Turjuman AI)
 */

document.addEventListener('DOMContentLoaded', async () => {
  // تحديد الغرفة الحالية من الرابط أو التعيين التلقائي
  const pathParts = window.location.pathname.split('/');
  const roomIndex = pathParts.indexOf('room');
  let roomId = '';
  if (roomIndex !== -1 && pathParts[roomIndex + 1]) {
    roomId = pathParts[roomIndex + 1];
  } else {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('room')) {
      roomId = urlParams.get('room');
    }
  }

  if (!/^[\w-]{1,80}$/.test(roomId)) {
    const savedRoom = localStorage.getItem('turjuman_room');
    roomId = savedRoom && /^[\w-]{1,80}$/.test(savedRoom) ? savedRoom :
      `meeting-${window.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
    localStorage.setItem('turjuman_room', roomId);
    window.history?.replaceState(null, '', `/room/${roomId}`);
  }

  // عناصر الواجهة
  const roomDisplayName = document.getElementById('room-display-name');
  const clientsCount = document.getElementById('clients-count');
  const soundWave = document.getElementById('sound-wave');
  const btnMainListen = document.getElementById('btn-main-listen');
  const listenText = document.getElementById('listen-text');
  const btnToggleVoice = document.getElementById('btn-toggle-voice');
  const voiceIcon = document.getElementById('voice-icon');
  const voiceStatusHint = document.getElementById('voice-status-hint');
  const btnFontToggle = document.getElementById('btn-font-toggle');
  const engineBadge = document.getElementById('engine-badge');

  // عناصر ملقن النصوص (Autocue Elements)
  const autocueFeed = document.getElementById('autocue-feed');
  const btnFollowLive = document.getElementById('btn-follow-live');
  const autocuePlayer = new AutocuePlayer(autocueFeed, document.getElementById('autocue-viewport'), enabled => {
    autoScrollEnabled = enabled;
    btnFollowLive.hidden = enabled;
    btnAutocueScroll.setAttribute('aria-pressed', String(enabled));
    btnAutocueScroll.textContent = enabled ? 'متابعة المباشر: مفعّلة' : 'متابعة المباشر: متوقفة';
  });
  let autocuePlaceholder = document.getElementById('autocue-placeholder');
  const btnAutocueScroll = document.getElementById('btn-autocue-scroll');
  let autoScrollEnabled = true;
  const audioFeedback = document.getElementById('audio-feedback');
  const btnTestVoice = document.getElementById('btn-test-voice');

  // نوافذ Modals
  const shareModal = document.getElementById('share-modal');
  const btnShareRoom = document.getElementById('btn-share-room');
  const closeShareModal = document.getElementById('close-share-modal');
  const qrImg = document.getElementById('qr-img');
  const roomUrlInput = document.getElementById('room-url-input');
  const btnCopyLink = document.getElementById('btn-copy-link');

  const settingsModal = document.getElementById('settings-modal');
  const btnOpenSettings = document.getElementById('btn-open-settings');
  const closeSettingsModal = document.getElementById('close-settings-modal');
  const settingEngineSelect = document.getElementById('setting-engine-select');
  const geminiKeyInput = document.getElementById('gemini-key-input');
  const speechSpeedRange = document.getElementById('speech-speed-range');
  const speechSpeedVal = document.getElementById('speech-speed-val');
  const settingSpeechLang = document.getElementById('setting-speech-lang');
  const btnSaveSettings = document.getElementById('btn-save-settings');

  const transcriptModal = document.getElementById('transcript-modal');
  const btnOpenTranscript = document.getElementById('btn-open-transcript');
  const closeTranscriptModal = document.getElementById('close-transcript-modal');
  const transcriptItemsBox = document.getElementById('transcript-items-box');
  let emptyTranscriptMsg = document.getElementById('empty-transcript-msg');
  const btnCopyTranscript = document.getElementById('btn-copy-transcript');
  const btnDownloadTranscript = document.getElementById('btn-download-transcript');
  const btnClearTranscript = document.getElementById('btn-clear-transcript');
  const btnClearScreen = document.getElementById('btn-clear-screen');

  roomDisplayName.textContent = `الغرفة: ${roomId}`;

  btnFollowLive.addEventListener('click', () => {
    autocuePlayer.setPaused(false);
    autocuePlayer.setFollowing(true);
  });

  // إنشاء الوحدات الأساسية
  const translator = new AITranslator();
  let transcriptHistory = [];
  let fontSizes = [22, 26, 30, 36];
  let currentFontIndex = 1;

  // إدارة تثبيت PWA على الهاتف
  const pwaInstallBanner = document.getElementById('pwa-install-banner');
  const btnPwaInstall = document.getElementById('btn-pwa-install');
  const iosInstallHint = document.getElementById('ios-install-hint');
  const closeIosHint = document.getElementById('close-ios-hint');
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (pwaInstallBanner) pwaInstallBanner.style.display = 'flex';
  });

  if (btnPwaInstall) {
    btnPwaInstall.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          pwaInstallBanner.style.display = 'none';
        }
        deferredPrompt = null;
      }
    });
  }

  // كشف الآيفون (iOS Safari)
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (isIos && !isStandalone && iosInstallHint) {
    iosInstallHint.style.display = 'flex';
    if (closeIosHint) {
      closeIosHint.addEventListener('click', () => {
        iosInstallHint.style.display = 'none';
      });
    }
  }

  // Each recognized segment owns one row; revisions only replace its draft.
  const subtitleLines = new Map();
  let sessionVersion = 0;
  let draftRevision = 0;
  let segmentNumber = 0;
  const sourceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  let finalQueue = Promise.resolve();
  const segmentId = () => `${sourceId}:${segmentNumber}`;

  function renderAutocueLine(arabic, english, isInterim, id, revision = 0) {
    const line = subtitleLines.get(id);
    if (line && (line.final || revision < line.revision)) return false;
    if (autocuePlaceholder) { autocuePlaceholder.remove(); autocuePlaceholder = null; }
    subtitleLines.set(id, { final: !isInterim, revision });
    if (isInterim) autocuePlayer.preview(arabic);
    else autocuePlayer.enqueue(arabic);
    if (subtitleLines.size > 300) subtitleLines.delete(subtitleLines.keys().next().value);
    return true;
  }

  function invalidatePendingTranslations() {
    sessionVersion++;
    draftRevision++;
    segmentNumber++;
    finalQueue = Promise.resolve();
    autocuePlayer.clearPreview();
    for (const [id, line] of subtitleLines) {
      if (!line.final) {
        subtitleLines.delete(id);
      }
    }
  }

  function showSessionStatus(text, error = false) {
    const status = document.getElementById('session-status');
    if (status) {
      status.textContent = text;
      status.classList.toggle('error', error);
    }
  }

  function handleRecognitionResult(result) {
    if (!speechEngine.isListening || !result.final) return finalQueue;
    const version = sessionVersion;
    const revision = ++draftRevision;

    if (result.final) {
      const id = segmentId();
      segmentNumber++;
      // Start requests immediately, but commit text, history and speech in order.
      const translation = translator.translate(result.final, 'en', 'ar').then(res => ({ res }), error => ({ error }));
      finalQueue = finalQueue.then(async () => {
        const outcome = await translation;
        if (version !== sessionVersion || !speechEngine.isListening) return;
        if (outcome.error) throw outcome.error;
        const res = outcome.res;
        if (res.engine === 'failed') {
          renderAutocueLine('تعذرت الترجمة. تحقق من الاتصال بالإنترنت.', result.final, false, id, revision);
          showSessionStatus('تعذرت ترجمة العبارة. تحقق من الاتصال.', true);
          return;
        }
        if (!renderAutocueLine(res.translated, result.final, false, id, revision)) return;
        speechEngine.speakArabic(res.translated);
        addTranscriptRecord({
          time: new Date().toLocaleTimeString('ar-EG'),
          english: result.final,
          arabic: res.translated
        });
        socketClient.broadcastSubtitle({
          original: result.final, translated: res.translated,
          isInterim: false, segmentId: id, revision
        });
      }).catch(() => {
        if (version === sessionVersion) showSessionStatus('تعذرت ترجمة العبارة. حاول مجدداً.', true);
      });
    }

    return finalQueue;
  }

  // إعداد محرك الصوت
  const speechEngine = new SpeechEngine({
    onSpeakingState: (isSpeaking) => {
      btnToggleVoice.classList.toggle('speaking', isSpeaking);
      if (isSpeaking && audioFeedback) { audioFeedback.hidden = false; audioFeedback.textContent = 'يُنطق الصوت العربي الآن'; }
      else if (audioFeedback?.textContent === 'يُنطق الصوت العربي الآن') audioFeedback.hidden = true;
    },
    onSpeechError: (error) => {
      if (audioFeedback) { audioFeedback.hidden = false; audioFeedback.textContent = error.message; }
      updateVoiceControl();
    },
    onStatusChange: (status) => {
      if (status === 'listening') {
        btnMainListen.classList.add('listening');
        listenText.textContent = 'إيقاف الاستماع';
        soundWave.classList.add('active');
        showSessionStatus('يستمع الآن · يترجم العبارات أولاً بأول');
      } else {
        btnMainListen.classList.remove('listening');
        listenText.textContent = 'بدء الاستماع والترجمة';
        soundWave.classList.remove('active');
        const errors = { permission_denied: 'اسمح بالوصول للمايك من إعدادات المتصفح ثم حاول مجدداً.', network_error: 'انقطع التعرف على الصوت. تحقق من الإنترنت.', microphone_error: 'لم يُعثر على مايك متاح. تحقق من توصيله وإعداداته.', unsupported: 'التعرف على الصوت غير متاح. استخدم Chrome أو Safari.' };
        if (errors[status]) invalidatePendingTranslations();
        showSessionStatus(errors[status] || 'المايك متوقف · يمكنك استقبال ترجمة الغرفة', !!errors[status]);
      }
      btnMainListen.setAttribute('aria-pressed', String(status === 'listening'));
    },
    onAudioActivity: (active) => {
      if (active) {
        soundWave.classList.add('active');
      } else {
        soundWave.classList.remove('active');
      }
    },
    onResult: handleRecognitionResult
  });

  // Receivers update drafts silently and speak each committed segment once.
  const socketClient = new SocketClient({
    onSubtitle: (data) => {
      if (typeof data.translated !== 'string' || typeof data.original !== 'string') return;
      const id = data.segmentId || `legacy:${data.timestamp}:${data.original}`;
      if (!renderAutocueLine(data.translated, data.original, data.isInterim, id, data.revision)) return;
      if (!speechEngine.isListening) showSessionStatus('تستقبل ترجمة الغرفة · المايك متوقف');
      if (!data.isInterim) {
        speechEngine.speakArabic(data.translated);
        addTranscriptRecord({
          time: data.timestamp || new Date().toLocaleTimeString('ar-EG'),
          english: data.original, arabic: data.translated
        });
      }
    },
    onRoomStatus: (data) => {
      if (data.clientCount !== undefined) clientsCount.textContent = `${data.clientCount} متصل`;
      document.getElementById('connection-dot')?.classList.toggle('active', data.type !== 'disconnected');
      if (data.type === 'disconnected') {
        clientsCount.textContent = 'إعادة الاتصال…';
      }
    }
  });

  // الاتصال بالغرفة
  socketClient.connect(roomId);

  // تحديث شارة المحرك في الشريط العلوي
  function updateEngineBadge() {
    const currentEng = translator.engine;
    if (currentEng === 'gemini') {
      engineBadge.textContent = 'Google Gemini AI';
      engineBadge.style.color = '#38bdf8';
    } else if (currentEng === 'instant') {
      engineBadge.textContent = 'المحرك الفوري السريع';
      engineBadge.style.color = '#34d399';
    } else {
      engineBadge.textContent = 'ذكاء اصطناعي تلقائي';
      engineBadge.style.color = '#38bdf8';
    }
  }
  updateEngineBadge();

  // زر بدء / إيقاف الاستماع
  btnMainListen.addEventListener('click', async () => {
    if (speechEngine.isListening) {
      invalidatePendingTranslations();
      speechEngine.stop();
    } else {
      btnMainListen.disabled = true;
      try {
        invalidatePendingTranslations();
        await speechEngine.start();
      } catch (err) {
        showSessionStatus(err.message || 'تعذر تشغيل الميكروفون', true);
      } finally {
        btnMainListen.disabled = false;
      }
    }
  });

  function updateVoiceControl() {
    const enabled = speechEngine.voiceOutputEnabled;
    const blocked = speechEngine.needsAudioGesture;
    const action = blocked ? 'تفعيل الصوت العربي مجدداً' : enabled ? 'كتم الترجمة الصوتية' : 'تشغيل الترجمة الصوتية';
    btnToggleVoice.setAttribute('aria-label', action);
    btnToggleVoice.title = action;
    btnToggleVoice.setAttribute('aria-pressed', String(enabled && !blocked));
    btnToggleVoice.className = `voice-btn ${enabled && !blocked ? 'active' : 'muted'}`;
    voiceIcon.textContent = blocked ? '🔈' : enabled ? '🔊' : '🔇';
    btnToggleVoice.querySelector('strong').textContent = enabled && !blocked ? 'الترجمة الصوتية: مفعّلة' : 'اضغط لتشغيل الصوت العربي';
    voiceStatusHint.textContent = enabled ? 'نطق العبارات العربية' : 'الصوت مكتوم';
  }

  btnToggleVoice.addEventListener('click', () => {
    if (audioFeedback) audioFeedback.hidden = true;
    speechEngine.setVoiceOutput(speechEngine.needsAudioGesture || !speechEngine.voiceOutputEnabled);
    updateVoiceControl();
    if (!speechEngine.voiceOutputEnabled && audioFeedback) {
      audioFeedback.hidden = false;
      audioFeedback.textContent = 'الصوت مكتوم · اضغط السماعة لتفعيله';
    }
  });
  btnTestVoice?.addEventListener('click', () => {
    speechEngine.cancelSpeech();
    speechEngine.setVoiceOutput(true);
    updateVoiceControl();
    speechEngine.speakArabic('الصوت العربي يعمل الآن');
  });

  // تكبير الخط
  btnFontToggle.addEventListener('click', () => {
    currentFontIndex = (currentFontIndex + 1) % fontSizes.length;
    const nextSize = fontSizes[currentFontIndex];
    autocueFeed.style.setProperty('--subtitle-size', `${nextSize}px`);
    if (autocuePlayer.following) autocuePlayer.centerCurrent('auto');
    btnFontToggle.querySelector('span').textContent = `A (${nextSize}px)`;
  });

  // مسح الشاشة الحالية
  btnClearScreen.addEventListener('click', () => {
    invalidatePendingTranslations();
    if (autocueFeed) {
      autocuePlayer.clear();
      autocueFeed.innerHTML = `
        <div class="autocue-line active" id="autocue-placeholder">
          <div class="line-arabic">تم مسح الشاشة. بانتظار تحدث الضيف...</div>
        </div>
      `;
      autocuePlaceholder = document.getElementById('autocue-placeholder');
    }
  });

  // أزرار التحكم في ملقن النصوص (Autocue Controls)
  if (btnAutocueScroll) {
    btnAutocueScroll.addEventListener('click', () => {
      autoScrollEnabled = !autoScrollEnabled;
      btnAutocueScroll.setAttribute('aria-pressed', String(autoScrollEnabled));
      btnAutocueScroll.classList.toggle('active', autoScrollEnabled);
      autocuePlayer.setPaused(!autoScrollEnabled);
      autocuePlayer.setFollowing(autoScrollEnabled);
      btnAutocueScroll.textContent = autoScrollEnabled ? 'متابعة المباشر: مفعّلة' : 'متابعة المباشر: متوقفة';
    });
  }

  // إضافة عنصر لسجل المحادثات
  function addTranscriptRecord(item) {
    if (emptyTranscriptMsg) emptyTranscriptMsg.style.display = 'none';
    transcriptHistory.push(item);
    if (transcriptHistory.length > 150) {
      transcriptHistory.shift();
      transcriptItemsBox.lastElementChild?.remove();
    }

    const div = document.createElement('div');
    div.className = 'transcript-entry';
    div.innerHTML = `
      <div class="entry-time">${escapeHtml(item.time)}</div>
      <div class="entry-arabic">${escapeHtml(item.arabic)}</div>
      <div class="entry-english">${escapeHtml(item.english)}</div>
    `;

    transcriptItemsBox.insertBefore(div, transcriptItemsBox.firstChild);
    try {
      localStorage.setItem(`turjuman_history_${roomId}`, JSON.stringify(transcriptHistory));
    } catch (_) {
      showSessionStatus('السجل متاح لهذه الجلسة فقط؛ تعذر حفظه على الجهاز.', true);
    }
  }

  // استرجاع السجل السابق إن وجد
  const savedHistory = localStorage.getItem(`turjuman_history_${roomId}`);
  if (savedHistory) {
    try {
      const parsed = JSON.parse(savedHistory);
      if (Array.isArray(parsed) && parsed.length > 0) {
        parsed.slice(-150).filter(item => item && typeof item.english === 'string' && typeof item.arabic === 'string' && typeof item.time === 'string').forEach(item => addTranscriptRecord(item));
      }
    } catch (e) {}
  }

  // نوافذ المودال: مشاركة الغرفة مع الهاتف
  const fullRoomUrl = `${window.location.origin}/room/${encodeURIComponent(roomId)}`;
  roomUrlInput.value = fullRoomUrl;


  btnShareRoom.addEventListener('click', () => {
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(fullRoomUrl)}`;
    shareModal.showModal();
  });

  closeShareModal.addEventListener('click', () => {
    shareModal.close();
  });

  btnCopyLink.addEventListener('click', async () => {
    await navigator.clipboard.writeText(fullRoomUrl);
    btnCopyLink.textContent = 'تم النسخ ✓';
    setTimeout(() => { btnCopyLink.textContent = 'نسخ الرابط'; }, 2000);
  });

  // نافذة الإعدادات
  btnOpenSettings.addEventListener('click', () => {
    settingEngineSelect.value = translator.engine;
    geminiKeyInput.value = translator.getCustomApiKey();
    speechSpeedRange.value = speechEngine.baseRate;
    speechSpeedVal.textContent = `${speechEngine.baseRate}x`;
    settingSpeechLang.value = speechEngine.speechLang;
    settingsModal.showModal();
  });

  closeSettingsModal.addEventListener('click', () => {
    settingsModal.close();
  });

  speechSpeedRange.addEventListener('input', () => {
    speechSpeedVal.textContent = `${speechSpeedRange.value}x`;
  });

  btnSaveSettings.addEventListener('click', () => {
    translator.setEngine(settingEngineSelect.value);
    translator.setCustomApiKey(geminiKeyInput.value);
    speechEngine.baseRate = parseFloat(speechSpeedRange.value);
    invalidatePendingTranslations();
    speechEngine.setLanguage(settingSpeechLang.value);
    updateEngineBadge();
    settingsModal.close();
  });

  // نافذة سجل المحادثة
  btnOpenTranscript.addEventListener('click', () => {
    transcriptModal.showModal();
  });

  closeTranscriptModal.addEventListener('click', () => {
    transcriptModal.close();
  });

  btnCopyTranscript.addEventListener('click', async () => {
    if (transcriptHistory.length === 0) return alert('السجل فارغ');
    const txt = transcriptHistory.map(i => `[${i.time}]\nEN: ${i.english}\nAR: ${i.arabic}\n`).join('\n');
    await navigator.clipboard.writeText(txt);
    btnCopyTranscript.textContent = 'تم النسخ ✓';
    setTimeout(() => { btnCopyTranscript.textContent = 'نسخ النص كاملاً'; }, 2000);
  });

  btnDownloadTranscript.addEventListener('click', () => {
    if (transcriptHistory.length === 0) return alert('السجل فارغ');
    const txt = transcriptHistory.map(i => `[${i.time}]\nEnglish: ${i.english}\nالعربية: ${i.arabic}\n-------------------`).join('\n');
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Turjuman-${roomId}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  });

  btnClearTranscript.addEventListener('click', () => {
    if (confirm('هل أنت متأكد من رغبتك في مسح السجل؟')) {
      transcriptHistory = [];
      transcriptItemsBox.innerHTML = '<div class="empty-transcript" id="empty-transcript-msg">تم مسح السجل.</div>';
      emptyTranscriptMsg = document.getElementById('empty-transcript-msg');
      localStorage.removeItem(`turjuman_history_${roomId}`);
    }
  });

  // إغلاق النوافذ عند النقر على الخلفية المعتمة
  [shareModal, settingsModal, transcriptModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.close();
    });
  });

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});

