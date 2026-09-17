import { useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, Outlet, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { readSession, writeSession } from "../lib/session";
import { useResource } from "../lib/useResource";
import { AccountGroups, selectAccount } from "../ui/AccountSwitcher";
import { PublicLayout } from "../ui/PublicLayout";
import { Banner, Button, ButtonLink, Field, Input, PageHeader } from "../ui/primitives";
import { Icon } from "../ui/Icon";
import { discoverMetaMask, requestMetaMaskAccount, signMetaMaskMessage, walletErrorMessage } from "../lib/evmProvider";
import { MetaMaskOnboarding } from "../ui/MetaMaskOnboarding";
import { BrandMark } from "../ui/BrandMark";

export function SignInPage() {
  const { data, error, loading, reload } = useResource("sign-in", () => api.me());
  const navigate = useNavigate();
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  async function signInWithMetaMask() {
    if (walletBusy) return;
    setWalletBusy(true); setWalletError(null);
    try {
      const provider = await discoverMetaMask();
      if (!provider) { setShowOnboarding(true); return; }
      const account = await requestMetaMaskAccount(provider);
      const challenge = await api.ethereumChallenge(account.address, account.chainId);
      const signature = await signMetaMaskMessage(provider, account.address, challenge.message);
      await api.ethereumSession({ ...challenge, signature, walletClient: "metamask" });
      navigate("/accounts", { replace: true });
    } catch (err) { setWalletError(walletErrorMessage(err)); }
    finally { setWalletBusy(false); }
  }

  if (data?.user) return <Navigate to="/accounts" replace />;
  return <PublicLayout><div className="mx-auto max-w-md px-5 py-16 sm:py-24"><div className="rounded-2xl border border-rule bg-surface p-7 sm:p-9">
    <span className="mb-6 inline-flex"><BrandMark size="lg" /></span>
    <h1 className="text-3xl font-semibold tracking-[-0.04em]">Welcome to Fiducia.</h1><p className="mt-3 text-sm leading-relaxed text-muted">Access your existing accounts or start a creator profile with a verified wallet.</p>
    {error ? <div className="mt-5 space-y-2"><Banner>{error}</Banner><Button variant="ghost" onClick={reload}>Try again</Button></div> : null}
    <a href="/api/auth/google/start" className="mt-8 flex h-12 items-center justify-center gap-3 rounded-lg border border-rule bg-canvas font-medium transition-colors hover:bg-accent-soft"><span aria-hidden="true" className="text-lg font-semibold">G</span> Continue with Google</a>
    <div className="my-3 flex items-center gap-3 text-[10px] uppercase tracking-[0.14em] text-muted"><span className="h-px flex-1 bg-rule" />or<span className="h-px flex-1 bg-rule" /></div>
    <button type="button" disabled={walletBusy} onClick={() => void signInWithMetaMask()} className="flex h-12 w-full items-center justify-center gap-3 rounded-lg bg-accent text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"><Icon name="wallet" /> {walletBusy ? "Check MetaMask..." : "Continue with MetaMask"}</button>
    {walletError ? <div className="mt-4"><Banner>{walletError}</Banner></div> : null}
    <p className="mt-4 text-center text-xs leading-relaxed text-muted">{loading ? "Checking your session..." : "Signing is free and never sends a transaction. Existing Google members should sign in with Google and connect their wallet from a creator profile."}</p>
    </div><p className="mt-6 text-center text-sm text-muted">New here? You will create a profile after signing in.</p></div><MetaMaskOnboarding open={showOnboarding} onClose={() => setShowOnboarding(false)} onRetry={() => { setShowOnboarding(false); void signInWithMetaMask(); }} /></PublicLayout>;
}

/** A remembered profile ID is not an authenticated session. */
export function AccountAccess() {
  const { data, error, loading, reload } = useResource("authenticated-pages", () => api.me());
  if (loading) return <PublicLayout><p role="status" className="py-24 text-center text-muted">Opening your workspace…</p></PublicLayout>;
  if (error) return <PublicLayout><div className="mx-auto max-w-lg space-y-4 px-5 py-20"><Banner>{error}</Banner><Button onClick={reload}>Try again</Button><ButtonLink to="/login" variant="secondary">Back to sign in</ButtonLink></div></PublicLayout>;
  if (!data?.user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function AccountsPage() {
  const navigate = useNavigate();
  const currentSession = useMemo(() => readSession(), []);
  const { data, error, loading, reload } = useResource("account-directory", () => api.profiles());
  return <PublicLayout signedIn><div className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
    <PageHeader title="Your accounts" description="Choose the profile you want to work with today." action={<ButtonLink to="/accounts/new">Create account <span aria-hidden="true" className="ml-2">＋</span></ButtonLink>} />
    {loading ? <p role="status" className="text-muted">Loading your accounts…</p> : null}
    {error ? <div className="space-y-3"><Banner>{error}</Banner><Button variant="secondary" onClick={reload}>Try again</Button></div> : null}
    {data ? <><p className="mb-8 text-sm text-muted">Signed in as <span className="font-medium text-ink">{data.user.email ?? "MetaMask wallet"}</span></p>{data.sponsors.length || data.creators.length ? <AccountGroups profiles={data} currentSession={currentSession} onSelect={(target) => selectAccount(target, navigate)} /> : <div className="rounded-2xl border border-dashed border-rule p-10 text-center"><span className="mb-4 inline-flex text-link"><Icon name="network" width="32" height="32" /></span><h2 className="text-lg font-medium">Your first partnership starts here.</h2><p className="mx-auto mt-2 mb-6 max-w-sm text-sm text-muted">Create a sponsor profile for your brand, or a creator profile for your work.</p><ButtonLink to="/accounts/new">Create your first account</ButtonLink></div>}</> : null}
    </div></PublicLayout>;
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
    <Link to="/accounts" className="mb-6 inline-flex items-center gap-2 text-sm text-muted hover:text-ink"><Icon name="back" width="16" height="16" /> Your accounts</Link>
    <PageHeader title="Make it your workspace." description="Create a separate professional profile under this sign-in. You can add another anytime." />
    <form onSubmit={submit} className="space-y-6">
      <fieldset disabled={busy}><legend className="mb-3 text-sm font-medium">What brings you here?</legend><div className="grid gap-3 sm:grid-cols-2">{(["sponsor", "creator"] as const).map((type) => { const disabled = type === "sponsor" && walletOnly; return <label key={type} className={`rounded-xl border p-5 transition-colors ${disabled ? "cursor-not-allowed border-rule bg-surface opacity-55" : role === type ? "cursor-pointer border-link bg-accent-soft" : "cursor-pointer border-rule bg-surface hover:border-muted"}`}><span className="flex items-center justify-between"><span className="text-base font-medium">{type === "sponsor" ? "I’m a sponsor" : "I’m a creator"}</span><input disabled={disabled} type="radio" name="profile-role" value={type} checked={role === type} onChange={() => { setRole(type); setDescriptor(""); setError(null); }} className="accent-accent" /></span><span className="mt-2 block text-sm leading-relaxed text-muted">{disabled ? "Sign in with a verified email to create sponsor profiles." : type === "sponsor" ? "Find creative partners for your brand." : "Build partnerships around your work."}</span></label>; })}</div></fieldset>
      {role ? <div className="space-y-5 rounded-xl border border-rule bg-surface p-6">
        <h2 className="text-base font-medium">Your {role} profile</h2>
        {error ? <Banner>{error}</Banner> : null}
        <Field label={role === "sponsor" ? "Company name" : "Display name"} required><Input autoComplete={role === "sponsor" ? "organization" : "name"} value={name} onChange={(event) => setName(event.target.value)} disabled={busy} required maxLength={100} /></Field>
        <Field label="Account handle" hint="A unique handle to help people find your profile." required><Input autoComplete="off" value={handle} onChange={(event) => setHandle(event.target.value)} disabled={busy} required maxLength={50} /></Field>
        <Field label={role === "sponsor" ? "Industry" : "Category"} required><Input value={descriptor} onChange={(event) => setDescriptor(event.target.value)} disabled={busy} required maxLength={100} /></Field>
        <div className="flex items-center justify-between gap-3 border-t border-rule pt-5"><Link to="/accounts" className="text-sm text-muted hover:text-ink">Cancel</Link><Button type="submit" disabled={busy || !name.trim() || !handle.trim() || !descriptor.trim()}>{busy ? "Creating…" : "Create account"}</Button></div>
      </div> : <p className="text-sm text-muted">Choose a profile type to continue.</p>}
    </form>
  </div></PublicLayout>;
}
