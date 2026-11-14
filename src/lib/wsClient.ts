import { useEffect, useState } from 'react';
import type { WSEvent } from '../../shared/types';

type Listener = (event: WSEvent) => void;

class SocketManager {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<(connected: boolean) => void>();
  private rooms = new Set<string>(['global']);
  private connected = false;
  private reconnectTimer: number | null = null;

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);
    this.ws = socket;

    socket.onopen = () => {
      this.connected = true;
      this.statusListeners.forEach((cb) => cb(true));
      for (const room of this.rooms) {
        socket.send(JSON.stringify({ type: 'subscribe', room }));
      }
    };

    socket.onmessage = (evt) => {
      try {
        const parsed = JSON.parse(evt.data) as WSEvent;
        this.listeners.forEach((cb) => cb(parsed));
      } catch {
        // Ignore malformed event
      }
    };

    socket.onclose = () => {
      this.connected = false;
      this.statusListeners.forEach((cb) => cb(false));
      this.ws = null;
      if (this.reconnectTimer === null) {
        this.reconnectTimer = window.setTimeout(() => {
          this.reconnectTimer = null;
          this.connect();
        }, 2000);
      }
    };

    socket.onerror = () => {
      socket.close();
    };
  }

  subscribeRoom(room: string) {
    this.rooms.add(room);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe', room }));
    }
  }

  unsubscribeRoom(room: string) {
    if (room === 'global') return;
    this.rooms.delete(room);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'unsubscribe', room }));
    }
  }

  onEvent(listener: Listener): () => void {
    this.connect();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onStatus(listener: (connected: boolean) => void): () => void {
    this.connect();
    listener(this.connected);
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }
}

export const socketManager = new SocketManager();

export function useRealtimeRoom(room: string | null, onEvent: (event: WSEvent) => void) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const offStatus = socketManager.onStatus(setConnected);
    const offEvent = socketManager.onEvent(onEvent);
    if (room) {
      socketManager.subscribeRoom(room);
    }
    return () => {
      offStatus();
      offEvent();
      if (room) {
        socketManager.unsubscribeRoom(room);
      }
    };
  }, [room, onEvent]);

  return { connected };
}
