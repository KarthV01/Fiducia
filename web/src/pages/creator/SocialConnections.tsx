import { useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import type { SocialConnection, SocialProvider } from "../../lib/types";
import { useResource } from "../../lib/useResource";
import { Banner, Button, PageHeader } from "../../ui/primitives";
import { Icon } from "../../ui/Icon";

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
    <div className="mb-7 flex gap-3.5 rounded-xl border border-rule bg-surface p-4 text-sm shadow-card"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-link"><Icon name="shield" width="16" height="16" /></span><div><div className="font-medium text-ink">You stay in control.</div><p className="mt-0.5 text-muted">Fiducia stores encrypted OAuth tokens, never your password. Disconnecting stops new collection; existing financial evidence remains attached to its contract audit trail.</p></div></div>
    {actionError ? <div className="mb-5"><Banner>{actionError}</Banner></div> : null}
    {error ? <div className="mb-5"><Banner>{error}</Banner></div> : null}
    {loading ? <p className="text-sm text-muted">Loading platform connections...</p> : null}
    <div className="grid gap-4 sm:grid-cols-2">
      {providers.map((provider) => {
        const connections = data?.connections.filter((item) => item.provider === provider.id) ?? [];
        const active = connections.find((item) => item.status === "active");
        const latest = active ?? connections[0];
        return <section key={provider.id} className="flex flex-col rounded-xl border border-rule bg-surface p-5 shadow-card">
          <div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3.5"><span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-rule bg-canvas text-sm font-semibold text-ink">{provider.name[0]}</span><div><h2 className="font-semibold text-ink">{provider.name}</h2><p className="mt-0.5 text-sm text-muted">{provider.description}</p></div></div><Status status={latest?.status ?? "missing"} /></div>
          {latest ? <div className="mt-4 rounded-lg border border-rule bg-canvas p-3 text-xs text-muted"><div className="font-medium text-ink">{label(latest)}</div><div className="mt-1">{latest.capabilities.length ? latest.capabilities.join(" · ") : "No capabilities reported"}</div><div className="mt-1">{latest.lastSyncedAt ? `Last synced ${new Date(latest.lastSyncedAt).toLocaleString()}` : "Not synchronized yet"}</div></div> : null}
          <div className="mt-auto flex flex-wrap gap-2 pt-4">
            {!active || latest?.status === "reauthorization_required" ? <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void connect(provider.id)}>{busy === provider.id ? "Opening..." : latest ? "Reconnect" : "Connect"}</Button> : null}
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
  return <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${status === "active" ? "border-success-rule bg-success-soft text-success" : status === "reauthorization_required" ? "border-warning-rule bg-warning-soft text-warning" : "border-rule bg-canvas text-muted"}`}><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />{text}</span>;
}
