import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { ProfileAvatar as Avatar } from "../ui/ProfileAvatar";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import { useProfileRealtime } from "../lib/useProfileRealtime";
import type { ConnectionRequest, SocialProfile } from "../lib/types";
import { Banner, Button, EmptyState, Input, PageHeader, Select } from "../ui/primitives";

type NetworkTab = "discover" | "connections" | "invitations";

export function NetworkPage() {
  const { sponsorId, creatorId } = useParams();
  const role = sponsorId ? "sponsor" : "creator";
  const profileId = sponsorId ?? creatorId ?? "";
  const identityId = `${role}:${profileId}`;
  const basePath = `/${role}/${profileId}`;
  const [tab, setTab] = useState<NetworkTab>("discover");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const [profileType, setProfileType] = useState("all");
  const [relationship, setRelationship] = useState("all");
  const [profiles, setProfiles] = useState<SocialProfile[]>([]);
  const [connections, setConnections] = useState<ConnectionRequest[]>([]);
  const [incoming, setIncoming] = useState<ConnectionRequest[]>([]);
  const [outgoing, setOutgoing] = useState<ConnectionRequest[]>([]);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (cursor?: string) => {
    const version = ++requestVersion.current;
    setError(null);
    try {
      if (tab === "discover") {
        const result = await api.searchProfiles(identityId, { q: debouncedQuery, relationship, profileType, cursor });
        if (version !== requestVersion.current) return;
        setProfiles((current) => cursor ? [...current, ...result.items.filter((item) => !current.some((old) => old.id === item.id))] : result.items);
        setNextCursor(result.nextCursor);
      } else if (tab === "connections") {
        const result = await api.connections(identityId, "connected");
        if (version === requestVersion.current) setConnections(result.items);
      } else {
        const [received, sent] = await Promise.all([
          api.connections(identityId, "incoming"),
          api.connections(identityId, "outgoing"),
        ]);
        if (version !== requestVersion.current) return;
        setIncoming(received.items);
        setOutgoing(sent.items);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your network");
    }
  }, [identityId, profileType, debouncedQuery, relationship, tab]);

  useEffect(() => {
    void load();
    return () => { requestVersion.current++; };
  }, [load]);
  useProfileRealtime(identityId, (event) => {
    if (event.type === "connection.updated" || event.type === "ready") void load();
  });

  async function mutate(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      window.dispatchEvent(new CustomEvent("messaging:changed"));
      setMessage(success);
      setNoteFor(null);
      setNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update your network");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="My Network" description="Build professional connections with creators and sponsors." />
      {error ? <div className="mb-4"><Banner>{error}</Banner></div> : null}
      {message ? <div className="mb-4"><Banner tone="info">{message}</Banner></div> : null}
      <div className="mb-5 flex gap-1 border-b-2 border-ink/20">
        {(["discover", "connections", "invitations"] as const).map((item) => (
          <button key={item} type="button" className={`border-b-2 px-4 py-2.5 text-sm font-medium capitalize ${tab === item ? "-mb-0.5 border-accent text-accent" : "border-transparent text-muted hover:text-ink"}`} onClick={() => setTab(item)}>{item}</button>
        ))}
      </div>

      {tab === "discover" ? <>
        <form className="mb-5 grid gap-2 md:grid-cols-[minmax(240px,1fr)_170px_170px_auto]" onSubmit={(event) => { event.preventDefault(); void load(); }}>
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, handle, category, or industry" />
          <Select value={profileType} onChange={(event) => setProfileType(event.target.value)}><option value="all">All profiles</option><option value="creator">Creators</option><option value="sponsor">Sponsors</option></Select>
          <Select value={relationship} onChange={(event) => setRelationship(event.target.value)}><option value="all">Any relationship</option><option value="none">Not connected</option><option value="connected">Connections</option><option value="incoming">Invited you</option><option value="outgoing">Request sent</option></Select>
          <Button type="submit">Search</Button>
        </form>
        <ProfileGrid profiles={profiles} role={role} basePath={basePath} busy={busy} noteFor={noteFor} note={note} setNote={setNote} setNoteFor={setNoteFor} onConnect={(profile) => mutate(() => api.requestConnection(identityId, profile.id, note), `Connection request sent to ${profile.displayName}.`)} />
      </> : null}
      {tab === "discover" && nextCursor ? <Button type="button" variant="ghost" onClick={() => void load(nextCursor)}>Load more profiles</Button> : null}

      {tab === "connections" ? connections.length
        ? <div className="grid gap-3 lg:grid-cols-2">{connections.map((item) => <ConnectionCard key={item.id} item={item} role={role} basePath={basePath} busy={busy} onRemove={() => mutate(() => api.removeConnection(identityId, item.id), "Connection removed.")} />)}</div>
        : <EmptyState>You do not have any connections yet.</EmptyState> : null}

      {tab === "invitations" ? <div className="grid gap-5 lg:grid-cols-2">
        <RequestSection title="Received" empty="No incoming invitations." items={incoming} render={(item) => <ConnectionCard key={item.id} item={item} role={role} basePath={basePath} busy={busy} onAccept={() => mutate(() => api.respondToConnection(identityId, item.id, "accept"), `You are now connected with ${item.profile.displayName}.`)} onDecline={() => mutate(() => api.respondToConnection(identityId, item.id, "decline"), "Invitation declined.")} />} />
        <RequestSection title="Sent" empty="No sent invitations." items={outgoing} render={(item) => <ConnectionCard key={item.id} item={item} role={role} basePath={basePath} busy={busy} onWithdraw={() => mutate(() => api.respondToConnection(identityId, item.id, "withdraw"), "Invitation withdrawn.")} />} />
      </div> : null}
    </div>
  );
}

