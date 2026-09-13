import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { readSession } from "../lib/session";
import type { ProfilesResponse } from "../lib/types";
import { useResource } from "../lib/useResource";
import { AccountGroups, selectAccount } from "../ui/AccountSwitcher";
import { Banner, Button, Field, Input } from "../ui/primitives";

export function EntryPage() {
  const navigate = useNavigate();
  const currentSession = useMemo(() => readSession(), []);
  const { data: auth, error: authError, loading: authLoading } = useResource("entry-auth", () => api.me());
  const {
    data: profiles,
    error: profileError,
    loading: profileLoading,
    reload,
  } = useResource<ProfilesResponse | null>(
    `entry-profiles-${auth?.user?.id ?? "signed-out"}`,
    () => (auth?.user ? api.profiles() : Promise.resolve(null)),
  );

  const hasProfiles = Boolean((profiles?.sponsors.length ?? 0) + (profiles?.creators.length ?? 0));

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,#26223e_0%,#101217_60%)] px-6 py-16 text-center">
      <main className="mx-auto w-full max-w-[860px]">
        <div className="mb-7">
          <div className="text-xl font-semibold tracking-[-0.04em] text-ink">payouts<span className="text-[#b4aaff]">.</span></div>
          <p className="mt-12 text-[10px] uppercase tracking-[0.2em] text-[#b4aaff]">A better way to work together</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] text-ink sm:text-5xl">
            {auth?.user ? "Choose your workspace." : "Good work. Great partnerships."}
          </h1>
          <p className="mx-auto mt-2 max-w-[560px] text-sm text-muted">
            {auth?.user
              ? "Profiles are tied to your Google email. Create sponsor and creator accounts, then switch between them."
              : "Connect with creators and sponsors, keep conversations close, and manage every collaboration in one focused workspace."}
          </p>
        </div>

        {authLoading ? <p className="text-sm text-muted">Checking session...</p> : null}
        {authError ? <Banner>{authError}</Banner> : null}

        {!authLoading && !auth?.user ? (
          <Button type="button" onClick={() => (window.location.href = "/api/auth/google/start")}>
            Continue with Google
          </Button>
        ) : null}

        {auth?.user ? (
          <div className="space-y-8">
            <div className="text-sm text-muted">
              Signed in as <span className="font-medium text-ink">{auth.user.email}</span>
            </div>
            {profileLoading ? <p className="text-sm text-muted">Loading accounts...</p> : null}
            {profileError ? <Banner>{profileError}</Banner> : null}
            {profiles && hasProfiles ? (
              <AccountGroups
                profiles={profiles}
                currentSession={currentSession}
                onSelect={(target) => selectAccount(target, navigate)}
              />
            ) : null}
            {profiles && !hasProfiles ? (
              <p className="mx-auto max-w-[520px] text-sm text-muted">
                No profiles yet. Create a sponsor account, creator account, or both.
              </p>
            ) : null}
            <ProfileForms onCreated={reload} />
          </div>
        ) : null}
      </main>
    </div>
  );
}

function ProfileForms({ onCreated }: { onCreated: () => void }) {
  return (
    <div className="mx-auto grid max-w-[720px] gap-4 text-left md:grid-cols-2">
      <SponsorProfileForm onCreated={onCreated} />
      <CreatorProfileForm onCreated={onCreated} />
    </div>
  );
}

function SponsorProfileForm({ onCreated }: { onCreated: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [industry, setIndustry] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const sponsor = await api.createSponsorProfile({
        name: name.trim(),
        handle: handle.trim(),
        industry: industry.trim(),
        monthlyBudgetAmount: "0",
      });
      onCreated();
      navigate(`/sponsor/${sponsor.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create sponsor profile");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="rounded-xl border border-rule bg-surface p-5" onSubmit={submit}>
      <h2 className="text-sm font-semibold text-ink">Create sponsor account</h2>
      <div className="mt-4 space-y-3">
        {error ? <Banner>{error}</Banner> : null}
        <Field label="Company name">
          <Input value={name} onChange={(event) => setName(event.target.value)} required />
        </Field>
        <Field label="Account handle">
          <Input value={handle} onChange={(event) => setHandle(event.target.value)} required />
        </Field>
        <Field label="Industry">
          <Input value={industry} onChange={(event) => setIndustry(event.target.value)} required />
        </Field>
        <Button type="submit" disabled={busy || !name.trim() || !handle.trim() || !industry.trim()}>
          {busy ? "Creating..." : "Create sponsor"}
        </Button>
      </div>
    </form>
  );
}

function CreatorProfileForm({ onCreated }: { onCreated: () => void }) {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const creator = await api.createCreatorProfile({
        displayName: displayName.trim(),
        handle: handle.trim(),
        category: category.trim(),
      });
      onCreated();
      navigate(`/creator/${creator.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create creator profile");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="rounded-xl border border-rule bg-surface p-5" onSubmit={submit}>
      <h2 className="text-sm font-semibold text-ink">Create creator account</h2>
      <div className="mt-4 space-y-3">
        {error ? <Banner>{error}</Banner> : null}
        <Field label="Display name">
          <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
        </Field>
        <Field label="Account handle">
          <Input value={handle} onChange={(event) => setHandle(event.target.value)} required />
        </Field>
        <Field label="Category">
          <Input value={category} onChange={(event) => setCategory(event.target.value)} required />
        </Field>
        <Button type="submit" disabled={busy || !displayName.trim() || !handle.trim() || !category.trim()}>
          {busy ? "Creating..." : "Create creator"}
        </Button>
      </div>
    </form>
  );
}
