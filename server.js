require('dotenv').config();
const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// التحقق من الإعدادات المتاحة
app.get('/api/config', (req, res) => {
  res.json({
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    version: '3.0.0'
  });
});

// ذاكرة تخزين مؤقت داخلية سريعة جداً (Memory Cache)
const translationCache = new Map();

/**
 * الترجمة عبر محرك Google Gemini AI فائق الدقة
 * مهيأ بأقصى سرعة وأعلى فهم لسياق اجتماعات زوم ومصطلحات الأعمال
 */
async function translateWithGemini(text, apiKey, from = 'en', to = 'ar') {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const prompt = `System: You are an elite simultaneous conference interpreter for live Zoom/business meetings.
Translate the spoken text from ${from} to ${to} in natural, professional language.
Context rules:
- Translate idioms and conversational expressions naturally (e.g. "touch base" -> نتواصل، "on the same page" -> متفقون).
- Keep company names, acronyms, and technical terms accurate.
- Output ONLY the translated text. Do not add quotes, notes, or explanations. Preserve proper names and technical abbreviations when appropriate.

Input: "${text}"`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1, // أقصى دقة وضبط للترجمة
          maxOutputTokens: 1024, // استجابة سريعة جداً بدون إسهاب
          topP: 0.8
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini status ${response.status}`);
    }

    const data = await response.json();
    const rawOutput = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawOutput) throw new Error('Empty response from Gemini');
    return rawOutput.trim().replace(/^["']|["']$/g, '');
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchTranslationJSON(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Translation HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * المحرك العصبي الفوري متعدد المسارات (Multi-tier Instant Engine)
 * يتضمن مسارات احتياطية متعددة لتفادي أي حظر أو بطء في سيرفرات الـ VPS والـ Datacenters
 */
async function translateWithInstantEngine(text, from = 'en', to = 'ar') {
  // 1. المسار الأساسي: سيرفر كروم الرسمي (clients5.google.com) - فائق السرعة ومفتوح لسيرفرات الاستضافة
  try {
    const url1 = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}&q=${encodeURIComponent(text)}`;
    const data1 = await fetchTranslationJSON(url1);
    const trans = typeof data1?.[0] === 'string' ? data1[0] : data1?.[0]?.[0];
    if (typeof trans === 'string' && trans.trim()) return trans.trim();
  } catch (e) {
    console.warn('Endpoint 1 (clients5) error:', e.message);
  }

  // 2. المسار الاحتياطي الثاني: سيرفر gtx
  try {
    const url2 = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`;
    const data2 = await fetchTranslationJSON(url2);
    if (Array.isArray(data2?.[0])) {
      const trans = data2[0].map(item => item?.[0] || '').join('').trim();
      if (trans) return trans;
    }
  } catch (e) {
    console.warn('Endpoint 2 (gtx) error:', e.message);
  }

  // 3. المسار الاحتياطي الثالث: MyMemory
  try {
    const url3 = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(from)}|${encodeURIComponent(to)}`;
    const data3 = await fetchTranslationJSON(url3);
    if (data3?.responseStatus === 200 && typeof data3.responseData?.translatedText === 'string') {
      return data3.responseData.translatedText.trim();
    }
  } catch (e) {}

  throw new Error('Translation services unavailable');
}

