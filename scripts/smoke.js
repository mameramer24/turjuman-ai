const assert = require('node:assert/strict');
const { WebSocket } = require('ws');
const base = process.env.TURJUMAN_TEST_URL || 'http://localhost:43187';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function join(room) {
  const socket = new WebSocket(base.replace(/^http/, 'ws'));
  socket.messages = [];
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Room connection timed out')), 3000);
    socket.on('error', reject);
    socket.on('open', () => socket.send(JSON.stringify({ type: 'join', roomId: room })));
    socket.on('message', raw => {
      const message = JSON.parse(raw.toString());
      socket.messages.push(message);
      if (message.type === 'joined') { clearTimeout(timer); resolve(); }
    });
  });
  return socket;
}

async function main() {
  for (const url of ['/', '/room/smoke-test', '/js/app.js?v=3.0', '/css/style.css?v=3.0', '/sw.js']) {
    assert.equal((await fetch(`${base}${url}`)).status, 200, url);
  }
  assert.equal((await fetch(`${base}/api/translate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 123 })
  })).status, 400);
  console.log('PASS: HTTP pages, assets and invalid input');

  const room = process.env.TURJUMAN_TEST_ROOM || `smoke-${Date.now()}`;
  const sockets = [];
  try {
    const sender = await join(room); sockets.push(sender);
    const peer = await join(room); sockets.push(peer);
    const outsider = await join(`${room}-other`); sockets.push(outsider);
    const message = { type: 'broadcast_subtitle', segmentId: 'smoke:1', original: 'Welcome to the meeting.', translated: 'أهلاً بكم في الاجتماع.' };
    sender.send(JSON.stringify({ ...message, isInterim: true, revision: 1 }));
    sender.send(JSON.stringify({ ...message, isInterim: false, revision: 2 }));
    await delay(100);
    assert.equal(peer.messages.filter(m => m.type === 'live_subtitle').length, 2);
    assert.equal(sender.messages.filter(m => m.type === 'live_subtitle').length, 0);
    assert.equal(outsider.messages.filter(m => m.type === 'live_subtitle').length, 0);
    assert.equal(peer.messages.at(-1).segmentId, 'smoke:1');
    assert.equal(peer.messages.at(-1).revision, 2);
    // A repeated delivery must leave one final row in the browser receiver.
    sender.send(JSON.stringify({ ...message, isInterim: false, revision: 2 }));
    console.log('PASS: real WebSocket delivery, no sender echo, room isolation and segment identity');
  } finally {
    sockets.forEach(socket => socket.close());
  }

  const translation = await fetch(`${base}/api/translate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Welcome to the meeting.', engine: 'instant', from: 'en', to: 'ar' })
  });
  assert.equal(translation.status, 200, 'Live translation provider unavailable');
  const result = await translation.json();
  assert.match(result.translated, /[\u0600-\u06ff]/);
  console.log(`PASS: live English-to-Arabic provider (${result.engine})`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
