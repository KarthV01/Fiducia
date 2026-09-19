import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { AgreementContent, SocialConnection, SocialContent, SocialProvider } from "../lib/types";
import { Banner, Button, Select } from "./primitives";

export function CreatorSocialDeliverables({ creatorId, agreementId, contents, connections, evidence, onChanged }: { creatorId: string; agreementId: string; contents: AgreementContent[]; connections: SocialConnection[]; evidence: AgreementContent[]; onChanged: () => void }) {
  const [available, setAvailable] = useState<Record<string, SocialContent[]>>({});
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(connection: SocialConnection) {
    setBusy(connection.id); setError(null);
    try { const result = await api.socialContent(creatorId, connection.id); setAvailable((current) => ({ ...current, [connection.id]: result.items })); }
    catch (next) { setError(next instanceof Error ? next.message : "Could not load owned posts."); }
    finally { setBusy(null); }
  }

  async function attach(template: AgreementContent, contentId: string) {
    setBusy(template.id); setError(null);
    try { await api.attachSocialPublication(creatorId, agreementId, contentId); onChanged(); }
    catch (next) { setError(next instanceof Error ? next.message : "Could not attach this post."); }
    finally { setBusy(null); }
  }

  return <section className="mt-6 rounded-xl border border-rule bg-surface p-5"><h2 className="text-base font-medium text-ink">Platform publications</h2><p className="mt-1 text-sm text-muted">Publish each sponsor-approved post, then select it from the connected creator account. Fiducia verifies ownership and collects contract measurements.</p>{error ? <div className="mt-4"><Banner>{error}</Banner></div> : null}<div className="mt-4 grid gap-4">{contents.map((template) => {
    const connection = connections.find((item) => item.provider === template.provider && item.status === "active");
    const observed = evidence.find((item) => item.id === template.id) ?? template;
    const items = connection ? available[connection.id] ?? [] : [];
    const content = observed.socialContent;
    return <article key={template.id} className="rounded-lg border border-rule bg-canvas p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-medium text-ink">{providerLabel(template.provider)}</div><div className="mt-1 text-xs text-muted">{content ? `Monitoring ${content.canonicalUrl ?? content.providerContentId}` : "Awaiting an owned published post"}</div></div><span className="rounded-full border border-rule px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted">{template.status.replaceAll("_", " ")}</span></div>
      {content ? <Evidence content={observed} /> : !connection ? <div className="mt-4 text-sm"><Link className="font-medium text-link hover:underline" to={`/creator/${creatorId}/platforms`}>Connect {providerLabel(template.provider)}</Link><span className="text-muted"> before attaching a post.</span></div> : <div className="mt-4 space-y-3"><Button variant="secondary" disabled={Boolean(busy)} onClick={() => void load(connection)}>{busy === connection.id ? "Loading..." : `Load owned ${providerLabel(template.provider)} posts`}</Button>{items.length ? <div className="flex flex-col gap-2 sm:flex-row"><Select value={selected[template.id] ?? ""} onChange={(event) => setSelected((current) => ({ ...current, [template.id]: event.target.value }))}><option value="">Choose a published post</option>{items.map((item) => <option key={item.id} value={item.id}>{item.title || item.description?.slice(0, 80) || item.providerContentId}</option>)}</Select><Button disabled={!selected[template.id] || Boolean(busy)} onClick={() => void attach(template, selected[template.id])}>{busy === template.id ? "Attaching..." : "Use this post"}</Button></div> : null}</div>}
    </article>;
  })}</div></section>;
}

export function SocialEvidence({ contents }: { contents: AgreementContent[] }) {
  if (!contents.length) return null;
  return <section className="mt-6 rounded-xl border border-rule bg-surface p-5"><h2 className="text-base font-medium text-ink">Platform evidence</h2><div className="mt-4 grid gap-4">{contents.map((content) => <article key={content.id} className="rounded-lg border border-rule bg-canvas p-4"><div className="font-medium text-ink">{providerLabel(content.provider)}</div><div className="mt-1 text-xs text-muted">{content.socialContent?.canonicalUrl ?? "Publication not attached"}</div><Evidence content={content} /></article>)}</div></section>;
}

function Evidence({ content }: { content: AgreementContent }) {
  const observations = content.observations ?? [];
  return observations.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{observations.slice(0, 8).map((item) => <div key={item.id} className="rounded-md border border-rule bg-surface px-3 py-2 text-xs"><div className="font-medium text-ink">{item.metric.key}</div><div className="mt-1 text-muted">{Number(item.value).toLocaleString()} · {new Date(item.observedAt).toLocaleString()}</div></div>)}</div> : <p className="mt-3 text-xs text-muted">No provider observations recorded yet.</p>;
}

function providerLabel(provider: SocialProvider) { return provider === "x" ? "X" : provider[0].toUpperCase() + provider.slice(1); }
