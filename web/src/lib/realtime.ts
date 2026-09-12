import type { RealtimeEvent } from "./types";

export function connectProfileRealtime(identityId: string, onEvent: (event: RealtimeEvent) => void) {
  let socket: WebSocket | null = null;
  let retryTimer: number | null = null;
  let attempts = 0;
  let closed = false;

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
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "typing", conversationId, active }));
    },
    close() {
      closed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      socket?.close();
    },
  };
}
