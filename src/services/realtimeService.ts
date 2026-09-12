import type WebSocket from "ws";

export type RealtimeEvent = {
  type: string;
  profileId: string;
  conversationId?: string;
  sequence: number;
  occurredAt: string;
  payload: unknown;
};

export interface RealtimePublisher {
  subscribe(profileId: string, socket: WebSocket): () => void;
  publish(profileIds: string[], type: string, payload: unknown, conversationId?: string): void;
}

export class InMemoryRealtimePublisher implements RealtimePublisher {
  private readonly sockets = new Map<string, Set<WebSocket>>();
  private readonly sequences = new Map<string, number>();

  subscribe(profileId: string, socket: WebSocket) {
    const current = this.sockets.get(profileId) ?? new Set<WebSocket>();
    current.add(socket);
    this.sockets.set(profileId, current);
    return () => {
      current.delete(socket);
      if (!current.size) this.sockets.delete(profileId);
    };
  }

  publish(profileIds: string[], type: string, payload: unknown, conversationId?: string) {
    for (const profileId of new Set(profileIds)) {
      const sequence = (this.sequences.get(profileId) ?? 0) + 1;
      this.sequences.set(profileId, sequence);
      const event: RealtimeEvent = { type, profileId, conversationId, sequence, occurredAt: new Date().toISOString(), payload };
      const serialized = JSON.stringify(event);
      for (const socket of this.sockets.get(profileId) ?? []) {
        if (socket.readyState === socket.OPEN) socket.send(serialized);
      }
    }
  }
}
