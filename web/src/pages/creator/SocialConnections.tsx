import { useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import type { SocialConnection, SocialProvider } from "../../lib/types";
import { useResource } from "../../lib/useResource";
import { Banner, Button, PageHeader } from "../../ui/primitives";

const providers: Array<{ id: SocialProvider; name: string; description: string }> = [
  { id: "instagram", name: "Instagram", description: "Professional-account media, insights, and publishing." },
  { id: "x", name: "X", description: "Owned Posts, publishing, and entitlement-supported engagement." },
  { id: "tiktok", name: "TikTok", description: "Creator profile, public videos, Direct Post, and video engagement." },
  { id: "youtube", name: "YouTube", description: "Channel publishing, public statistics, and owner Analytics." },
];

export function CreatorSocialConnectionsPage() {
  const { creatorId = "" } = useParams();
  const { data, error, loading, reload } = useResource(`creator-platforms-${creatorId}`, () => api.socialConnections(creatorId));
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function connect(provider: SocialProvider) {
    setBusy(provider); setActionError(null);
    try {
      const result = await api.startSocialConnection(creatorId, provider, `/creator/${creatorId}/platforms`);
      window.location.assign(result.authorizationUrl);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `Could not connect ${provider}.`);
      setBusy(null);
    }
  }

  async function refresh(connection: SocialConnection) {
    setBusy(connection.id); setActionError(null);
    try { await api.refreshSocialConnection(creatorId, connection.id); reload(); }
    catch (err) { setActionError(err instanceof Error ? err.message : "Could not refresh this connection."); }
    finally { setBusy(null); }
  }

  async function disconnect(connection: SocialConnection) {
    if (!window.confirm(`Disconnect ${label(connection)}? Fiducia will stop collecting new measurements from this account.`)) return;
    setBusy(connection.id); setActionError(null);
    try { await api.disconnectSocialConnection(creatorId, connection.id); reload(); }
    catch (err) { setActionError(err instanceof Error ? err.message : "Could not disconnect this account."); }
    finally { setBusy(null); }
  }

  return <div className="max-w-5xl">
    <PageHeader title="Creator platforms" description="Authorize the accounts Fiducia may publish to and use as trusted contract evidence." />
    <div className="mb-7 rounded-xl border border-accent-rule bg-accent-soft p-4 text-sm"><div className="font-medium text-ink">You stay in control.</div><p className="mt-1 text-muted">Fiducia stores encrypted OAuth tokens, never your password. Disconnecting stops new collection; existing financial evidence remains attached to its contract audit trail.</p></div>
    {actionError ? <div className="mb-5"><Banner>{actionError}</Banner></div> : null}
    {error ? <div className="mb-5"><Banner>{error}</Banner></div> : null}
    {loading ? <p className="text-sm text-muted">Loading platform connections...</p> : null}
    <div className="grid gap-4 sm:grid-cols-2">
      {providers.map((provider) => {
        const connections = data?.connections.filter((item) => item.provider === provider.id) ?? [];
        const active = connections.find((item) => item.status === "active");
        const latest = active ?? connections[0];
        return <section key={provider.id} className="rounded-xl border border-rule bg-surface p-5">
          <div className="flex items-start justify-between gap-4"><div><h2 className="font-medium text-ink">{provider.name}</h2><p className="mt-1 text-sm text-muted">{provider.description}</p></div><Status status={latest?.status ?? "missing"} /></div>
          {latest ? <div className="mt-4 rounded-lg bg-canvas p-3 text-xs text-muted"><div className="font-medium text-ink">{label(latest)}</div><div className="mt-1">{latest.capabilities.length ? latest.capabilities.join(" · ") : "No capabilities reported"}</div><div className="mt-1">{latest.lastSyncedAt ? `Last synced ${new Date(latest.lastSyncedAt).toLocaleString()}` : "Not synchronized yet"}</div></div> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {!active || latest?.status === "reauthorization_required" ? <Button disabled={Boolean(busy)} onClick={() => void connect(provider.id)}>{busy === provider.id ? "Opening..." : latest ? "Reconnect" : "Connect"}</Button> : null}
            {active ? <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void refresh(active)}>{busy === active.id ? "Refreshing..." : "Refresh access"}</Button> : null}
            {active ? <Button variant="ghost" disabled={Boolean(busy)} onClick={() => void disconnect(active)}>Disconnect</Button> : null}
          </div>
        </section>;
      })}
    </div>
  </div>;
}

function label(connection: SocialConnection) { return connection.displayName || (connection.username ? `@${connection.username.replace(/^@/, "")}` : connection.providerAccountId); }
function Status({ status }: { status: SocialConnection["status"] | "missing" }) {
  const text = status === "active" ? "Connected" : status === "reauthorization_required" ? "Reconnect" : status === "revoked" ? "Disconnected" : status === "missing" ? "Not connected" : status;
  return <span className="shrink-0 rounded-full border border-rule bg-canvas px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted">{text}</span>;
}
