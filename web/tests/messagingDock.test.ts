import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { Window } from "happy-dom";
import { Link, MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import type { Root } from "react-dom/client";
import { MessagingDock } from "../src/ui/MessagingDock";
import { api } from "../src/lib/api";
import { AppShell } from "../src/ui/AppShell";

const realtime = vi.hoisted(() => ({ listeners: new Set<(event: unknown) => void>() }));
vi.mock("../src/ui/AccountSwitcher", () => ({ AccountSwitcher: () => null }));
vi.mock("../src/lib/realtime", () => ({ connectProfileRealtime: () => ({ close: vi.fn(), sendTyping: vi.fn() }) }));
vi.mock("../src/lib/useProfileRealtime", () => ({ useProfileRealtime: (_id: string, callback: (event: unknown) => void) => {
  React.useEffect(() => { realtime.listeners.add(callback); return () => { realtime.listeners.delete(callback); }; }, [callback]);
  return { current: { sendTyping: vi.fn() } };
} }));
vi.mock("../src/lib/api", () => ({ api: {
  conversations: vi.fn(), conversation: vi.fn(), messages: vi.fn(), updateConversationState: vi.fn(),
  createDirectConversation: vi.fn(), connections: vi.fn(), sendMessage: vi.fn(), messagingCounts: vi.fn(),
} }));

const own = { id: "sponsor:one", displayName: "Sponsor", avatarUrl: null, lastReadAt: null };
const other = { id: "creator:two", displayName: "Creator", avatarUrl: null, descriptor: "Film creator" };
const message = { id: "m1", conversationId: "thread", clientMessageId: "client1", sender: other, body: "Hello there", createdAt: "2026-09-12T12:00:00.000Z", attachments: [], reactions: [] };
const conversation = { id: "thread", type: "direct", title: "Creator", participants: [own, other], draftText: "A saved draft", latestMessage: message, lastMessageAt: message.createdAt };
let root: Root;
let container: HTMLDivElement;
let createRoot: typeof import("react-dom/client").createRoot;
let navigate: ReturnType<typeof useNavigate>;

function Harness() {
  const routerNavigate = useNavigate();
  React.useEffect(() => { navigate = routerNavigate; }, [routerNavigate]);
  return React.createElement(MessagingDock, { identityId: "sponsor:one", basePath: "/sponsor/one", unread: 2 });
}
beforeAll(async () => {
  const dom = new Window({ url: "http://localhost:5173" });
  for (const name of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Element", "Node", "Event", "CustomEvent", "MouseEvent", "KeyboardEvent"] as const) {
    vi.stubGlobal(name, name === "window" ? dom : dom[name]);
  }
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  createRoot = (await import("react-dom/client")).createRoot;
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.conversations).mockResolvedValue({ items: [conversation], nextCursor: null } as never);
  vi.mocked(api.conversation).mockResolvedValue(conversation as never);
  vi.mocked(api.messages).mockResolvedValue({ items: [message], nextCursor: null } as never);
  vi.mocked(api.updateConversationState).mockResolvedValue({});
  vi.mocked(api.createDirectConversation).mockResolvedValue({ id: "thread" });
  vi.mocked(api.connections).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(api.messagingCounts).mockResolvedValue({ unread: 0, requests: 0 });
  vi.mocked(api.sendMessage).mockResolvedValue({ ...message, id: "sent", sender: own } as never);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); realtime.listeners.clear(); });
afterAll(() => vi.unstubAllGlobals());

async function mount() {
  await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: ["/sponsor/one/network"] }, React.createElement(Routes, null, React.createElement(Route, { path: "/sponsor/:sponsorId/*", element: React.createElement(Harness) })))));
}
async function openRecipient(identityId = "sponsor:one") {
  await act(async () => { window.dispatchEvent(new CustomEvent("messaging:open", { detail: { identityId, recipientId: "creator:two" } })); });
}
async function click(selector: string) {
  const target = container.querySelector<HTMLElement>(selector); expect(target).not.toBeNull();
  await act(async () => target!.click());
}

