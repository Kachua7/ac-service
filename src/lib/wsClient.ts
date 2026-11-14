import { useEffect, useState } from 'react';
import type { WSEvent } from '../../shared/types';

type Listener = (event: WSEvent) => void;

const POLL_INTERVAL_MS = 2000;

interface RealtimeSnapshot {
  seq: number;
  version: number;
  events: WSEvent[];
}

/**
 * Realtime client for a serverless backend.
 *
 * Serverless functions cannot hold a WebSocket open, so the client polls
 * `/api/realtime/events` with its last sequence number. Events produced by the
 * instance it reaches are replayed exactly; when another instance handled the
 * change (or the instance cold-started) the returned state version differs and
 * consumers get an `ops:refresh` hint to reload their data.
 */
class RealtimePoller {
  private listeners = new Set<Listener>();
  private statusListeners = new Set<(connected: boolean) => void>();
  private connected = false;
  private started = false;
  private polling = false;
  private timer: number | null = null;
  private seq = 0;
  private version = 0;
  private synchronised = false;

  private start() {
    if (this.started) return;
    this.started = true;
    void this.poll();
    this.timer = window.setInterval(() => {
      void this.poll();
    }, POLL_INTERVAL_MS);
  }

  private setConnected(next: boolean) {
    if (this.connected === next) return;
    this.connected = next;
    this.statusListeners.forEach((cb) => cb(next));
  }

  private emit(event: WSEvent) {
    this.listeners.forEach((cb) => cb(event));
  }

  private async poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      const res = await fetch(`/api/realtime/events?since=${this.seq}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`Realtime poll failed (${res.status})`);
      const data = (await res.json()) as RealtimeSnapshot;
      this.setConnected(true);

      if (!this.synchronised) {
        this.synchronised = true;
        this.seq = data.seq ?? 0;
        this.version = data.version ?? 0;
        return;
      }

      if (typeof data.seq === 'number' && data.seq > this.seq) {
        this.seq = data.seq;
        if (typeof data.version === 'number') this.version = data.version;
        (Array.isArray(data.events) ? data.events : []).forEach((event) => this.emit(event));
        return;
      }

      if (typeof data.version === 'number' && data.version !== this.version) {
        this.version = data.version;
        this.emit({ type: 'ops:refresh', payload: { reason: 'state-changed' } });
      }
    } catch {
      this.setConnected(false);
    } finally {
      this.polling = false;
    }
  }

  onEvent(listener: Listener): () => void {
    this.start();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onStatus(listener: (connected: boolean) => void): () => void {
    this.start();
    listener(this.connected);
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  stop() {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.started = false;
  }
}

export const realtimeClient = new RealtimePoller();

export function useRealtimeRoom(_room: string | null, onEvent: (event: WSEvent) => void) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const offStatus = realtimeClient.onStatus(setConnected);
    const offEvent = realtimeClient.onEvent(onEvent);
    return () => {
      offStatus();
      offEvent();
    };
  }, [onEvent]);

  return { connected };
}
