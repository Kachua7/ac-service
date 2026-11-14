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
  private pollTimer: number | null = null;
  private wsFailures = 0;
  private pollingMode = false;
  private lastSeq = 0;
  private lastVersion = 0;

  connect() {
    if (this.pollingMode) {
      this.startPolling();
      return;
    }

    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);
    this.ws = socket;
    let opened = false;

    socket.onopen = () => {
      opened = true;
      this.wsFailures = 0;
      this.stopPolling();
      this.setConnected(true);
      for (const room of this.rooms) {
        socket.send(JSON.stringify({ type: 'subscribe', room }));
      }
    };

    socket.onmessage = (evt) => {
      try {
        const parsed = JSON.parse(evt.data) as WSEvent;
        this.emit(parsed);
      } catch {
        // Ignore malformed event
      }
    };

    socket.onclose = () => {
      this.ws = null;
      if (!opened) {
        this.wsFailures += 1;
      }
      if (this.wsFailures >= 2) {
        this.pollingMode = true;
        this.startPolling();
        return;
      }

      this.setConnected(false);
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

  private setConnected(next: boolean) {
    if (this.connected === next) return;
    this.connected = next;
    this.statusListeners.forEach((cb) => cb(next));
  }

  private emit(event: WSEvent) {
    this.listeners.forEach((cb) => cb(event));
  }

  private startPolling() {
    if (this.pollTimer !== null) return;
    const poll = async () => {
      try {
        const roomsParam = encodeURIComponent(Array.from(this.rooms).join(','));
        const res = await fetch(
          `/api/realtime/events?since=${this.lastSeq}&rooms=${roomsParam}`,
        );
        if (!res.ok) {
          this.setConnected(false);
          return;
        }
        const data = (await res.json()) as {
          seq?: number;
          version?: number;
          events?: WSEvent[];
        };
        this.setConnected(true);

        if (typeof data.seq === 'number') {
          if (data.seq < this.lastSeq) {
            // Cold-started serverless instance reset sequence
            this.lastSeq = data.seq;
            this.emit({ type: 'ops:refresh', payload: { reason: 'instance_reset' } });
          } else {
            this.lastSeq = data.seq;
          }
        }

        if (Array.isArray(data.events) && data.events.length > 0) {
          for (const evt of data.events) {
            this.emit(evt);
          }
        } else if (
          typeof data.version === 'number' &&
          this.lastVersion !== 0 &&
          data.version !== this.lastVersion
        ) {
          this.emit({ type: 'ops:refresh', payload: { reason: 'version_sync' } });
        }

        if (typeof data.version === 'number') {
          this.lastVersion = data.version;
        }
      } catch {
        this.setConnected(false);
      }
    };

    void poll();
    this.pollTimer = window.setInterval(() => {
      void poll();
    }, 2000);
  }

  private stopPolling() {
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
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