// مسار الترجمة عالي السرعة والدقة API
app.post('/api/translate', async (req, res) => {
  try {
    const { text, from = 'en', to = 'ar', engine = 'auto', apiKey: clientKey } = req.body || {};
    if (typeof text !== 'string' || text.length > 8000 ||
        typeof from !== 'string' || !/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(from) ||
        typeof to !== 'string' || !/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(to) ||
        !['auto', 'gemini', 'instant'].includes(engine) ||
        (clientKey !== undefined && (typeof clientKey !== 'string' || clientKey.length > 256))) {
      return res.status(400).json({ error: 'Invalid translation request' });
    }
    
    if (!text || !text.trim()) {
      return res.json({ translated: '', engine: 'none' });
    }

    const trimmed = text.trim();
    const cacheKey = `${engine}:${from}:${to}:${trimmed}`;
    
    // فحص الكاش الفوري (زمن استجابة 0ms)
    if (!clientKey && translationCache.has(cacheKey)) {
      return res.json({ ...translationCache.get(cacheKey), cached: true });
    }

    const effectiveKey = clientKey || process.env.GEMINI_API_KEY;
    let translated = '';
    let usedEngine = 'instant';

    // إذا طلب المستخدم الذكاء الاصطناعي وكان المفتاح متوفراً
    if ((engine === 'gemini' || engine === 'auto') && effectiveKey) {
      try {
        translated = await translateWithGemini(trimmed, effectiveKey, from, to);
        usedEngine = 'gemini';
      } catch (geminiError) {
        // في حال بطء أو انقطاع شبكة Gemini، يتم التحويل الفوري التلقائي للمحرك الفوري لمنع تأخر الصوت
        console.warn('Fast fallback triggered:', geminiError.message);
        translated = await translateWithInstantEngine(trimmed, from, to);
        usedEngine = 'instant_fallback';
      }
    } else {
      // المحرك الفوري المباشر فائق السرعة
      translated = await translateWithInstantEngine(trimmed, from, to);
      usedEngine = 'instant';
    }

    if (!translated?.trim()) throw new Error('Empty translation');

    // حفظ في الكاش السريع
    if (!clientKey) translationCache.set(cacheKey, { translated, engine: usedEngine });
    if (translationCache.size > 3000) {
      const oldestKey = translationCache.keys().next().value;
      translationCache.delete(oldestKey);
    }

    res.json({
      original: trimmed,
      translated,
      engine: usedEngine
    });
  } catch (error) {
    console.warn('Translation unavailable:', error.message);
    res.status(503).json({ error: 'Translation unavailable. Please retry.' });
  }
});

// مسار الغرف المباشرة
app.get('/room/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// إدارة اتصالات WebSocket للبث المباشر بين الأجهزة
const rooms = new Map();

wss.on('connection', (ws) => {
  let currentRoom = null;
  ws.on('error', () => console.warn('WebSocket connection error'));

  ws.on('message', (messageRaw) => {
    try {
      const msg = JSON.parse(messageRaw.toString());

      if (msg.type === 'join') {
        if (typeof msg.roomId !== 'string' || !/^[\w-]{1,80}$/.test(msg.roomId)) return;
        if (currentRoom && rooms.has(currentRoom)) {
          rooms.get(currentRoom).delete(ws);
          if (rooms.get(currentRoom).size === 0) rooms.delete(currentRoom);
          else broadcastToRoom(currentRoom, { type: 'room_status', clientCount: rooms.get(currentRoom).size }, ws);
        }
        currentRoom = msg.roomId || 'default';
        if (!rooms.has(currentRoom)) {
          rooms.set(currentRoom, new Set());
        }
        rooms.get(currentRoom).add(ws);
        
        ws.send(JSON.stringify({
          type: 'joined',
          roomId: currentRoom,
          clientCount: rooms.get(currentRoom).size
        }));

        broadcastToRoom(currentRoom, {
          type: 'room_status',
          clientCount: rooms.get(currentRoom).size
        }, ws);
      } 
      else if (msg.type === 'broadcast_subtitle') {
        if (typeof msg.original !== 'string' || typeof msg.translated !== 'string' ||
            msg.original.length > 10000 || msg.translated.length > 20000) return;
        if (currentRoom && rooms.has(currentRoom)) {
          broadcastToRoom(currentRoom, {
            type: 'live_subtitle',
            original: msg.original,
            translated: msg.translated,
            isInterim: !!msg.isInterim,
            segmentId: typeof msg.segmentId === 'string' ? msg.segmentId.slice(0, 200) : undefined,
            revision: Number.isSafeInteger(msg.revision) ? msg.revision : 0,
            speaker: msg.speaker || 'المتحدث',
            timestamp: msg.timestamp || new Date().toLocaleTimeString('ar-EG')
          }, ws);
        }
      }
    } catch (e) {
      console.warn('Invalid WS message:', e);
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms.has(currentRoom)) {
      const roomSet = rooms.get(currentRoom);
      roomSet.delete(ws);
      if (roomSet.size === 0) {
        rooms.delete(currentRoom);
      } else {
        broadcastToRoom(currentRoom, {
          type: 'room_status',
          clientCount: roomSet.size
        });
      }
    }
  });
});

function broadcastToRoom(roomId, data, senderWs = null) {
  if (!rooms.has(roomId)) return;
  const payload = JSON.stringify(data);
  for (const client of rooms.get(roomId)) {
    if (client !== senderWs && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

server.listen(PORT, () => {
  console.log(`🚀 Turjuman AI High-Speed Server running at http://localhost:${PORT}`);
  console.log(`✨ Latency-optimized for live simultaneous interpretation`);
});
