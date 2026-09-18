import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import React, { act } from "react";
import { Window } from "happy-dom";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Root } from "react-dom/client";
import { EntryPage } from "../src/pages/Entry";
import { AccountAccess, AccountsPage, NewAccountPage, SignInPage } from "../src/pages/Accounts";
import { api } from "../src/lib/api";

vi.mock("../src/lib/api", () => ({ api: { me: vi.fn(), profiles: vi.fn(), logout: vi.fn(), createSponsorProfile: vi.fn(), createCreatorProfile: vi.fn(), accountWallets: vi.fn(), accountWalletChallenge: vi.fn(), connectAccountWallet: vi.fn() } }));
const user = { id: "user", email: "member@example.com", name: "Member", avatarUrl: null };
let root: Root;
let container: HTMLDivElement;
let createRoot: typeof import("react-dom/client").createRoot;
beforeAll(async () => {
  const dom = new Window({ url: "http://localhost:5173" });
  for (const name of ["window", "document", "navigator", "localStorage", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "Element", "Node", "Event", "CustomEvent", "MouseEvent"] as const) vi.stubGlobal(name, name === "window" ? dom : dom[name]);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  createRoot = (await import("react-dom/client")).createRoot;
});
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  vi.mocked(api.me).mockResolvedValue({ user: null });
  vi.mocked(api.profiles).mockResolvedValue({ user, sponsors: [], creators: [] });
  vi.mocked(api.logout).mockResolvedValue({ ok: true });
  vi.mocked(api.accountWallets).mockResolvedValue({ wallets: [] });
  vi.mocked(api.createSponsorProfile).mockResolvedValue({ id: "new" } as never);
  vi.mocked(api.createCreatorProfile).mockResolvedValue({ id: "new" } as never);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
afterAll(() => vi.unstubAllGlobals());
async function mount(path = "/") {
  await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Routes, null,
    React.createElement(Route, { path: "/", element: React.createElement(EntryPage) }),
    React.createElement(Route, { path: "/login", element: React.createElement(SignInPage) }),
    React.createElement(Route, { element: React.createElement(AccountAccess) },
      React.createElement(Route, { path: "/accounts", element: React.createElement(AccountsPage) }),
      React.createElement(Route, { path: "/accounts/new", element: React.createElement(NewAccountPage) }),
      React.createElement(Route, { path: "/sponsor/new", element: React.createElement("p", null, "Sponsor workspace") }),
      React.createElement(Route, { path: "/creator/new", element: React.createElement("p", null, "Creator workspace") }),
    ),
  ))));
}
async function click(selector: string) { const element = container.querySelector<HTMLElement>(selector); expect(element).not.toBeNull(); await act(async () => element!.click()); }
async function fillInputs() {
  const inputs = [...container.querySelectorAll<HTMLInputElement>('input:not([type="radio"])')];
  for (const [index, value] of ["New Studio", "new_studio", "Technology"].entries()) await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(inputs[index], value);
    inputs[index].dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("shows a landing page, not account forms, when signed out", async () => {
  await mount(); expect(container.textContent).toContain("Great partnerships.");
  expect(container.querySelector('a[href="/login"]')).not.toBeNull();
  expect(container.querySelector("form")).toBeNull(); expect(api.profiles).not.toHaveBeenCalled();
});
it("uses the existing Google OAuth endpoint on the sign-in page", async () => {
  await mount("/login"); expect(container.querySelector('a[href="/api/auth/google/start"]')?.textContent).toContain("Continue with Google");
  expect(container.textContent).toContain("MetaMask extension");
  expect(container.textContent).toContain("Phone or QR");
  expect(container.querySelector('input[type="password"]')).toBeNull();
});
it("takes returning Google users to their accounts without inline creation fields", async () => {
  vi.mocked(api.me).mockResolvedValue({ user }); await mount();
  expect(container.textContent).toContain(user.email); expect(container.querySelector("form")).toBeNull();
  expect(container.querySelector('a[href="/accounts/new"]')).not.toBeNull();
  expect(container.textContent).toContain("Connect a wallet to unlock contracts");
});
it("requires authentication before opening account creation", async () => {
  await mount("/accounts/new"); expect(container.textContent).toContain("Continue with Google"); expect(container.querySelector("form")).toBeNull();
});
it("only reveals creation fields after a profile type is chosen", async () => {
  vi.mocked(api.me).mockResolvedValue({ user }); await mount("/accounts/new");
  expect(container.querySelector('input:not([type="radio"])')).toBeNull();
  await click('input[value="creator"]'); expect(container.textContent).toContain("Display name"); expect(container.textContent).toContain("Category");
  await click('input[value="sponsor"]'); expect(container.textContent).toContain("Company name"); expect(container.textContent).toContain("Industry");
});
it.each(["sponsor", "creator"] as const)("creates a %s profile and enters its workspace", async (role) => {
  vi.mocked(api.me).mockResolvedValue({ user }); await mount("/accounts/new");
  await click(`input[value="${role}"]`); await fillInputs(); await click('button[type="submit"]');
  expect(role === "sponsor" ? api.createSponsorProfile : api.createCreatorProfile).toHaveBeenCalledOnce();
  expect(JSON.parse(localStorage.getItem("fiducia.session")!)).toEqual({ role, id: "new" });
  expect(container.textContent).toContain(role === "sponsor" ? "Sponsor workspace" : "Creator workspace");
});
it("retains the creation form when the API rejects it", async () => {
  vi.mocked(api.me).mockResolvedValue({ user }); vi.mocked(api.createSponsorProfile).mockRejectedValueOnce(new Error("Handle already taken"));
  await mount("/accounts/new"); await click('input[value="sponsor"]'); await fillInputs(); await click('button[type="submit"]');
  expect(container.textContent).toContain("Handle already taken"); expect(container.querySelector<HTMLInputElement>('input:not([type="radio"])')?.value).toBe("New Studio");
});
it("limits wallet-only members to creator profile onboarding", async () => {
  vi.mocked(api.me).mockResolvedValue({ user: { ...user, email: null } }); await mount("/accounts/new");
  expect(container.querySelector<HTMLInputElement>('input[value="sponsor"]')?.disabled).toBe(true);
  expect(container.textContent).toContain("verified email");
  expect(container.querySelector<HTMLInputElement>('input[value="creator"]')?.disabled).toBe(false);
});
