import type { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import type { WSEvent } from '../shared/types.js';

interface ClientConnection {
  ws: WebSocket;
  rooms: Set<string>;
}

interface LoggedEvent {
  seq: number;
  rooms: string[];
  event: WSEvent;
}

class RealtimeHub {
  private wss: WebSocketServer | null = null;
  private clients = new Set<ClientConnection>();
  private seq = 0;
  private readonly log: LoggedEvent[] = [];
  private readonly maxLogSize = 120;

  private record(rooms: string[], event: WSEvent) {
    this.seq += 1;
    this.log.push({ seq: this.seq, rooms, event });
    if (this.log.length > this.maxLogSize) {
      this.log.splice(0, this.log.length - this.maxLogSize);
    }
  }

  init(server: HttpServer) {
    if (this.wss) return;
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws) => {
      const client: ClientConnection = {
        ws,
        rooms: new Set(['global']),
      };
      this.clients.add(client);

      ws.on('message', (raw) => {
        try {
          const parsed = JSON.parse(raw.toString()) as {
            type?: string;
            room?: string;
          };
          if (parsed.type === 'subscribe' && typeof parsed.room === 'string') {
            client.rooms.add(parsed.room);
          } else if (parsed.type === 'unsubscribe' && typeof parsed.room === 'string') {
            client.rooms.delete(parsed.room);
          }
        } catch {
          // Ignore malformed WS payloads
        }
      });

      ws.on('close', () => {
        this.clients.delete(client);
      });
    });
  }

  broadcastToRoom(room: string, event: WSEvent) {
    this.record([room], event);
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN && client.rooms.has(room)) {
        client.ws.send(payload);
      }
    }
  }

  broadcastBookingUpdate(bookingId: string, event: WSEvent) {
    const targetRooms = [`booking:${bookingId}`, 'admin:ops', 'global'];
    this.record(targetRooms, event);
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;
      if (targetRooms.some((r) => client.rooms.has(r))) {
        client.ws.send(payload);
      }
    }
  }

  broadcastGlobal(event: WSEvent) {
    this.record(['global', 'admin:ops'], event);
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
  }

  getSeq(): number {
    return this.seq;
  }

  since(seq: number, rooms?: string[]): WSEvent[] {
    const roomSet = rooms && rooms.length > 0 ? new Set(rooms) : null;
    return this.log
      .filter((entry) => {
        if (entry.seq <= seq) return false;
        if (!roomSet) return true;
        return entry.rooms.some((r) => roomSet.has(r));
      })
      .map((entry) => entry.event);
  }
}

export const realtimeHub = new RealtimeHub();
