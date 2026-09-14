import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React, { act } from "react";
import { Window } from "happy-dom";
import { MemoryRouter } from "react-router-dom";
import type { Root } from "react-dom/client";
import { ThemeToggle } from "../src/ui/ThemeToggle";
import { PublicLayout } from "../src/ui/PublicLayout";
import { AppShell } from "../src/ui/AppShell";
import { getTheme, setTheme, subscribeTheme, THEME_KEY } from "../src/lib/theme";

vi.mock("../src/ui/AccountSwitcher", () => ({ AccountSwitcher: () => null }));
vi.mock("../src/lib/realtime", () => ({ connectProfileRealtime: () => ({ close: vi.fn() }) }));
vi.mock("../src/lib/api", () => ({ api: { messagingCounts: vi.fn().mockResolvedValue({ unread: 0, requests: 0 }) } }));
let root: Root;
let container: HTMLDivElement;
let createRoot: typeof import("react-dom/client").createRoot;
beforeAll(async () => {
  const dom = new Window({ url: "http://localhost:5173" });
  for (const name of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "CustomEvent", "StorageEvent"] as const) vi.stubGlobal(name, name === "window" ? dom : dom[name]);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  createRoot = (await import("react-dom/client")).createRoot;
});
beforeEach(() => {
  document.documentElement.dataset.theme = "dark"; window.localStorage.clear();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });
afterAll(() => vi.unstubAllGlobals());
async function render(element: React.ReactNode) { await act(async () => root.render(React.createElement(MemoryRouter, null, element))); }

it("toggles from dark to light and persists the choice", async () => {
  await render(React.createElement(ThemeToggle));
  const toggle = container.querySelector<HTMLButtonElement>('[role="switch"]')!;
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  await act(async () => toggle.click());
  expect(getTheme()).toBe("light"); expect(window.localStorage.getItem(THEME_KEY)).toBe("light");
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  await act(async () => toggle.click()); expect(getTheme()).toBe("dark");
});
it("keeps the current theme when a new page mounts", async () => {
  setTheme("light"); await render(React.createElement(PublicLayout, { children: "Landing" }));
  expect(container.querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("false");
  await render(React.createElement(AppShell, { nav: [], accountLabel: "Sponsor", currentSession: { role: "sponsor", id: "one" }, children: "Workspace" }));
  expect(container.querySelector('header [role="switch"]')?.getAttribute("aria-checked")).toBe("false");
});
it("synchronizes theme changes from another tab and unsubscribes cleanly", () => {
  const notify = vi.fn(); const unsubscribe = subscribeTheme(notify);
  window.dispatchEvent(new StorageEvent("storage", { key: THEME_KEY, newValue: "light" }));
  expect(getTheme()).toBe("light"); expect(notify).toHaveBeenCalledOnce();
  window.dispatchEvent(new StorageEvent("storage", { key: "unrelated", newValue: "dark" }));
  expect(getTheme()).toBe("light"); expect(notify).toHaveBeenCalledOnce();
  unsubscribe(); window.dispatchEvent(new StorageEvent("storage", { key: THEME_KEY, newValue: "dark" }));
  expect(notify).toHaveBeenCalledOnce();
});
it("still changes theme when browser storage is blocked", () => {
  vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("Storage blocked"); });
  expect(() => setTheme("light")).not.toThrow(); expect(getTheme()).toBe("light");
});

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)![1];
it.each(["light", "dark", "invalid", null])("restores saved theme %s before the first paint", (saved) => {
  const document = { documentElement: { dataset: { theme: "dark" } } };
  runInNewContext(bootstrap, { document, localStorage: { getItem: () => saved } });
  expect(document.documentElement.dataset.theme).toBe(saved === "light" ? "light" : "dark");
});
it("keeps the dark default if storage is blocked at startup", () => {
  const document = { documentElement: { dataset: { theme: "dark" } } };
  expect(() => runInNewContext(bootstrap, { document, localStorage: { getItem: () => { throw new Error("blocked"); } } })).not.toThrow();
  expect(document.documentElement.dataset.theme).toBe("dark");
});

const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
function palette(block: string) { return Object.fromEntries([...block.matchAll(/--color-([\w-]+):\s*(#[\da-f]{6})/g)].map((match) => [match[1], match[2]])); }
function luminance(hex: string) {
  const channels = hex.slice(1).match(/../g)!.map((value) => parseInt(value, 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
it.each(["dark", "light"])("has readable text and controls in the %s palette", (theme) => {
  const tokens = palette(theme === "dark" ? css.match(/@theme\s*{([^}]+)}/)![1] : css.match(/:root\[data-theme="light"\]\s*{([^}]+)}/)![1]);
  const pairs = ["ink:canvas", "ink:surface", "muted:canvas", "muted:surface", "link:accent-soft", "link:surface", "danger:danger-soft", "success:success-soft", "warning:warning-soft", "#ffffff:accent", "#ffffff:accent-hover"];
  for (const pair of pairs) {
    const [fg, bg] = pair.split(":").map((key) => luminance(key.startsWith("#") ? key : tokens[key]));
    expect((Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05), pair).toBeGreaterThanOrEqual(4.5);
  }
});
