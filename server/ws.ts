import type { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import type { WSEvent } from '../shared/types.js';

interface ClientConnection {
  ws: WebSocket;
  rooms: Set<string>;
}

class RealtimeHub {
  private wss: WebSocketServer | null = null;
  private clients = new Set<ClientConnection>();

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
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN && client.rooms.has(room)) {
        client.ws.send(payload);
      }
    }
  }

  broadcastBookingUpdate(bookingId: string, event: WSEvent) {
    const payload = JSON.stringify(event);
    const targetRooms = [`booking:${bookingId}`, 'admin:ops', 'global'];
    for (const client of this.clients) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;
      if (targetRooms.some((r) => client.rooms.has(r))) {
        client.ws.send(payload);
      }
    }
  }

  broadcastGlobal(event: WSEvent) {
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
  }
}

export const realtimeHub = new RealtimeHub();
