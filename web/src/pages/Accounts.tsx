import { useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, Outlet, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { readSession, writeSession } from "../lib/session";
import { useResource } from "../lib/useResource";
import { AccountGroups, selectAccount } from "../ui/AccountSwitcher";
import { PublicLayout } from "../ui/PublicLayout";
import { Banner, Button, ButtonLink, Field, Input, PageHeader } from "../ui/primitives";
import { Icon } from "../ui/Icon";

export function SignInPage() {
  const { data, error, loading, reload } = useResource("sign-in", () => api.me());
  if (data?.user) return <Navigate to="/accounts" replace />;
  return <PublicLayout><div className="mx-auto max-w-md px-5 py-16 sm:py-24"><div className="rounded-2xl border border-rule bg-surface p-7 sm:p-9">
    <span className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-link"><Icon name="network" width="24" height="24" /></span>
    <h1 className="text-3xl font-semibold tracking-[-0.04em]">Welcome to Payouts.</h1><p className="mt-3 text-sm leading-relaxed text-muted">Sign in with Google to access your accounts, or create your first sponsor or creator profile.</p>
    {error ? <div className="mt-5 space-y-2"><Banner>{error}</Banner><Button variant="ghost" onClick={reload}>Try again</Button></div> : null}
    <a href="/api/auth/google/start" className="mt-8 flex h-12 items-center justify-center gap-3 rounded-lg border border-rule bg-canvas font-medium transition-colors hover:bg-accent-soft"><span aria-hidden="true" className="text-lg font-semibold">G</span> Continue with Google</a>
    <p className="mt-4 text-center text-xs leading-relaxed text-muted">{loading ? "Checking your session…" : "No separate password. Your profiles stay tied to your Google account."}</p>
    </div><p className="mt-6 text-center text-sm text-muted">New here? You’ll create a profile after signing in.</p></div></PublicLayout>;
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
    {data ? <><p className="mb-8 text-sm text-muted">Signed in as <span className="font-medium text-ink">{data.user.email}</span></p>{data.sponsors.length || data.creators.length ? <AccountGroups profiles={data} currentSession={currentSession} onSelect={(target) => selectAccount(target, navigate)} /> : <div className="rounded-2xl border border-dashed border-rule p-10 text-center"><span className="mb-4 inline-flex text-link"><Icon name="network" width="32" height="32" /></span><h2 className="text-lg font-medium">Your first partnership starts here.</h2><p className="mx-auto mt-2 mb-6 max-w-sm text-sm text-muted">Create a sponsor profile for your brand, or a creator profile for your work.</p><ButtonLink to="/accounts/new">Create your first account</ButtonLink></div>}</> : null}
    </div></PublicLayout>;
}

export function NewAccountPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState<"sponsor" | "creator" | null>(null);
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [descriptor, setDescriptor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    <PageHeader title="Make it your workspace." description="Create a new profile under your Google account. You can add another anytime." />
    <form onSubmit={submit} className="space-y-6">
      <fieldset disabled={busy}><legend className="mb-3 text-sm font-medium">What brings you here?</legend><div className="grid gap-3 sm:grid-cols-2">{(["sponsor", "creator"] as const).map((type) => <label key={type} className={`cursor-pointer rounded-xl border p-5 transition-colors ${role === type ? "border-link bg-accent-soft" : "border-rule bg-surface hover:border-muted"}`}><span className="flex items-center justify-between"><span className="text-base font-medium">{type === "sponsor" ? "I’m a sponsor" : "I’m a creator"}</span><input type="radio" name="profile-role" value={type} checked={role === type} onChange={() => { setRole(type); setDescriptor(""); setError(null); }} className="accent-accent" /></span><span className="mt-2 block text-sm leading-relaxed text-muted">{type === "sponsor" ? "Find creative partners for your brand." : "Build partnerships around your work."}</span></label>)}</div></fieldset>
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