describe("corner messaging", () => {
  it("opens profile Message links in the dock through the workspace shell", async () => {
    const shell = React.createElement(AppShell, { nav: [], accountLabel: "Sponsor", currentSession: { role: "sponsor", id: "one" }, children: React.createElement(Link, { to: "/sponsor/one/messages?with=creator%3Atwo", "data-testid": "profile-message" }, "Message") });
    await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: ["/sponsor/one/network"] }, React.createElement(Routes, null, React.createElement(Route, { path: "/sponsor/:sponsorId/*", element: shell })))));
    await click('[data-testid="profile-message"]');
    expect(api.createDirectConversation).toHaveBeenCalledWith("sponsor:one", "creator:two");
    expect(container.querySelector('[aria-label="Quick messaging"]')?.hasAttribute("hidden")).toBe(false);
    expect(container.querySelector("textarea")?.value).toBe("A saved draft");
  });
  it("loads lazily and opens an inbox without navigating away", async () => {
    await mount(); expect(api.conversations).not.toHaveBeenCalled();
    await click('[aria-controls="quick-messaging-body"]');
    expect(api.conversations).toHaveBeenCalledWith("sponsor:one", expect.any(Object));
    expect(container.querySelector("#quick-messaging-body")?.hasAttribute("hidden")).toBe(false);
  });
  it("opens a recipient and preserves the thread and draft across page navigation", async () => {
    await mount(); await openRecipient();
    expect(container.querySelector("textarea")?.value).toBe("A saved draft");
    await act(async () => navigate("/sponsor/one/contracts?filter=active"));
    expect(container.querySelector("textarea")?.value).toBe("A saved draft");
    expect(api.createDirectConversation).toHaveBeenCalledTimes(1);
  });
  it("doesn't read or reload messages while minimized, and catches up when reopened", async () => {
    await mount(); await openRecipient();
    await click('[aria-label="Minimize messaging"]');
    vi.mocked(api.updateConversationState).mockClear(); vi.mocked(api.messages).mockClear();
    await act(async () => { for (const callback of realtime.listeners) callback({ type: "message.created", conversationId: "thread", payload: { ...message, id: "m2" } }); });
    expect(api.updateConversationState).not.toHaveBeenCalled(); expect(api.messages).not.toHaveBeenCalled();
    await click('[aria-label="Open messaging"]');
    expect(api.messages).toHaveBeenCalled();
    expect(api.updateConversationState).toHaveBeenCalledWith("sponsor:one", "thread", { read: true, readThrough: message.createdAt });
  });
  it("ignores open events for a different active identity", async () => {
    await mount(); await openRecipient("creator:another");
    expect(api.createDirectConversation).not.toHaveBeenCalled();
  });
  it("does not discard a draft when the same recipient is selected again", async () => {
    await mount(); await openRecipient(); await openRecipient();
    expect(container.querySelector("textarea")?.value).toBe("A saved draft");
    expect(container.textContent).not.toContain("Opening conversation");
  });
  it("can return to the inbox and reopen the previous conversation", async () => {
    await mount(); await openRecipient();
    await click('[aria-label="Back to conversations"]');
    await click('.messaging-rail button[aria-pressed="false"]');
    expect(container.querySelector("textarea")?.value).toBe("A saved draft");
  });
  it("sends the saved draft using Enter without forcing full-screen navigation", async () => {
    await mount(); await openRecipient();
    const textarea = container.querySelector("textarea")!;
    await act(async () => textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    expect(api.sendMessage).toHaveBeenCalledWith("sponsor:one", "thread", expect.objectContaining({ body: "A saved draft", clientMessageId: expect.any(String) }));
    expect(container.querySelector('[aria-label="Quick messaging"]')?.hasAttribute("hidden")).toBe(false);
  });
  it("expands to the selected thread and hides the dock on the full inbox route", async () => {
    await mount(); await openRecipient();
    expect(container.querySelector('[aria-label="Open full inbox"]')?.getAttribute("href")).toBe("/sponsor/one/messages?conversation=thread");
    await click('[aria-label="Open full inbox"]');
    expect(container.querySelector('[aria-label="Quick messaging"]')?.hasAttribute("hidden")).toBe(true);
  });
  it("keeps read receipts from triggering a REST refresh loop", async () => {
    await mount(); await openRecipient();
    vi.mocked(api.updateConversationState).mockClear(); vi.mocked(api.messages).mockClear();
    await act(async () => { for (const callback of [...realtime.listeners]) callback({ type: "conversation.read", conversationId: "thread", payload: { identityId: "creator:two", readAt: message.createdAt } }); });
    expect(api.messages).not.toHaveBeenCalled(); expect(api.updateConversationState).not.toHaveBeenCalled();
  });
  it("rejects unsupported attachments selected through the file picker", async () => {
    await mount(); await openRecipient();
    const input = container.querySelector('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [{ name: "program.exe", size: 100 }] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(container.textContent).toContain("One or more attachment types are not supported");
  });
});
