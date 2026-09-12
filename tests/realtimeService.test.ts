import { describe, expect, it } from "vitest";
import type WebSocket from "ws";
import { InMemoryRealtimePublisher } from "../src/services/realtimeService.js";

describe("in-memory realtime publisher", () => {
  it("delivers ordered, profile-scoped event envelopes and unsubscribes cleanly", () => {
    const publisher = new InMemoryRealtimePublisher();
    const firstMessages: string[] = [];
    const secondMessages: string[] = [];
    const first = socket(firstMessages);
    const second = socket(secondMessages);
    const unsubscribe = publisher.subscribe("creator:one", first);
    publisher.subscribe("creator:two", second);

    publisher.publish(["creator:one"], "message.created", { id: "m1" }, "conversation-1");
    publisher.publish(["creator:one", "creator:two"], "conversation.read", { readAt: "now" }, "conversation-1");
    unsubscribe();
    publisher.publish(["creator:one"], "message.created", { id: "m2" }, "conversation-1");

    expect(firstMessages.map((value) => JSON.parse(value).sequence)).toEqual([1, 2]);
    expect(JSON.parse(firstMessages[0])).toMatchObject({ type: "message.created", profileId: "creator:one", conversationId: "conversation-1", payload: { id: "m1" } });
    expect(secondMessages).toHaveLength(1);
    expect(JSON.parse(secondMessages[0]).profileId).toBe("creator:two");
  });
});

function socket(messages: string[]) {
  return { OPEN: 1, readyState: 1, send: (message: string) => messages.push(message) } as unknown as WebSocket;
}
