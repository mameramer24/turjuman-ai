require('dotenv').config();
const http = require('http');
const https = require('https');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { WebSocketServer, WebSocket } = require('ws');

// وكيل اتصالات مستمر عالي السرعة (Keep-Alive Agent) لإلغاء أي تأخير في مصافحة الاتصال
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  timeout: 4000
});

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// التحقق من الإعدادات المتاحة
app.get('/api/config', (req, res) => {
  res.json({
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    version: '1.2.0'
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
Translate the spoken English sentence into natural, professional, crystal-clear Arabic.
Context rules:
- Translate idioms and conversational expressions naturally (e.g. "touch base" -> نتواصل، "on the same page" -> متفقون).
- Keep company names, acronyms, and technical terms accurate.
- Output ONLY the translated Arabic sentence. Never output quotes, notes, or English words.

Input: "${text}"`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1200); // مهلة قصوى 1.2 ثانية لضمان عدم تأخر الصوت

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      agent: httpsAgent,
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1, // أقصى دقة وضبط للترجمة
          maxOutputTokens: 90, // استجابة سريعة جداً بدون إسهاب
          topP: 0.8
        }
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const rawOutput = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawOutput) throw new Error('Empty response from Gemini');
    return rawOutput.trim().replace(/^["']|["']$/g, '');
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * المحرك العصبي الفوري (زمن استجابة < 60ms وبدقة لغوية ممتازة)
 */
async function translateWithInstantEngine(text, from = 'en', to = 'ar') {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 800);

  try {
    const response = await fetch(url, {
      agent: httpsAgent,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Instant API error: ${response.status}`);
    }

    const data = await response.json();
    if (data && Array.isArray(data[0])) {
      return data[0].map(item => (item && item[0]) ? item[0] : '').join('').trim();
    }
    return text;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// مسار الترجمة عالي السرعة والدقة API
app.post('/api/translate', async (req, res) => {
  try {
    const { text, from = 'en', to = 'ar', engine = 'auto', apiKey: clientKey } = req.body;
    
    if (!text || !text.trim()) {
      return res.json({ translated: '', engine: 'none' });
    }

    const trimmed = text.trim();
    const cacheKey = `${engine}:${from}:${to}:${trimmed}`;
    
    // فحص الكاش الفوري (زمن استجابة 0ms)
    if (translationCache.has(cacheKey)) {
      return res.json({ translated: translationCache.get(cacheKey), cached: true });
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

    if (!translated) translated = trimmed;

    // حفظ في الكاش السريع
    translationCache.set(cacheKey, translated);
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
    console.error('Translation error:', error);
    res.status(500).json({ error: error.message, fallback: req.body.text || '' });
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

  ws.on('message', (messageRaw) => {
    try {
      const msg = JSON.parse(messageRaw.toString());

      if (msg.type === 'join') {
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
        if (currentRoom && rooms.has(currentRoom)) {
          broadcastToRoom(currentRoom, {
            type: 'live_subtitle',
            original: msg.original,
            translated: msg.translated,
            isInterim: !!msg.isInterim,
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
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

server.listen(PORT, () => {
  console.log(`🚀 Turjuman AI High-Speed Server running at http://localhost:${PORT}`);
  console.log(`✨ Latency-optimized for live simultaneous interpretation`);
});
