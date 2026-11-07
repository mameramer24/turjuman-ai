/**
 * Content Script: شريط الترجمة العائم فوق أي فيديو (YouTube, Zoom, Google Meet)
 * يدعم الترجمة التلقائية لتسميات يوتيوب وزوم، والترجمة المباشرة من الميكروفون/الصوت
 * ويدعم النافذة العائمة فوق الشاشة (Picture-in-Picture Always-on-Top)
 */

(function () {
  if (window.__zoomlive_injected) {
    const root = document.getElementById('zoomlive-ar-overlay-root');
    if (root) root.classList.remove('zoomlive-hidden');
    return;
  }
  window.__zoomlive_injected = true;

  let overlayRoot = null;
  let arabicTextEl = null;
  let englishTextEl = null;
  let speakerBadgeEl = null;
  let statusDotEl = null;
  let micBtnEl = null;
  let currentFontSize = 24;
  let captionsObserver = null;
  let recognition = null;
  let isListeningMic = false;
  let micVersion = 0;
  let micDraftTimer = null;
  const translator = new LiveTranslator();

  // 1. إنشاء واجهة شريط الترجمة العائم
  function createOverlay() {
    if (document.getElementById('zoomlive-ar-overlay-root')) return;

    overlayRoot = document.createElement('div');
    overlayRoot.id = 'zoomlive-ar-overlay-root';

    overlayRoot.innerHTML = `
      <div class="zoomlive-card">
        <div class="zoomlive-header" id="zoomlive-drag-handle">
          <div class="zoomlive-title-group">
            <span class="zoomlive-status-dot" id="zoomlive-status-dot"></span>
            <span class="zoomlive-title">مترجم الشاشة الفوري (عربي)</span>
          </div>
          <div class="zoomlive-tools">
            <button class="zoomlive-btn zoomlive-btn-mic" id="zoomlive-btn-mic" title="بدء / إيقاف التقاط الصوت">🎙️ استماع للصوت</button>
            <button class="zoomlive-btn zoomlive-btn-pip" id="zoomlive-btn-pip" title="فتح نافذة طافية خارج المتصفح فوق كل البرامج (Always-on-Top)">⧉ نافذة طافية</button>
            <button class="zoomlive-btn" id="zoomlive-btn-font-plus" title="تكبير الخط">A+</button>
            <button class="zoomlive-btn" id="zoomlive-btn-font-minus" title="تصغير الخط">A-</button>
            <button class="zoomlive-btn" id="zoomlive-btn-toggle" title="طي / توسيع">_</button>
            <button class="zoomlive-btn zoomlive-btn-close" id="zoomlive-btn-close" title="إغلاق">✕</button>
          </div>
        </div>
        <div class="zoomlive-body" id="zoomlive-autocue-viewport">
          <div class="zoomlive-autocue-track" id="zoomlive-autocue-track">
            <div class="zoomlive-autocue-line active" id="zoomlive-placeholder-line">
              <div class="zoomlive-speaker-badge" id="zoomlive-speaker" style="display: none;">مباشر</div>
              <div class="zoomlive-arabic-text" id="zoomlive-arabic">شغّل الفيديو في يوتيوب أو زوم، وستظهر الترجمة العربية فورياً سطر بسطر بنظام الأوتو كيو...</div>
              <div class="zoomlive-english-text" id="zoomlive-english">(Waiting for speech / subtitles...)</div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlayRoot);

    arabicTextEl = document.getElementById('zoomlive-arabic');
    englishTextEl = document.getElementById('zoomlive-english');
    speakerBadgeEl = document.getElementById('zoomlive-speaker');
    statusDotEl = document.getElementById('zoomlive-status-dot');
    micBtnEl = document.getElementById('zoomlive-btn-mic');

    setupInteractions();
    setupDraggable();
  }

  // 2. تفعيل أدوات التحكم
  function setupInteractions() {
    const btnFontPlus = document.getElementById('zoomlive-btn-font-plus');
    const btnFontMinus = document.getElementById('zoomlive-btn-font-minus');
    const btnToggle = document.getElementById('zoomlive-btn-toggle');
    const btnClose = document.getElementById('zoomlive-btn-close');
    const btnPip = document.getElementById('zoomlive-btn-pip');

    btnFontPlus.addEventListener('click', () => {
      if (currentFontSize < 40) {
        currentFontSize += 2;
        overlayRoot.style.setProperty('--subtitle-size', `${currentFontSize}px`);
      }
    });

    btnFontMinus.addEventListener('click', () => {
      if (currentFontSize > 14) {
        currentFontSize -= 2;
        overlayRoot.style.setProperty('--subtitle-size', `${currentFontSize}px`);
      }
    });

    btnToggle.addEventListener('click', () => {
      overlayRoot.classList.toggle('zoomlive-collapsed');
    });

    btnClose.addEventListener('click', () => {
      overlayRoot.classList.add('zoomlive-hidden');
      if (isListeningMic) stopMicListening(false);
      captionsObserver?.stop();
    });

    micBtnEl.addEventListener('click', () => {
      if (isListeningMic) {
        stopMicListening();
      } else {
        startMicListening();
      }
    });

    btnPip.addEventListener('click', async () => {
      await openPictureInPicture();
    });
  }

  // 3. فتح نافذة Picture-in-Picture طافية خارج المتصفح فوق كل البرامج
  async function openPictureInPicture() {
    try {
      if ('documentPictureInPicture' in window) {
        if (window.__zoomlive_pip && !window.__zoomlive_pip.closed) {
          window.__zoomlive_pip.focus();
          return;
        }

        const pipWin = await window.documentPictureInPicture.requestWindow({
          width: 560,
          height: 190
        });

        const style = pipWin.document.createElement('style');
        style.textContent = `
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            background: #090d16;
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
            font-size: ${currentFontSize}px;
            font-weight: 700;
            color: #38bdf8;
            line-height: 1.45;
            margin-bottom: 8px;
            text-shadow: 0 0 16px rgba(56, 189, 248, 0.35);
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
        pipWin.document.head.appendChild(style);

        pipWin.document.body.innerHTML = `
          <div class="pip-badge">● ترجمة فورية طافية فوق الشاشة</div>
          <div id="pip-arabic" class="pip-arabic">${escapeHtml(arabicTextEl.textContent)}</div>
          <div id="pip-english" class="pip-english">${escapeHtml(englishTextEl.textContent)}</div>
        `;

        window.__zoomlive_pip = pipWin;
        pipWin.addEventListener('pagehide', () => {
          window.__zoomlive_pip = null;
        });
      } else {
        alert('ميزة النافذة الطافية Always-on-Top مدعومة في Google Chrome إصدار 116+. يمكنك تحريك الشريط الحالي لأي مكان تريده على الشاشة.');
      }
    } catch (err) {
      console.warn('PiP launch error:', err);
    }
  }

  // 4. ميزة الاستماع المباشر للصوت
  function startMicListening() {
    if (isListeningMic) return;
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('المتصفح لا يدعم SpeechRecognition');
      return;
    }

    try {
      captionsObserver?.stop();
      const version = ++micVersion;
      let revision = 0, segment = 0;
      let finalQueue = Promise.resolve();
      const finalizedIndexes = new Set();
      isListeningMic = true;
      recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        finalizedIndexes.clear();
        micBtnEl.classList.add('active');
        micBtnEl.textContent = '⏹ إيقاف الاستماع';
        statusDotEl.classList.remove('inactive');
      };

      recognition.onresult = (event) => {
        if (!isListeningMic || version !== micVersion) return;
        let interim = '', final = '';
        for (let i = 0; i < event.results.length; i++) {
          const item = event.results[i];
          if (item.isFinal) {
            if (i >= event.resultIndex && !finalizedIndexes.has(i)) {
              finalizedIndexes.add(i);
              final += ' ' + item[0].transcript;
            }
          } else interim += ' ' + item[0].transcript;
        }
        interim = interim.trim();
        final = final.trim();
        const currentRevision = ++revision;
        clearTimeout(micDraftTimer);
        if (final) {
          const id = `mic:${version}:${segment++}`;
          const translated = translator.translate(final, 'en', 'ar');
          finalQueue = finalQueue.then(async () => {
            const arabic = await translated;
            if (!isListeningMic || version !== micVersion) return;
            if (!arabic) { statusDotEl.classList.add('inactive'); return; }
            updateSubtitle({ arabic, english: final, isInterim: false, segmentId: id, revision: currentRevision });
          }).catch(() => {});
        }
        if (interim) {
          const id = `mic:${version}:${segment}`;
          micDraftTimer = setTimeout(async () => {
            const arabic = await translator.translate(interim, 'en', 'ar');
            await finalQueue;
            if (!arabic || !isListeningMic || version !== micVersion || currentRevision !== revision) return;
            updateSubtitle({ arabic, english: interim, isInterim: true, segmentId: id, revision: currentRevision });
          }, 180);
        }
      };

      recognition.onerror = (e) => {
        console.warn('Mic speech recognition error:', e.error);
        if (e.error === 'not-allowed') {
          alert('يرجى السماح للإضافة باستخدام الميكروفون للاستماع لصوت الفيديو.');
          stopMicListening();
        }
      };

      recognition.onend = () => {
        if (isListeningMic) {
          try { recognition.start(); } catch (err) {}
        } else {
          stopMicListening();
        }
      };

      recognition.start();
    } catch (e) {
      stopMicListening();
      alert('تعذر تشغيل الميكروفون: ' + e.message);
    }
  }

  function stopMicListening(resumeCaptions = true) {
    isListeningMic = false;
    micVersion++;
    clearTimeout(micDraftTimer);
    if (recognition) {
      const active = recognition;
      recognition = null;
      active.onend = null;
      active.onresult = null;
      active.onstart = null;
      try { active.stop(); } catch (e) {}
    }
    if (micBtnEl) {
      micBtnEl.classList.remove('active');
      micBtnEl.textContent = '🎙️ استماع للصوت';
    }
    if (resumeCaptions) captionsObserver?.start();
  }

  // 5. دعم سحب الشريط بالماوس
  function setupDraggable() {
    const handle = document.getElementById('zoomlive-drag-handle');
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    handle.addEventListener('mousedown', (e) => {
      if (e.target.tagName.toLowerCase() === 'button') return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = overlayRoot.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      overlayRoot.style.left = `${initialLeft}px`;
      overlayRoot.style.top = `${initialTop}px`;
      overlayRoot.style.bottom = 'auto';
      overlayRoot.style.transform = 'none';

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      overlayRoot.style.left = `${initialLeft + dx}px`;
      overlayRoot.style.top = `${initialTop + dy}px`;
    }

    function onMouseUp() {
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
  }

  // 6. تحديث نصوص الترجمة بنظام الأوتو كيو (عبارة بعبارة وسطر بسطر)
  const overlayLines = new Map();
  let captionNumber = 0;

  function updateSubtitle(data) {
    if (!overlayRoot) createOverlay();
    const id = data.segmentId || `caption:${captionNumber++}`;
    let record = overlayLines.get(id);
    if (record && (record.final || (data.revision || 0) < record.revision)) return;
    const track = document.getElementById('zoomlive-autocue-track');
    const viewport = document.getElementById('zoomlive-autocue-viewport');
    document.getElementById('zoomlive-placeholder-line')?.remove();
    if (!record) {
      record = { element: document.createElement('div') };
      overlayLines.set(id, record);
      track?.appendChild(record.element);
    }
    record.final = !data.isInterim;
    record.revision = data.revision || 0;
    record.element.className = `zoomlive-autocue-line active${data.isInterim ? ' interim' : ''}`;
    record.element.innerHTML = `
      <div class="zoomlive-arabic-text">${escapeHtml(data.arabic || '')}</div>
      <div class="zoomlive-english-text">${escapeHtml(data.english || '')}</div>
    `;
    arabicTextEl = record.element.querySelector('.zoomlive-arabic-text');
    englishTextEl = record.element.querySelector('.zoomlive-english-text');
    if (overlayLines.size > 200) {
      const oldest = overlayLines.keys().next().value;
      overlayLines.get(oldest).element.remove();
      overlayLines.delete(oldest);
    }
    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
    }

    // تحديث نافذة PiP الطافية
    if (window.__zoomlive_pip && !window.__zoomlive_pip.closed) {
      const pipDoc = window.__zoomlive_pip.document;
      const pipAr = pipDoc.getElementById('pip-arabic');
      const pipEn = pipDoc.getElementById('pip-english');
      if (pipAr && data.arabic) pipAr.textContent = data.arabic;
      if (pipEn && data.english) pipEn.textContent = data.english;
    }
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // 7. تكامل ذكي مع YouTube
  function setupYouTubeIntegration() {
    if (!window.location.hostname.includes('youtube.com')) return;

    const activateYouTubeCC = () => {
      const ccBtn = document.querySelector('.ytp-subtitles-button');
      if (ccBtn && ccBtn.getAttribute('aria-pressed') !== 'true') {
        ccBtn.click();
      }

      if (!document.getElementById('zoomlive-yt-cleaner')) {
        const style = document.createElement('style');
        style.id = 'zoomlive-yt-cleaner';
        style.textContent = `
          .ytp-caption-window-bottom, .ytp-caption-window-rollup {
            opacity: 0.01 !important;
            pointer-events: none !important;
          }
        `;
        document.head.appendChild(style);
      }
    };

    setTimeout(activateYouTubeCC, 1500);
    window.addEventListener('yt-navigate-finish', () => {
      setTimeout(activateYouTubeCC, 1000);
    });
  }

  // 8. تشغيل مراقب الترجمات
  function initCaptionsDetection() {
    if (typeof MeetingCaptionsObserver !== 'undefined') {
      captionsObserver = new MeetingCaptionsObserver((sub) => {
        updateSubtitle({
          arabic: sub.translated,
          english: sub.original,
          speaker: sub.speaker,
          isInterim: false
        });
      });
      captionsObserver.start();
    }
  }

  // 9. الاستماع لرسائل الإضافة والـ Popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TOGGLE_OVERLAY') {
      if (!overlayRoot) createOverlay();
      overlayRoot.classList.toggle('zoomlive-hidden');
      if (overlayRoot.classList.contains('zoomlive-hidden')) {
        stopMicListening(false);
        captionsObserver?.stop();
      } else captionsObserver?.start();
      sendResponse({ status: 'ok', hidden: overlayRoot.classList.contains('zoomlive-hidden') });
    } else if (message.type === 'START_LIVE_PIP') {
      if (!overlayRoot) createOverlay();
      openPictureInPicture();
      sendResponse({ status: 'ok' });
    } else if (message.type === 'START_MIC_ON_TAB') {
      if (!overlayRoot) createOverlay();
      startMicListening();
      sendResponse({ status: 'ok' });
    } else if (message.type === 'NEW_SUBTITLE') {
      if (isListeningMic) stopMicListening(false);
      captionsObserver?.stop();
      updateSubtitle({
        arabic: message.translated,
        english: message.original,
        speaker: message.speaker,
        isInterim: message.isInterim, segmentId: message.segmentId, revision: message.revision
      });
      sendResponse({ status: 'ok' });
    }
    return true;
  });

  createOverlay();
  setupYouTubeIntegration();
  initCaptionsDetection();
})();
