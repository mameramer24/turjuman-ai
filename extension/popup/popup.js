document.addEventListener('DOMContentLoaded', () => {
  const btnToggleOverlay = document.getElementById('btn-toggle-overlay');
  const btnOpenPip = document.getElementById('btn-open-pip');
  const btnOpenStudio = document.getElementById('btn-open-studio');

  // إظهار أو إخفاء الشريط في التبويب الحالي
  btnToggleOverlay.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_OVERLAY' }).catch(() => {
        // إذا لم يكن السكريبت محقوناً بعد (مثل صفحات كانت مفتوحة قبل تثبيت الإضافة)، نقوم بحقنه
        chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['content/content.css']
        }).catch(() => {});

        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['utils/translator.js', 'utils/captions-observer.js', 'content/content.js']
        }).then(() => {
          chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_OVERLAY' });
        }).catch((err) => {
          alert('يرجى تحديث الصفحة الحالية لتفعيل الإضافة عليها (الصفحات الخاصة مثل chrome:// لا يمكن ترجمتها).');
        });
      });
    }
  });

  // فتح نافذة طافية Always-on-Top خارج المتصفح
  btnOpenPip.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'START_LIVE_PIP' }).catch(() => {
        // إذا لم يكن متاحاً من التبويب، نفتحه عبر الاستوديو
        chrome.tabs.create({ url: chrome.runtime.getURL('studio/studio.html') });
      });
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL('studio/studio.html') });
    }
  });

  // فتح الاستوديو الكامل
  btnOpenStudio.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('studio/studio.html') });
  });
});
