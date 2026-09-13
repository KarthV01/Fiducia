import type { RealtimeEvent } from "./types.js";

type Listener = (event: RealtimeEvent) => void;
const channels = new Map<string, { listeners: Set<Listener>; transport: ReturnType<typeof createTransport>; closeTimer?: ReturnType<typeof setTimeout> }>();

export function connectProfileRealtime(identityId: string, onEvent: (event: RealtimeEvent) => void) {
  let channel = channels.get(identityId);
  if (!channel) {
    const listeners = new Set<Listener>();
    channel = { listeners, transport: createTransport(identityId, (event) => { for (const listener of listeners) listener(event); }) };
    channels.set(identityId, channel);
  }
  clearTimeout(channel.closeTimer);
  channel.listeners.add(onEvent);
  const current = channel;
  return {
    sendTyping: current.transport.sendTyping,
    close() {
      current.listeners.delete(onEvent);
      if (current.listeners.size) return;
      current.closeTimer = setTimeout(() => {
        if (current.listeners.size) return;
        current.transport.close();
        channels.delete(identityId);
      }, 0);
    },
  };
}

function createTransport(identityId: string, onEvent: Listener) {
  let socket: WebSocket | null = null;
  let retryTimer: number | null = null;
  let attempts = 0;
  let closed = false;
  const typing = new Map<string, number>();

  const connect = () => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${protocol}//${window.location.host}/api/realtime/${encodeURIComponent(identityId)}`);
    socket.addEventListener("open", () => { attempts = 0; });
    socket.addEventListener("message", (message) => {
      try { onEvent(JSON.parse(message.data) as RealtimeEvent); } catch { /* ignore malformed events */ }
    });
    socket.addEventListener("close", () => {
      if (closed) return;
      attempts += 1;
      retryTimer = window.setTimeout(connect, Math.min(30_000, 500 * 2 ** attempts));
    });
  };
  connect();
  return {
    sendTyping(conversationId: string, active: boolean) {
      if (socket?.readyState !== WebSocket.OPEN) return;
      const previous = typing.get(conversationId);
      if (active && previous !== undefined && Date.now() - previous < 1000) return;
      if (active) typing.set(conversationId, Date.now());
      else {
        if (previous === undefined) return;
        typing.delete(conversationId);
      }
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "typing", conversationId, active }));
    },
    close() {
      closed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      socket?.close();
    },
  };
}
