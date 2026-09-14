export type Eip1193Provider = {
  isMetaMask?: boolean;
  request<T = unknown>(input: { method: string; params?: unknown[] }): Promise<T>;
  on?(event: "accountsChanged" | "chainChanged", listener: (value: unknown) => void): void;
  removeListener?(event: "accountsChanged" | "chainChanged", listener: (value: unknown) => void): void;
};

type ProviderDetail = { info?: { rdns?: string; name?: string }; provider: Eip1193Provider };
type DiscoveryTarget = EventTarget & { ethereum?: Eip1193Provider };

export async function discoverMetaMask(target: DiscoveryTarget = window as unknown as DiscoveryTarget, timeoutMs = 350): Promise<Eip1193Provider | null> {
  if (target.ethereum?.isMetaMask) return target.ethereum;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (provider: Eip1193Provider | null) => {
      if (settled) return;
      settled = true; target.removeEventListener("eip6963:announceProvider", announced as EventListener); clearTimeout(timer); resolve(provider);
    };
    const announced = (event: Event) => {
      const detail = (event as CustomEvent<ProviderDetail>).detail;
      if (detail?.info?.rdns === "io.metamask" || detail?.provider?.isMetaMask) finish(detail.provider);
    };
    target.addEventListener("eip6963:announceProvider", announced as EventListener);
    const timer = setTimeout(() => finish(target.ethereum?.isMetaMask ? target.ethereum : null), timeoutMs);
    target.dispatchEvent(new Event("eip6963:requestProvider"));
  });
}

export async function requestMetaMaskAccount(provider: Eip1193Provider) {
  const accounts = await provider.request<string[]>({ method: "eth_requestAccounts" });
  if (!accounts[0]) throw new Error("MetaMask did not return an account. Unlock it and try again.");
  const chainHex = await provider.request<string>({ method: "eth_chainId" });
  const chainId = Number.parseInt(chainHex, 16);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error("MetaMask returned an invalid network.");
  return { address: accounts[0], chainId };
}

export async function signMetaMaskMessage(provider: Eip1193Provider, address: string, message: string) {
  return provider.request<string>({ method: "personal_sign", params: [message, address] });
}

export function walletErrorMessage(error: unknown) {
  const candidate = error as { code?: number; message?: string };
  if (candidate?.code === 4001) return "The MetaMask request was canceled. You can try again when ready.";
  if (candidate?.code === -32002) return "MetaMask already has a request waiting. Open the extension to continue.";
  if (typeof navigator !== "undefined" && !navigator.onLine) return "You appear to be offline. Reconnect and try again.";
  return candidate?.message || "MetaMask could not complete the request. Unlock it and try again.";
}
