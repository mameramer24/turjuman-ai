/**
 * سكريبت استوديو الترجمة الفورية ZoomLive AR Studio
 */

document.addEventListener('DOMContentLoaded', async () => {
  const translator = new LiveTranslator();

  // عناصر الواجهة
  const btnToggleListen = document.getElementById('btn-toggle-listen');
  const listenIndicator = document.getElementById('listen-indicator');
  const listenBtnText = document.getElementById('listen-btn-text');
  const speechStatus = document.getElementById('speech-status');
  const visualizer = document.getElementById('visualizer');
  const currentArabic = document.getElementById('current-arabic');
  const currentEnglish = document.getElementById('current-english');
  const btnTogglePip = document.getElementById('btn-toggle-pip');
  const inputSource = document.getElementById('input-source');
  const speechLang = document.getElementById('speech-lang');
  const fontSizeSlider = document.getElementById('font-size-slider');
  const fontSizeVal = document.getElementById('font-size-val');
  const transcriptList = document.getElementById('transcript-list');
  const emptyState = document.getElementById('empty-state');
  const btnCopyAll = document.getElementById('btn-copy-all');
  const btnDownloadTxt = document.getElementById('btn-download-txt');
  const btnClearHistory = document.getElementById('btn-clear-history');

  let isListening = false;
  let recognition = null;
  let pipWindow = null;
  let transcriptHistory = [];
  let interimDebounceTimer = null;
  let selectedDeviceId = 'default';

  // التحقق من دعم ميزة التعرف على الصوت
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    speechStatus.textContent = 'المتصفح لا يدعم SpeechRecognition (يرجى استخدام Google Chrome)';
    speechStatus.style.color = '#ef4444';
    btnToggleListen.disabled = true;
    return;
  }

  // ملء قائمة أجهزة الإدخال (الميكروفونات وصوت النظام)
  async function populateAudioDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      
      inputSource.innerHTML = '<option value="default">الميكروفون الافتراضي / صوت السماعات</option>';
      audioInputs.forEach((device, index) => {
        if (device.deviceId && device.deviceId !== 'default') {
          const opt = document.createElement('option');
          opt.value = device.deviceId;
          opt.textContent = device.label || `ميكروفون ${index + 1}`;
          inputSource.appendChild(opt);
        }
      });
    } catch (e) {
      console.warn('Could not enumerate audio devices:', e);
    }
  }

  // إعداد محرك التعرف على الصوت
  function setupRecognition() {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = speechLang.value || 'en-US';

    recognition.onstart = () => {
      speechStatus.textContent = 'يستمع الآن لصوت المتحدث...';
      speechStatus.className = 'badge active';
      visualizer.classList.add('active');
      listenIndicator.classList.add('active');
      btnToggleListen.classList.add('listening');
      listenBtnText.textContent = 'إيقاف الاستماع';
    };

    recognition.onresult = async (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item.isFinal) {
          finalTranscript += item[0].transcript;
        } else {
          interimTranscript += item[0].transcript;
        }
      }

      // معالجة النص المؤقت (أثناء تحدث الضيف)
      if (interimTranscript) {
        currentEnglish.textContent = interimTranscript;
        
        // ترجمة سريعة معتمدة على التوقف القصير
        clearTimeout(interimDebounceTimer);
        interimDebounceTimer = setTimeout(async () => {
          if (interimTranscript.trim().length > 3) {
            const tempArabic = await translator.translate(interimTranscript, 'en', 'ar');
            currentArabic.textContent = tempArabic;
            currentArabic.style.opacity = '0.75';
            broadcastSubtitle(tempArabic, interimTranscript, true);
          }
        }, 220);
      }

      // معالجة الجملة المكتملة (عند انتهاء الضيف من جملة)
      if (finalTranscript.trim()) {
        clearTimeout(interimDebounceTimer);
        currentEnglish.textContent = finalTranscript;
        
        const arabicResult = await translator.translate(finalTranscript, 'en', 'ar');
        currentArabic.textContent = arabicResult;
        currentArabic.style.opacity = '1';

        // إضافة للسجل
        addTranscriptItem({
          time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          english: finalTranscript.trim(),
          arabic: arabicResult.trim()
        });

        // بث للنافذة العائمة وتبويبات زوم
        broadcastSubtitle(arabicResult, finalTranscript, false);
      }
    };

    recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        speechStatus.textContent = 'تم رفض الإذن للوصول للميكروفون، يرجى تفعيله من شريط العنوان';
        stopListening();
      } else if (event.error === 'network') {
        speechStatus.textContent = 'خطأ في الاتصال بالإنترنت أثناء التعرف على الصوت';
      }
    };

    recognition.onend = () => {
      // إعادة التشغيل تلقائياً إذا كان المستخدم لا يزال مفعلاً للاستماع (لمنع الانقطاع عند الصمت)
      if (isListening) {
        try {
          recognition.start();
        } catch (e) {
          console.warn('Recognition restart failed:', e);
        }
      } else {
        speechStatus.textContent = 'متوقف حالياً';
        speechStatus.className = 'badge';
        visualizer.classList.remove('active');
        listenIndicator.classList.remove('active');
        btnToggleListen.classList.remove('listening');
        listenBtnText.textContent = 'بدء الاستماع والترجمة';
      }
    };
  }

  // بدء الاستماع
  async function startListening() {
    try {
      // طلب الإذن الصوتي والتأكد من تفعيل الأجهزة
      await navigator.mediaDevices.getUserMedia({
        audio: selectedDeviceId === 'default' ? true : { deviceId: { exact: selectedDeviceId } }
      });
      await populateAudioDevices();

      if (!recognition) {
        setupRecognition();
      } else {
        recognition.lang = speechLang.value;
      }

      isListening = true;
      recognition.start();
    } catch (err) {
      alert('يرجى السماح للإضافة باستخدام الميكروفون للتمكن من التقاط صوت المتحدث في زوم.\nالخطأ: ' + err.message);
      stopListening();
    }
  }

  // إيقاف الاستماع
  function stopListening() {
    isListening = false;
    if (recognition) {
      try {
        recognition.stop();
      } catch (e) {}
    }
    speechStatus.textContent = 'متوقف';
    speechStatus.className = 'badge';
    visualizer.classList.remove('active');
    listenIndicator.classList.remove('active');
    btnToggleListen.classList.remove('listening');
    listenBtnText.textContent = 'بدء الاستماع والترجمة';
  }

  // زر التبديل بين الاستماع والإيقاف
  btnToggleListen.addEventListener('click', () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  });

  // تغيير لغة التعرف
  speechLang.addEventListener('change', () => {
    if (recognition) {
      recognition.lang = speechLang.value;
      if (isListening) {
        recognition.stop();
      }
    }
  });

  // تغيير جهاز الصوت
  inputSource.addEventListener('change', () => {
    selectedDeviceId = inputSource.value;
    if (isListening) {
      stopListening();
      setTimeout(startListening, 300);
    }
  });

  // سلايدر حجم الخط
  fontSizeSlider.addEventListener('input', () => {
    const size = fontSizeSlider.value;
    fontSizeVal.textContent = `${size}px`;
    currentArabic.style.fontSize = `${size}px`;
    if (pipWindow && !pipWindow.closed) {
      const pipAr = pipWindow.document.getElementById('pip-arabic');
      if (pipAr) pipAr.style.fontSize = `${size}px`;
    }
  });

  // بث الترجمة لجميع التبويبات النشطة والشريط العائم
  async function broadcastSubtitle(arabic, english, isInterim) {
    // 1. تحديث نافذة Picture-in-Picture إذا كانت مفتوحة
    if (pipWindow && !pipWindow.closed) {
      const pipAr = pipWindow.document.getElementById('pip-arabic');
      const pipEn = pipWindow.document.getElementById('pip-english');
      if (pipAr) {
        pipAr.textContent = arabic;
        pipAr.style.opacity = isInterim ? '0.75' : '1';
      }
      if (pipEn) {
        pipEn.textContent = english;
      }
    }

    // 2. إرسال لتبويبات المتصفح (موقع زوم أو غيره)
    try {
      const tabs = await chrome.tabs.query({});
      tabs.forEach(tab => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'NEW_SUBTITLE',
            translated: arabic,
            original: english,
            isInterim: isInterim
          }).catch(() => {});
        }
      });
    } catch (e) {
      // تجاهل أخطاء التبويبات غير القابلة للحقن
    }
  }

  // فتح وإدارة نافذة Picture-in-Picture
  btnTogglePip.addEventListener('click', async () => {
    try {
      if ('documentPictureInPicture' in window) {
        if (pipWindow && !pipWindow.closed) {
          pipWindow.focus();
          return;
        }

        pipWindow = await window.documentPictureInPicture.requestWindow({
          width: 540,
          height: 190
        });

        const style = pipWindow.document.createElement('style');
        style.textContent = `
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            background-color: #090d16;
            color: #f8fafc;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", Tahoma, sans-serif;
            direction: rtl;
            text-align: right;
            padding: 16px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            height: 100vh;
            border-top: 3px solid #38bdf8;
          }
          .pip-badge {
            font-size: 11px;
            color: #10b981;
            margin-bottom: 6px;
            font-weight: 600;
          }
          .pip-arabic {
            font-size: ${fontSizeSlider.value}px;
            font-weight: 700;
            color: #38bdf8;
            line-height: 1.45;
            margin-bottom: 8px;
            text-shadow: 0 0 16px rgba(56, 189, 248, 0.3);
            word-break: break-word;
          }
          .pip-english {
            font-size: 13px;
            color: #94a3b8;
            font-style: italic;
            direction: ltr;
            text-align: left;
            word-break: break-word;
          }
        `;
        pipWindow.document.head.appendChild(style);

        pipWindow.document.body.innerHTML = `
          <div class="pip-badge">● ترجمة فورية حية (Always on Top)</div>
          <div id="pip-arabic" class="pip-arabic">${currentArabic.textContent}</div>
          <div id="pip-english" class="pip-english">${currentEnglish.textContent}</div>
        `;

        pipWindow.addEventListener('pagehide', () => {
          pipWindow = null;
        });
      } else {
        alert('ميزة النافذة العائمة Always-on-Top مدعومة في Google Chrome إصدار 116 وما فوق.');
      }
    } catch (err) {
      console.warn('PiP error:', err);
    }
  });

  // إضافة عنصر إلى سجل المحادثات
  function addTranscriptItem(item) {
    if (emptyState) {
      emptyState.style.display = 'none';
    }

    transcriptHistory.push(item);

    const div = document.createElement('div');
    div.className = 'transcript-item';
    div.innerHTML = `
      <div class="item-meta">
        <span>${item.time}</span>
      </div>
      <div class="item-arabic">${escapeHtml(item.arabic)}</div>
      <div class="item-english">${escapeHtml(item.english)}</div>
    `;

    transcriptList.insertBefore(div, transcriptList.firstChild);

    // حفظ في التخزين المحلي
    chrome.storage.local.set({ zoomlive_transcript: transcriptHistory.slice(-200) });
  }

  // نسخ كامل السجل
  btnCopyAll.addEventListener('click', async () => {
    if (transcriptHistory.length === 0) {
      alert('السجل فارغ حالياً.');
      return;
    }

    const fullText = transcriptHistory
      .map(item => `[${item.time}]\nEN: ${item.english}\nAR: ${item.arabic}\n`)
      .join('\n');

    await navigator.clipboard.writeText(fullText);
    const originalText = btnCopyAll.textContent;
    btnCopyAll.textContent = 'تم النسخ بنجاح ✓';
    setTimeout(() => {
      btnCopyAll.textContent = originalText;
    }, 2000);
  });

  // تنزيل كملف نصي
  btnDownloadTxt.addEventListener('click', () => {
    if (transcriptHistory.length === 0) {
      alert('السجل فارغ حالياً.');
      return;
    }

    const fullText = transcriptHistory
      .map(item => `[${item.time}]\nEnglish: ${item.english}\nالعربية: ${item.arabic}\n-------------------`)
      .join('\n');

    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ZoomLive-Transcript-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // مسح السجل
  btnClearHistory.addEventListener('click', () => {
    if (confirm('هل أنت متأكد من رغبتك في مسح سجل الترجمة؟')) {
      transcriptHistory = [];
      transcriptList.innerHTML = '<div class="empty-state" id="empty-state">تم مسح السجل. ستظهر الجمل الجديدة هنا عند بدء التحدث.</div>';
      chrome.storage.local.remove('zoomlive_transcript');
    }
  });

  // استرجاع السجل المخزن سابقاً إن وجد
  const stored = await chrome.storage.local.get('zoomlive_transcript');
  if (stored && Array.isArray(stored.zoomlive_transcript) && stored.zoomlive_transcript.length > 0) {
    stored.zoomlive_transcript.forEach(item => addTranscriptItem(item));
  }

  // دالة مساعدة لتجنب ثغرات XSS
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // التحقق من صلاحيات الأجهزة المتاحة مبدئياً
  await populateAudioDevices();
});
