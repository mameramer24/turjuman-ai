/**
 * عميل WebSocket لبث واستقبال الترجمة المباشرة بين الأجهزة (الكمبيوتر والموبايل)
 */

class SocketClient {
  constructor(options = {}) {
    this.onSubtitle = options.onSubtitle || (() => {});
    this.onRoomStatus = options.onRoomStatus || (() => {});
    this.ws = null;
    this.currentRoom = null;
    this.reconnectTimer = null;
  }

  connect(roomId) {
    this.disconnect();
    this.currentRoom = roomId || 'default';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    try {
      this.ws = new WebSocket(wsUrl);
      const socket = this.ws;

      this.ws.onopen = () => {
        if (socket !== this.ws) return;
        console.log('[Turjuman WS] Connected to live interpretation room:', this.currentRoom);
        this.ws.send(JSON.stringify({
          type: 'join',
          roomId: this.currentRoom
        }));
      };

      this.ws.onmessage = (event) => {
        if (socket !== this.ws) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'live_subtitle') {
            this.onSubtitle(msg);
          } else if (msg.type === 'room_status' || msg.type === 'joined') {
            this.onRoomStatus(msg);
          }
        } catch (e) {
          console.warn('[Turjuman WS] Message parsing error:', e);
        }
      };

      this.ws.onclose = () => {
        if (socket !== this.ws || !this.currentRoom) return;
        this.onRoomStatus({ type: 'disconnected' });
        console.log('[Turjuman WS] Connection closed, retrying in 3s...');
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
          if (this.currentRoom) this.connect(this.currentRoom);
        }, 3000);
      };

      this.ws.onerror = (err) => {
        console.warn('[Turjuman WS] Socket error:', err);
      };
    } catch (e) {
      console.warn('[Turjuman WS] Failed to init WebSocket:', e);
    }
  }

  broadcastSubtitle(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'broadcast_subtitle',
        roomId: this.currentRoom,
        original: data.original,
        translated: data.translated,
        isInterim: !!data.isInterim,
        segmentId: data.segmentId,
        revision: data.revision,
        speaker: data.speaker || 'المتحدث',
        timestamp: data.timestamp || new Date().toLocaleTimeString('ar-EG')
      }));
    }
  }

  disconnect() {
    clearTimeout(this.reconnectTimer);
    this.currentRoom = null;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }
}

window.SocketClient = SocketClient;

