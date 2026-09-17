import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { discoverMetaMask, requestMetaMaskAccount, signMetaMaskMessage, walletErrorMessage, type Eip1193Provider } from "../../lib/evmProvider";
import { useResource } from "../../lib/useResource";
import type { CreatorWalletConnection } from "../../lib/types";
import { MetaMaskOnboarding } from "../../ui/MetaMaskOnboarding";
import { Banner, Button, PageHeader } from "../../ui/primitives";
import { Icon } from "../../ui/Icon";

export function CreatorWalletsPage() {
  const { creatorId = "" } = useParams();
  const { data, error, loading, reload } = useResource(`creator-wallets-${creatorId}`, () => api.creatorWallets(creatorId));
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [activeAccount, setActiveAccount] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!provider?.on) return;
    const changed = (value: unknown) => setActiveAccount(Array.isArray(value) && typeof value[0] === "string" ? value[0] : null);
    provider.on("accountsChanged", changed);
    return () => provider.removeListener?.("accountsChanged", changed);
  }, [provider]);

  async function connect() {
    if (busy) return;
    setBusy("connect"); setActionError(null);
    try {
      const found = await discoverMetaMask();
      if (!found) { setShowOnboarding(true); return; }
      setProvider(found);
      const account = await requestMetaMaskAccount(found); setActiveAccount(account.address);
      const challenge = await api.creatorWalletChallenge(creatorId, account.address, account.chainId);
      const signature = await signMetaMaskMessage(found, account.address, challenge.message);
      await api.connectCreatorWallet(creatorId, { ...challenge, signature, walletClient: "metamask" });
      reload();
    } catch (err) { setActionError(walletErrorMessage(err)); }
    finally { setBusy(null); }
  }

  async function makePrimary(wallet: CreatorWalletConnection) {
    setBusy(wallet.id); setActionError(null);
    try { await api.makeCreatorWalletPrimary(creatorId, wallet.id); reload(); }
    catch (err) { setActionError(err instanceof Error ? err.message : "Could not update the payout wallet."); }
    finally { setBusy(null); }
  }

  async function disconnect(wallet: CreatorWalletConnection) {
    if (!window.confirm(`Disconnect ${shortAddress(wallet.address)}? Existing contracts will keep their recorded payout address.`)) return;
    setBusy(wallet.id); setActionError(null);
    try { await api.disconnectCreatorWallet(creatorId, wallet.id); reload(); }
    catch (err) { setActionError(err instanceof Error ? err.message : "Could not disconnect this wallet."); }
    finally { setBusy(null); }
  }

  return <div className="max-w-5xl">
    <PageHeader title="Wallets" description="Verify the addresses you control and choose where future creator payouts should go." action={<Button onClick={() => void connect()} disabled={Boolean(busy)}><Icon name="wallet" />{busy === "connect" ? "Check MetaMask..." : "Connect MetaMask"}</Button>} />
    <div className="mb-7 rounded-xl border border-accent-rule bg-accent-soft p-4 text-sm"><div className="font-medium text-ink">A signature proves ownership - it does not move funds.</div><p className="mt-1 text-muted">Fiducia never requests a recovery phrase, private key, token approval, or gas payment.</p></div>
    {activeAccount && data?.wallets.some((wallet) => !wallet.revokedAt && wallet.address.toLowerCase() !== activeAccount.toLowerCase()) ? <div className="mb-5"><Banner tone="info">MetaMask changed to {shortAddress(activeAccount)}. Connect it separately if you want to add it to this profile.</Banner></div> : null}
    {actionError ? <div className="mb-5"><Banner>{actionError}</Banner></div> : null}
    {error ? <div className="space-y-3"><Banner>{error}</Banner><Button variant="secondary" onClick={reload}>Try again</Button></div> : null}
    {loading ? <p className="text-sm text-muted">Loading wallets...</p> : null}
    {data ? <div className="grid gap-4">{data.wallets.length ? data.wallets.map((wallet) => <WalletRow key={wallet.id} wallet={wallet} busy={busy === wallet.id} onPrimary={makePrimary} onDisconnect={disconnect} />) : <div className="rounded-2xl border border-dashed border-rule bg-surface/50 p-10 text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-link"><Icon name="wallet" width="24" height="24" /></span><h2 className="mt-4 text-lg font-medium">Connect a payout wallet</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted">You can network and message without one. A verified primary wallet is required before a sponsor can draft a contract for you.</p><Button className="mt-6" onClick={() => void connect()}>Connect MetaMask</Button></div>}</div> : null}
    <MetaMaskOnboarding open={showOnboarding} onClose={() => setShowOnboarding(false)} onRetry={() => { setShowOnboarding(false); void connect(); }} />
  </div>;
}

function WalletRow({ wallet, busy, onPrimary, onDisconnect }: { wallet: CreatorWalletConnection; busy: boolean; onPrimary: (wallet: CreatorWalletConnection) => void; onDisconnect: (wallet: CreatorWalletConnection) => void }) {
  const historical = wallet.source === "legacy_generated";
  const revoked = Boolean(wallet.revokedAt);
  return <div className={`rounded-xl border bg-surface p-5 ${wallet.isPrimary ? "border-accent-rule" : "border-rule"}`}>
    <div className="flex flex-wrap items-center justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm text-ink">{shortAddress(wallet.address)}</span>{wallet.isPrimary ? <Badge>Primary payout</Badge> : null}{revoked ? <Badge>Disconnected</Badge> : historical ? <Badge>Historical</Badge> : <Badge>Verified</Badge>}</div><p className="mt-2 text-xs text-muted">{historical ? "Previously generated by Fiducia. Kept only for contract history; it cannot be used to sign in." : `Verified with ${wallet.source === "metamask" ? "MetaMask" : wallet.source}${wallet.verifiedAt ? ` on ${new Date(wallet.verifiedAt).toLocaleDateString()}` : ""}.`}</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={() => void navigator.clipboard.writeText(wallet.address)}>Copy</Button>{!historical && !revoked && !wallet.isPrimary ? <Button variant="secondary" disabled={busy} onClick={() => onPrimary(wallet)}>Make primary</Button> : null}{!historical && !revoked ? <Button variant="ghost" disabled={busy} onClick={() => onDisconnect(wallet)}>Disconnect</Button> : null}</div></div>
  </div>;
}

function Badge({ children }: { children: string }) { return <span className="rounded-full border border-rule bg-canvas px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted">{children}</span>; }
function shortAddress(address: string) { return `${address.slice(0, 6)}...${address.slice(-4)}`; }
