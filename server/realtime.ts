import type { WSEvent } from '../shared/types';

interface LoggedEvent {
  seq: number;
  event: WSEvent;
}

/**
 * In-process realtime event log.
 *
 * Serverless functions cannot hold a WebSocket open, so clients poll
 * `/api/realtime/events` and replay everything after their last sequence
 * number. Each instance keeps a small ring buffer; the poll endpoint also
 * returns the persisted state version so clients can detect changes produced
 * by another instance and fall back to a full refresh.
 */
class RealtimeHub {
  private seq = 0;
  private readonly log: LoggedEvent[] = [];
  private readonly maxLogSize = 100;

  private record(event: WSEvent) {
    this.seq += 1;
    this.log.push({ seq: this.seq, event });
    if (this.log.length > this.maxLogSize) {
      this.log.splice(0, this.log.length - this.maxLogSize);
    }
  }

  broadcastToRoom(_room: string, event: WSEvent) {
    this.record(event);
  }

  broadcastBookingUpdate(_bookingId: string, event: WSEvent) {
    this.record(event);
  }

  broadcastGlobal(event: WSEvent) {
    this.record(event);
  }

  getSeq(): number {
    return this.seq;
  }

  since(seq: number): WSEvent[] {
    return this.log.filter((entry) => entry.seq > seq).map((entry) => entry.event);
  }
}

export const realtimeHub = new RealtimeHub();
