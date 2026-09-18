import { describe, expect, it, vi } from "vitest";
import { connectWalletConnect, discoverMetaMask, requestWalletAccount, signWalletMessage, walletErrorMessage, type Eip1193Provider } from "../src/lib/evmProvider";

class ProviderEvent extends Event {
  constructor(type: string, readonly detail: unknown) { super(type); }
}

describe("MetaMask provider adapter", () => {
  it("uses the specifically identified MetaMask provider", async () => {
    const provider = { isMetaMask: true, request: vi.fn() } as Eip1193Provider;
    const target = new EventTarget() as EventTarget & { ethereum?: Eip1193Provider };
    target.addEventListener("eip6963:requestProvider", () => target.dispatchEvent(new ProviderEvent("eip6963:announceProvider", { info: { rdns: "io.metamask" }, provider })));
    await expect(discoverMetaMask(target, 10)).resolves.toBe(provider);
  });

  it("does not treat a different injected wallet as MetaMask", async () => {
    const target = new EventTarget() as EventTarget & { ethereum?: Eip1193Provider };
    target.ethereum = { request: vi.fn() };
    await expect(discoverMetaMask(target, 1)).resolves.toBeNull();
  });

  it("requests accounts, reads the active chain, and signs without a transaction", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => method === "eth_requestAccounts" ? ["0x1111111111111111111111111111111111111111"] : method === "eth_chainId" ? "0x2105" : "0xsigned");
    const provider = { request } as Eip1193Provider;
    const account = await requestWalletAccount(provider);
    expect(account.chainId).toBe(8453);
    await expect(signWalletMessage(provider, account.address, "Fiducia sign-in")).resolves.toBe("0xsigned");
    expect(request.mock.calls.map(([input]) => input.method)).toEqual(["eth_requestAccounts", "eth_chainId", "personal_sign"]);
  });

  it("opens a WalletConnect session that supports QR codes and wallet links", async () => {
    const connect = vi.fn();
    const provider = { request: vi.fn(), connect, connected: false };
    vi.stubGlobal("window", { location: { origin: "https://fiducia.example" } });
    const initialize = vi.fn(async () => provider);
    await expect(connectWalletConnect("project-id", initialize)).resolves.toBe(provider);
    expect(initialize).toHaveBeenCalledWith(expect.objectContaining({ projectId: "project-id", showQrModal: true, methods: ["personal_sign"] }));
    expect(connect).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("turns common MetaMask failures into recoverable guidance", () => {
    expect(walletErrorMessage({ code: 4001 })).toContain("canceled");
    expect(walletErrorMessage({ code: -32002 })).toContain("already has a request");
  });
});