function ProfileGrid({ profiles, role, basePath, busy, noteFor, note, setNote, setNoteFor, onConnect }: { profiles: SocialProfile[]; role: "sponsor" | "creator"; basePath: string; busy: boolean; noteFor: string | null; note: string; setNote: (value: string) => void; setNoteFor: (value: string | null) => void; onConnect: (profile: SocialProfile) => void }) {
  if (!profiles.length) return <EmptyState>No profiles match these filters.</EmptyState>;
  return <div className="grid gap-3 lg:grid-cols-2">{profiles.map((profile) => <article key={profile.id} className="rounded-[8px] border-2 border-ink/20 bg-surface p-4">
    <ProfileHeading profile={profile} />
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {profile.relationship === "none" ? <Button type="button" variant="secondary" disabled={busy} onClick={() => setNoteFor(noteFor === profile.id ? null : profile.id)}>Connect</Button> : null}
      {profile.relationship === "connected" ? <LinkButton to={`${basePath}/messages?with=${encodeURIComponent(profile.id)}`}>Message</LinkButton> : null}
      {profile.relationship === "connected" && role === "sponsor" && profile.profileType === "creator" ? <LinkButton to={`${basePath}/contracts/new?creatorProfileId=${profile.profileId}`} secondary>Draft contract</LinkButton> : null}
      {profile.relationship === "incoming" ? <span className="text-xs font-medium text-accent">Invitation received</span> : null}
      {profile.relationship === "outgoing" ? <span className="text-xs font-medium text-muted">Request pending</span> : null}
    </div>
    {noteFor === profile.id ? <div className="mt-3 border-t border-rule pt-3"><textarea className="min-h-20 w-full rounded-[6px] border-2 border-ink/25 bg-surface px-3 py-2 text-sm outline-none focus:border-accent" maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a personal note (optional)" /><div className="mt-2 flex items-center justify-between"><span className="text-xs text-muted">{note.length}/300</span><Button type="button" disabled={busy} onClick={() => onConnect(profile)}>Send invitation</Button></div></div> : null}
  </article>)}</div>;
}

function ConnectionCard({ item, role, basePath, busy, onAccept, onDecline, onWithdraw, onRemove }: { item: ConnectionRequest; role: "sponsor" | "creator"; basePath: string; busy: boolean; onAccept?: () => void; onDecline?: () => void; onWithdraw?: () => void; onRemove?: () => void }) {
  return <article className="rounded-[8px] border-2 border-ink/20 bg-surface p-4"><ProfileHeading profile={item.profile} />{item.note ? <p className="mt-3 rounded-[6px] bg-canvas p-3 text-sm text-muted">“{item.note}”</p> : null}<div className="mt-4 flex flex-wrap gap-2">{onAccept ? <Button type="button" disabled={busy} onClick={onAccept}>Accept</Button> : null}{onDecline ? <Button type="button" variant="ghost" disabled={busy} onClick={onDecline}>Decline</Button> : null}{onWithdraw ? <Button type="button" variant="secondary" disabled={busy} onClick={onWithdraw}>Withdraw</Button> : null}{onRemove ? <><LinkButton to={`${basePath}/messages?with=${encodeURIComponent(item.profile.id)}`}>Message</LinkButton>{role === "sponsor" && item.profile.profileType === "creator" ? <LinkButton to={`${basePath}/contracts/new?creatorProfileId=${item.profile.profileId}`} secondary>Draft contract</LinkButton> : null}<Button type="button" variant="ghost" disabled={busy} onClick={onRemove}>Remove</Button></> : null}</div></article>;
}

function ProfileHeading({ profile }: { profile: SocialProfile }) {
  return <div className="flex items-center gap-3"><Avatar profile={profile} /><div className="min-w-0"><div className="truncate font-semibold text-ink">{profile.displayName}</div><div className="truncate text-xs text-muted">{profile.handle} · <span className="capitalize">{profile.profileType}</span></div><div className="mt-0.5 truncate text-xs text-muted">{profile.descriptor}</div></div></div>;
}

function LinkButton({ to, secondary = false, children }: { to: string; secondary?: boolean; children: string }) {
  return <Link to={to} className={`inline-flex h-9 items-center rounded-[6px] px-3.5 text-sm font-medium ${secondary ? "border-2 border-ink/30 bg-surface text-ink" : "bg-accent text-white"}`}>{children}</Link>;
}

function RequestSection({ title, empty, items, render }: { title: string; empty: string; items: ConnectionRequest[]; render: (item: ConnectionRequest) => ReactNode }) {
  return <section><h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.04em] text-muted">{title} <span className="ml-1 rounded-full bg-accent-soft px-2 py-0.5 text-accent">{items.length}</span></h2><div className="space-y-3">{items.length ? items.map(render) : <p className="rounded-[8px] border-2 border-ink/15 bg-surface p-5 text-sm text-muted">{empty}</p>}</div></section>;
}
