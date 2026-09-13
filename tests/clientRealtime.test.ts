import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectProfileRealtime } from "../web/src/lib/realtime.js";

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 1;
  send = vi.fn();
  handlers = new Map<string, Array<(event: any) => void>>();
  constructor(public url: string) { Socket.instances.push(this); }
  addEventListener(type: string, handler: (event: any) => void) {
    this.handlers.set(type, [...this.handlers.get(type) ?? [], handler]);
  }
  emit(type: string, event: any = {}) { this.handlers.get(type)?.forEach((handler) => handler(event)); }
  close() { this.readyState = 3; this.emit("close"); }
}

describe("shared client realtime connection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Socket.instances = [];
    vi.stubGlobal("WebSocket", Socket);
    vi.stubGlobal("window", { location: { protocol: "http:", host: "localhost:5173" }, setTimeout, clearTimeout });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("shares one socket, preserves remaining subscribers, and throttles typing", () => {
    const first = vi.fn();
    const second = vi.fn();
    const shell = connectProfileRealtime("creator:one", first);
    const chat = connectProfileRealtime("creator:one", second);
    expect(Socket.instances).toHaveLength(1);
    const socket = Socket.instances[0];
    socket.emit("message", { data: JSON.stringify({ type: "conversation.read" }) });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    for (let index = 0; index < 20; index++) chat.sendTyping("thread", true);
    expect(socket.send).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    chat.sendTyping("thread", true);
    chat.sendTyping("thread", false);
    expect(socket.send).toHaveBeenCalledTimes(3);
    chat.close();
    vi.advanceTimersByTime(1);
    expect(socket.readyState).toBe(1);
    shell.close();
    vi.advanceTimersByTime(1);
    expect(socket.readyState).toBe(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reuses the socket across remounts and broadcasts ready after reconnect", () => {
    const original = connectProfileRealtime("creator:two", vi.fn());
    original.close();
    const listener = vi.fn();
    const remounted = connectProfileRealtime("creator:two", listener);
    vi.advanceTimersByTime(1);
    expect(Socket.instances).toHaveLength(1);
    Socket.instances[0].close();
    vi.advanceTimersByTime(1000);
    expect(Socket.instances).toHaveLength(2);
    Socket.instances[1].emit("message", { data: JSON.stringify({ type: "ready" }) });
    expect(listener).toHaveBeenCalledWith({ type: "ready" });
    remounted.close();
    vi.advanceTimersByTime(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
