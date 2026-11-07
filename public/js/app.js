/**
 * السكريبت الرئيسي لتطبيق ترجمان AI (Turjuman AI)
 */

document.addEventListener('DOMContentLoaded', async () => {
  // تحديد الغرفة الحالية من الرابط أو التعيين التلقائي
  const pathParts = window.location.pathname.split('/');
  const roomIndex = pathParts.indexOf('room');
  let roomId = 'meeting-live';
  if (roomIndex !== -1 && pathParts[roomIndex + 1]) {
    roomId = pathParts[roomIndex + 1];
  } else {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('room')) {
      roomId = urlParams.get('room');
    }
  }

  // عناصر الواجهة
  const roomDisplayName = document.getElementById('room-display-name');
  const clientsCount = document.getElementById('clients-count');
  const liveArabic = document.getElementById('live-arabic');
  const liveEnglish = document.getElementById('live-english');
  const soundWave = document.getElementById('sound-wave');
  const btnMainListen = document.getElementById('btn-main-listen');
  const listenText = document.getElementById('listen-text');
  const btnToggleVoice = document.getElementById('btn-toggle-voice');
  const voiceIcon = document.getElementById('voice-icon');
  const voiceStatusHint = document.getElementById('voice-status-hint');
  const btnFontToggle = document.getElementById('btn-font-toggle');
  const engineBadge = document.getElementById('engine-badge');

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
  const emptyTranscriptMsg = document.getElementById('empty-transcript-msg');
  const btnCopyTranscript = document.getElementById('btn-copy-transcript');
  const btnDownloadTranscript = document.getElementById('btn-download-transcript');
  const btnClearTranscript = document.getElementById('btn-clear-transcript');
  const btnClearScreen = document.getElementById('btn-clear-screen');

  roomDisplayName.textContent = `الغرفة: ${roomId}`;

  // إنشاء الوحدات الأساسية
  const translator = new AITranslator();
  let transcriptHistory = [];
  let interimDebounceTimer = null;
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

  // إعداد محرك الصوت
  const speechEngine = new SpeechEngine({
    onSpeakingState: (isSpeaking) => {
      const pill = document.getElementById('earphone-mode-pill');
      const label = document.getElementById('earphone-status-label');
      if (isSpeaking) {
        if (pill) pill.classList.add('speaking');
        if (label) label.textContent = '🔊 ينطق الترجمة العربية في سماعتك الآن...';
      } else {
        if (pill) pill.classList.remove('speaking');
        if (label) label.textContent = '🎧 وضع سماعة الأذن: المايك يستمع للإنجليزي ➔ ينطق الترجمة في سماعتك';
      }
    },
    onStatusChange: (status) => {
      if (status === 'listening') {
        btnMainListen.classList.add('listening');
        listenText.textContent = 'إيقاف الاستماع';
        soundWave.classList.add('active');
      } else {
        btnMainListen.classList.remove('listening');
        listenText.textContent = 'بدء الاستماع والترجمة';
        soundWave.classList.remove('active');
      }
    },
    onAudioActivity: (active) => {
      if (active) {
        soundWave.classList.add('active');
      } else {
        soundWave.classList.remove('active');
      }
    },
    onResult: async (result) => {
      // أثناء تحدث الضيف
      if (result.interim) {
        liveEnglish.textContent = result.interim;
        clearTimeout(interimDebounceTimer);
        interimDebounceTimer = setTimeout(async () => {
          if (result.interim.length > 2) {
            const temp = await translator.translate(result.interim, 'en', 'ar');
            liveArabic.textContent = temp.translated;
            liveArabic.style.opacity = '0.75';
            
            // بث مباشر لجهاز العميل
            socketClient.broadcastSubtitle({
              original: result.interim,
              translated: temp.translated,
              isInterim: true
            });
          }
        }, 110);
      }

      // عند اكتمال الجملة
      if (result.final) {
        clearTimeout(interimDebounceTimer);
        liveEnglish.textContent = result.final;

        const res = await translator.translate(result.final, 'en', 'ar');
        liveArabic.textContent = res.translated;
        liveArabic.style.opacity = '1';

        // نطق الترجمة بالعربية في السماعات إذا كان مفعلاً
        speechEngine.speakArabic(res.translated);

        // إضافة للسجل
        addTranscriptRecord({
          time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          english: result.final,
          arabic: res.translated
        });

        // بث الجملة لجميع المتصلين بالغرفة
        socketClient.broadcastSubtitle({
          original: result.final,
          translated: res.translated,
          isInterim: false
        });
      }
    }
  });

  // إعداد عميل WebSocket للغرفة
  const socketClient = new SocketClient({
    onSubtitle: (data) => {
      // تم استقبال ترجمة من جهاز آخر متصل بنفس الغرفة (مثل كمبيوتر اللابتوب في زوم)
      liveArabic.textContent = data.translated;
      liveArabic.style.opacity = data.isInterim ? '0.75' : '1';
      liveEnglish.textContent = data.original;

      if (!data.isInterim) {
        // نطق الترجمة الفورية عبر هاتف العميل
        speechEngine.speakArabic(data.translated);

        addTranscriptRecord({
          time: data.timestamp || new Date().toLocaleTimeString('ar-EG'),
          english: data.original,
          arabic: data.translated
        });
      }
    },
    onRoomStatus: (data) => {
      if (data.clientCount !== undefined) {
        clientsCount.textContent = `${data.clientCount} متصل`;
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
      engineBadge.style.color = '#a78bfa';
    }
  }
  updateEngineBadge();

  // زر بدء / إيقاف الاستماع
  btnMainListen.addEventListener('click', async () => {
    if (speechEngine.isListening) {
      speechEngine.stop();
    } else {
      try {
        await speechEngine.start();
      } catch (err) {
        alert(err.message || 'حدث خطأ في تشغيل الميكروفون');
      }
    }
  });

  // زر التحكم في الترجمة الصوتية (النطق بالعربية للموبايل)
  btnToggleVoice.addEventListener('click', () => {
    const newState = !speechEngine.voiceOutputEnabled;
    speechEngine.setVoiceOutput(newState);

    if (newState) {
      btnToggleVoice.className = 'voice-btn active';
      voiceIcon.textContent = '🔊';
      btnToggleVoice.querySelector('strong').textContent = 'الترجمة الصوتية: مفعّلة';
      voiceStatusHint.textContent = 'تسمع الترجمة بصوت عربي فوري عبر السماعات';
    } else {
      btnToggleVoice.className = 'voice-btn muted';
      voiceIcon.textContent = '🔇';
      btnToggleVoice.querySelector('strong').textContent = 'الترجمة الصوتية: صامتة';
      voiceStatusHint.textContent = 'عرض الترجمة كتابة فقط بدون نطق صوتي';
    }
  });

  // تكبير الخط
  btnFontToggle.addEventListener('click', () => {
    currentFontIndex = (currentFontIndex + 1) % fontSizes.length;
    const nextSize = fontSizes[currentFontIndex];
    liveArabic.style.fontSize = `${nextSize}px`;
    btnFontToggle.querySelector('span').textContent = `A (${nextSize}px)`;
  });

  // مسح الشاشة الحالية
  btnClearScreen.addEventListener('click', () => {
    liveArabic.textContent = 'بانتظار بدء التحدث بالإنجليزية...';
    liveEnglish.textContent = '(Waiting for speech...)';
  });

  // إضافة عنصر لسجل المحادثات
  function addTranscriptRecord(item) {
    if (emptyTranscriptMsg) emptyTranscriptMsg.style.display = 'none';
    transcriptHistory.push(item);

    const div = document.createElement('div');
    div.className = 'transcript-entry';
    div.innerHTML = `
      <div class="entry-time">${item.time}</div>
      <div class="entry-arabic">${escapeHtml(item.arabic)}</div>
      <div class="entry-english">${escapeHtml(item.english)}</div>
    `;

    transcriptItemsBox.insertBefore(div, transcriptItemsBox.firstChild);
    localStorage.setItem(`turjuman_history_${roomId}`, JSON.stringify(transcriptHistory.slice(-150)));
  }

  // استرجاع السجل السابق إن وجد
  const savedHistory = localStorage.getItem(`turjuman_history_${roomId}`);
  if (savedHistory) {
    try {
      const parsed = JSON.parse(savedHistory);
      if (Array.isArray(parsed) && parsed.length > 0) {
        parsed.forEach(item => addTranscriptRecord(item));
      }
    } catch (e) {}
  }

  // نوافذ المودال: مشاركة الغرفة مع الهاتف
  const fullRoomUrl = `${window.location.origin}/room/${encodeURIComponent(roomId)}`;
  roomUrlInput.value = fullRoomUrl;
  qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(fullRoomUrl)}`;

  btnShareRoom.addEventListener('click', () => {
    shareModal.classList.add('open');
  });

  closeShareModal.addEventListener('click', () => {
    shareModal.classList.remove('open');
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
    speechSpeedRange.value = speechEngine.speechRate;
    speechSpeedVal.textContent = `${speechEngine.speechRate}x`;
    settingsModal.classList.add('open');
  });

  closeSettingsModal.addEventListener('click', () => {
    settingsModal.classList.remove('open');
  });

  speechSpeedRange.addEventListener('input', () => {
    speechSpeedVal.textContent = `${speechSpeedRange.value}x`;
  });

  btnSaveSettings.addEventListener('click', () => {
    translator.setEngine(settingEngineSelect.value);
    translator.setCustomApiKey(geminiKeyInput.value);
    speechEngine.speechRate = parseFloat(speechSpeedRange.value);
    speechEngine.setLanguage(settingSpeechLang.value);
    updateEngineBadge();
    settingsModal.classList.remove('open');
  });

  // نافذة سجل المحادثة
  btnOpenTranscript.addEventListener('click', () => {
    transcriptModal.classList.add('open');
  });

  closeTranscriptModal.addEventListener('click', () => {
    transcriptModal.classList.remove('open');
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
      transcriptItemsBox.innerHTML = '<div class="empty-transcript">تم مسح السجل.</div>';
      localStorage.removeItem(`turjuman_history_${roomId}`);
    }
  });

  // إغلاق النوافذ عند النقر على الخلفية المعتمة
  [shareModal, settingsModal, transcriptModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });
  });

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});

