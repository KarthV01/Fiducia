import { useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, Outlet, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { readSession, writeSession } from "../lib/session";
import { useResource } from "../lib/useResource";
import { AccountGroups, selectAccount } from "../ui/AccountSwitcher";
import { PublicLayout } from "../ui/PublicLayout";
import { Banner, Button, ButtonLink, buttonClass, Field, Input, PageHeader } from "../ui/primitives";
import { Icon } from "../ui/Icon";
import { connectWalletConnect, discoverMetaMask, requestWalletAccount, signWalletMessage, walletConnectIsConfigured, walletErrorMessage, type WalletClient } from "../lib/evmProvider";
import { MetaMaskOnboarding } from "../ui/MetaMaskOnboarding";
import { BrandMark } from "../ui/BrandMark";

export function SignInPage() {
  const { data, error, loading, reload } = useResource("sign-in", () => api.me());
  const navigate = useNavigate();
  const [walletBusy, setWalletBusy] = useState<WalletClient | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  async function signInWithWallet(walletClient: WalletClient) {
    if (walletBusy) return;
    setWalletBusy(walletClient); setWalletError(null);
    try {
      const provider = walletClient === "walletconnect" ? await connectWalletConnect() : await discoverMetaMask();
      if (!provider) { setShowOnboarding(true); return; }
      const account = await requestWalletAccount(provider);
      const challenge = await api.ethereumChallenge(account.address, account.chainId);
      const signature = await signWalletMessage(provider, account.address, challenge.message);
      await api.ethereumSession({ ...challenge, signature, walletClient });
      navigate("/accounts", { replace: true });
    } catch (err) { setWalletError(walletErrorMessage(err)); }
    finally { setWalletBusy(null); }
  }

  if (data?.user) return <Navigate to="/accounts" replace />;
  return <PublicLayout><div className="mx-auto max-w-[420px] px-5 py-16 sm:py-24"><div className="rounded-2xl border border-rule bg-surface p-7 shadow-floating sm:p-9">
    <span className="mb-6 inline-flex"><BrandMark size="md" /></span>
    <h1 className="text-2xl font-semibold tracking-[-0.03em]">Sign in to Fiducia</h1><p className="mt-2 text-sm leading-relaxed text-muted">Access your sponsor and creator accounts, or create a new profile.</p>
    {error ? <div className="mt-5 space-y-2"><Banner>{error}</Banner><Button variant="ghost" onClick={reload}>Try again</Button></div> : null}
    <a href="/api/auth/google/start" className={buttonClass("secondary", "mt-7 h-11 w-full text-[15px]")}><GoogleLogo /> Continue with Google</a>
    <div className="my-5 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-rule" />or use a wallet<span className="h-px flex-1 bg-rule" /></div>
    <div className="grid gap-2.5"><Button variant="secondary" className="h-11 w-full" disabled={Boolean(walletBusy)} onClick={() => void signInWithWallet("metamask")}><Icon name="wallet" width="16" height="16" /> {walletBusy === "metamask" ? "Check MetaMask..." : "MetaMask extension"}</Button><Button variant="secondary" className="h-11 w-full" disabled={Boolean(walletBusy)} onClick={() => void signInWithWallet("walletconnect")} title={walletConnectIsConfigured() ? "Scan a QR code or open an installed wallet" : "Add VITE_WALLETCONNECT_PROJECT_ID to .env"}><Icon name="platforms" width="16" height="16" /> {walletBusy === "walletconnect" ? "Opening wallets..." : "Phone or QR"}</Button></div>
    {walletError ? <div className="mt-4"><Banner>{walletError}</Banner></div> : null}
    <p className="mt-5 text-center text-xs leading-relaxed text-muted">{loading ? "Checking your session..." : "Wallet sign-in is a free signature and never sends a transaction."}</p>
    </div><p className="mt-6 text-center text-sm text-muted">New to Fiducia? You'll set up a profile after signing in.</p></div><MetaMaskOnboarding open={showOnboarding} onClose={() => setShowOnboarding(false)} onRetry={() => { setShowOnboarding(false); void signInWithWallet("metamask"); }} /></PublicLayout>;
}

function GoogleLogo() {
  return <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8Z" /><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" /><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" /><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" /></svg>;
}

/** A remembered profile ID is not an authenticated session. */
export function AccountAccess() {
  const { data, error, loading, reload } = useResource("authenticated-pages", () => api.me());
  if (loading) return <PublicLayout><p role="status" className="py-24 text-center text-sm text-muted">Opening your workspace…</p></PublicLayout>;
  if (error) return <PublicLayout><div className="mx-auto max-w-lg space-y-4 px-5 py-20"><Banner>{error}</Banner><Button onClick={reload}>Try again</Button><ButtonLink to="/login" variant="secondary">Back to sign in</ButtonLink></div></PublicLayout>;
  if (!data?.user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function AccountsPage() {
  const navigate = useNavigate();
  const currentSession = useMemo(() => readSession(), []);
  const { data, error, loading, reload } = useResource("account-directory", () => api.profiles());
  return <PublicLayout signedIn><div className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
    <PageHeader title="Your accounts" description="Choose the profile you want to work with today." action={<ButtonLink to="/accounts/new"><Icon name="plus" width="16" height="16" /> Create account</ButtonLink>} />
    {loading ? <p role="status" className="text-sm text-muted">Loading your accounts…</p> : null}
    {error ? <div className="space-y-3"><Banner>{error}</Banner><Button variant="secondary" onClick={reload}>Try again</Button></div> : null}
    {data ? <><p className="mb-4 text-sm text-muted">Signed in as <span className="font-medium text-ink">{data.user.email ?? "MetaMask wallet"}</span></p><AccountWalletPanel />{data.sponsors.length || data.creators.length ? <AccountGroups profiles={data} currentSession={currentSession} onSelect={(target) => selectAccount(target, navigate)} /> : <div className="rounded-2xl border border-dashed border-rule bg-surface/60 p-12 text-center"><span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-rule bg-surface text-link shadow-card"><Icon name="network" width="20" height="20" /></span><h2 className="text-lg font-semibold tracking-[-0.01em]">Your first partnership starts here.</h2><p className="mx-auto mt-2 mb-6 max-w-sm text-sm text-muted">Create a sponsor profile for your brand, or a creator profile for your work.</p><ButtonLink to="/accounts/new">Create your first account</ButtonLink></div>}</> : null}
    </div></PublicLayout>;
}

function AccountWalletPanel() {
  const { data, error, loading, reload } = useResource("account-wallets", () => api.accountWallets());
  const [busy, setBusy] = useState<WalletClient | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const activeWallets = data?.wallets.filter((wallet) => !wallet.revokedAt) ?? [];
  async function connect(walletClient: WalletClient) {
    if (busy) return;
    setBusy(walletClient); setActionError(null);
    try {
      const provider = walletClient === "walletconnect" ? await connectWalletConnect() : await discoverMetaMask();
      if (!provider) { setShowOnboarding(true); return; }
      const account = await requestWalletAccount(provider);
      const challenge = await api.accountWalletChallenge(account.address, account.chainId);
      const signature = await signWalletMessage(provider, account.address, challenge.message);
      await api.connectAccountWallet({ ...challenge, signature, walletClient });
      reload();
    } catch (err) { setActionError(walletErrorMessage(err)); }
    finally { setBusy(null); }
  }
  return <section className="mb-10 rounded-xl border border-rule bg-surface p-5 shadow-card">
    <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-start gap-3.5"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${activeWallets.length ? "border-success-rule bg-success-soft text-success" : "border-warning-rule bg-warning-soft text-warning"}`}><Icon name="wallet" width="17" height="17" /></span><div><h2 className="font-semibold text-ink">{activeWallets.length ? "Wallet connected" : "Connect a wallet to unlock contracts"}</h2><p className="mt-0.5 text-sm text-muted">{activeWallets.length ? `${activeWallets.map((wallet) => `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`).join(", ")} can sign in to this account.` : "Networking and messages remain available, but contract drafting and acceptance are blocked until ownership is verified."}</p></div></div><div className="flex flex-wrap gap-2"><Button variant={activeWallets.length ? "secondary" : "primary"} disabled={Boolean(busy) || loading} onClick={() => void connect("metamask")}>{busy === "metamask" ? "Check MetaMask..." : "MetaMask extension"}</Button><Button variant="secondary" disabled={Boolean(busy) || loading} onClick={() => void connect("walletconnect")}>{busy === "walletconnect" ? "Opening wallets..." : "Phone or QR"}</Button></div></div>
    {error || actionError ? <div className="mt-4"><Banner>{actionError ?? error}</Banner></div> : null}
    <MetaMaskOnboarding open={showOnboarding} onClose={() => setShowOnboarding(false)} onRetry={() => { setShowOnboarding(false); void connect("metamask"); }} />
  </section>;
}

export function NewAccountPage() {
  const navigate = useNavigate();
  const { data: auth } = useResource("new-account-auth", () => api.me());
  const [role, setRole] = useState<"sponsor" | "creator" | null>(null);
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [descriptor, setDescriptor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const walletOnly = auth?.user?.email === null;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!role || busy) return;
    setBusy(true); setError(null);
    try {
      const profile = role === "sponsor" ? await api.createSponsorProfile({ name: name.trim(), handle: handle.trim(), industry: descriptor.trim(), monthlyBudgetAmount: "0" }) : await api.createCreatorProfile({ displayName: name.trim(), handle: handle.trim(), category: descriptor.trim() });
      writeSession({ role, id: profile.id });
      navigate(`/${role}/${profile.id}`);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create account."); }
    finally { setBusy(false); }
  }
  return <PublicLayout signedIn><div className="mx-auto max-w-2xl px-5 py-12 sm:px-8">
    <Link to="/accounts" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"><Icon name="back" width="15" height="15" /> Your accounts</Link>
    <PageHeader title="Create an account" description="Add a separate sponsor or creator profile under this sign-in. You can add more anytime." />
    <form onSubmit={submit} className="space-y-6">
      <fieldset disabled={busy}><legend className="mb-3 text-[13px] font-medium">Account type</legend><div className="grid gap-3 sm:grid-cols-2">{(["sponsor", "creator"] as const).map((type) => { const disabled = type === "sponsor" && walletOnly; return <label key={type} className={`rounded-xl border p-5 shadow-card transition-colors ${disabled ? "cursor-not-allowed border-rule bg-surface opacity-55" : role === type ? "cursor-pointer border-accent bg-accent-soft ring-3 ring-accent/10" : "cursor-pointer border-rule bg-surface hover:border-ink/20"}`}><span className="flex items-center justify-between"><span className="flex items-center gap-2.5 text-[15px] font-semibold"><Icon name={type === "sponsor" ? "earnings" : "platforms"} width="17" height="17" className="text-link" />{type === "sponsor" ? "Sponsor" : "Creator"}</span><input disabled={disabled} type="radio" name="profile-role" value={type} checked={role === type} onChange={() => { setRole(type); setDescriptor(""); setError(null); }} className="accent-accent" /></span><span className="mt-2 block text-sm leading-relaxed text-muted">{disabled ? "Sign in with a verified email to create sponsor profiles." : type === "sponsor" ? "Fund campaigns and find creative partners for your brand." : "Get paid for sponsored content, backed by escrow."}</span></label>; })}</div></fieldset>
      {role ? <div className="space-y-5 rounded-xl border border-rule bg-surface p-6 shadow-card">
        <h2 className="text-[15px] font-semibold">Profile details</h2>
        {error ? <Banner>{error}</Banner> : null}
        <Field label={role === "sponsor" ? "Company name" : "Display name"} required><Input autoComplete={role === "sponsor" ? "organization" : "name"} value={name} onChange={(event) => setName(event.target.value)} disabled={busy} required maxLength={100} /></Field>
        <Field label="Account handle" hint="A unique handle to help people find your profile." required><Input autoComplete="off" value={handle} onChange={(event) => setHandle(event.target.value)} disabled={busy} required maxLength={50} /></Field>
        <Field label={role === "sponsor" ? "Industry" : "Category"} required><Input value={descriptor} onChange={(event) => setDescriptor(event.target.value)} disabled={busy} required maxLength={100} /></Field>
        <div className="flex items-center justify-between gap-3 border-t border-rule pt-5"><Link to="/accounts" className={buttonClass("ghost")}>Cancel</Link><Button type="submit" disabled={busy || !name.trim() || !handle.trim() || !descriptor.trim()}>{busy ? "Creating…" : "Create account"}</Button></div>
      </div> : <p className="text-sm text-muted">Choose a profile type to continue.</p>}
    </form>
  </div></PublicLayout>;
}
