import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import React, { act } from "react";
import { Window } from "happy-dom";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Root } from "react-dom/client";
import { CreatorWalletsPage } from "../src/pages/creator/Wallets";
import { api } from "../src/lib/api";
import { discoverMetaMask, requestMetaMaskAccount, signMetaMaskMessage } from "../src/lib/evmProvider";

vi.mock("../src/lib/api", () => ({ api: { creatorWallets: vi.fn(), creatorWalletChallenge: vi.fn(), connectCreatorWallet: vi.fn(), makeCreatorWalletPrimary: vi.fn(), disconnectCreatorWallet: vi.fn() } }));
vi.mock("../src/lib/evmProvider", () => ({ discoverMetaMask: vi.fn(), requestMetaMaskAccount: vi.fn(), signMetaMaskMessage: vi.fn(), walletErrorMessage: (error: Error) => error.message }));

const address = "0x1111111111111111111111111111111111111111";
const wallet = { id: "wallet-1", address, source: "metamask", isPrimary: false, verifiedAt: "2026-09-13T00:00:00.000Z", revokedAt: null };
let root: Root; let container: HTMLDivElement; let createRoot: typeof import("react-dom/client").createRoot;

beforeAll(async () => {
  const dom = new Window({ url: "http://localhost:5173" });
  for (const name of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "MouseEvent"] as const) vi.stubGlobal(name, name === "window" ? dom : dom[name]);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); createRoot = (await import("react-dom/client")).createRoot;
});
beforeEach(() => {
  vi.clearAllMocks(); container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  vi.mocked(api.creatorWallets).mockResolvedValue({ wallets: [] });
  vi.mocked(discoverMetaMask).mockResolvedValue({ request: vi.fn() });
  vi.mocked(requestMetaMaskAccount).mockResolvedValue({ address, chainId: 1 });
  vi.mocked(api.creatorWalletChallenge).mockResolvedValue({ challengeId: "challenge", message: "sign me", expiresAt: "soon" });
  vi.mocked(signMetaMaskMessage).mockResolvedValue("0xsigned");
  vi.mocked(api.connectCreatorWallet).mockResolvedValue({ ...wallet, isPrimary: true });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
afterAll(() => vi.unstubAllGlobals());

async function mount() { await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: ["/creator/creator-1/wallets"] }, React.createElement(Routes, null, React.createElement(Route, { path: "/creator/:creatorId/wallets", element: React.createElement(CreatorWalletsPage) }))))); }
async function clickText(text: string) { const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes(text)); expect(button).toBeTruthy(); await act(async () => button!.click()); }

it("connects MetaMask through a server-issued signed challenge", async () => {
  await mount(); await clickText("Connect MetaMask");
  expect(api.creatorWalletChallenge).toHaveBeenCalledWith("creator-1", address, 1);
  expect(signMetaMaskMessage).toHaveBeenCalledWith(expect.anything(), address, "sign me");
  expect(api.connectCreatorWallet).toHaveBeenCalledWith("creator-1", expect.objectContaining({ challengeId: "challenge", signature: "0xsigned", walletClient: "metamask" }));
});

it("can promote and disconnect a verified secondary wallet", async () => {
  vi.mocked(api.creatorWallets).mockResolvedValue({ wallets: [wallet] });
  vi.mocked(api.makeCreatorWalletPrimary).mockResolvedValue({ ...wallet, isPrimary: true });
  vi.mocked(api.disconnectCreatorWallet).mockResolvedValue({ ...wallet, revokedAt: "2026-09-13T01:00:00.000Z" });
  Object.defineProperty(window, "confirm", { configurable: true, value: vi.fn(() => true) });
  await mount(); await clickText("Make primary"); expect(api.makeCreatorWalletPrimary).toHaveBeenCalledWith("creator-1", "wallet-1");
  await clickText("Disconnect"); expect(api.disconnectCreatorWallet).toHaveBeenCalledWith("creator-1", "wallet-1");
});
