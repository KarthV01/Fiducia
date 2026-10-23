import { Navigate } from "react-router-dom";
import { api } from "../lib/api";
import { useResource } from "../lib/useResource";
import { PublicLayout } from "../ui/PublicLayout";
import { Banner, ButtonLink } from "../ui/primitives";
import { Icon } from "../ui/Icon";

const features = [
  { icon: "network" as const, title: "A network of partners", body: "Discover sponsor and creator profiles, and connect before the first conversation starts." },
  { icon: "messages" as const, title: "Messaging built into the work", body: "Share briefs and files in threads that stay one click away from every contract." },
  { icon: "contracts" as const, title: "Contracts with clear deliverables", body: "Define per-platform deliverables, review checkpoints, deadlines and payout caps in one agreement." },
  { icon: "shield" as const, title: "Escrow-backed payouts", body: "Budgets are held in USDC escrow on-chain and released as contract terms are met." },
  { icon: "platforms" as const, title: "Platform-verified results", body: "Connect YouTube, Instagram, TikTok and X so performance comes from the source, not screenshots." },
  { icon: "earnings" as const, title: "One view of every payment", body: "Track escrowed, pending and released amounts across all partnerships at a glance." },
];

const steps = [
  { title: "Connect", body: "Find the right partner and start a conversation." },
  { title: "Agree", body: "Draft terms, deliverables and a payout cap together." },
  { title: "Fund", body: "The sponsor funds escrow before work begins." },
  { title: "Deliver & release", body: "Approved, measured work releases payment." },
];

export function EntryPage() {
  const { data, error } = useResource("landing-auth", () => api.me());
  // Google returns here after sign-in; members go straight to their accounts.
  if (data?.user) return <Navigate to="/accounts" replace />;
  return <PublicLayout>
    {error ? <div className="mx-auto mt-4 max-w-6xl px-5"><Banner>We couldn't check your session. Please try signing in again.</Banner></div> : null}
    <section className="relative isolate overflow-hidden border-b border-rule">
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--color-rule)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-rule)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)] bg-[size:56px_56px] opacity-60" />
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 pt-16 pb-20 sm:px-8 sm:pt-24 sm:pb-28 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
        <div>
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-rule bg-surface px-3 py-1 text-xs font-medium text-muted shadow-card"><span className="h-1.5 w-1.5 rounded-full bg-success" /> For brands and the creators they work with</p>
          <h1 className="max-w-xl text-[clamp(2.4rem,4.6vw,3.6rem)] leading-[1.05] font-semibold tracking-[-0.04em]">Creator partnerships, agreed and paid with confidence.</h1>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-muted sm:text-[17px]">Fiducia brings sourcing, messaging, contracts and escrow-backed payouts into one workspace, so both sides always know what's agreed, what's delivered and what's owed.</p>
          <div className="mt-8 flex flex-wrap items-center gap-3"><ButtonLink className="h-11 px-5 text-[15px]" to="/login">Get started <Icon name="arrow" width="16" height="16" /></ButtonLink><a href="#how-it-works" className="inline-flex h-11 items-center rounded-lg border border-rule bg-surface px-5 text-[15px] font-medium text-ink shadow-card transition-colors hover:bg-canvas">See how it works</a></div>
          <p className="mt-5 text-[13px] text-muted">Sign in with Google or a wallet. Run sponsor and creator profiles from one login.</p>
        </div>
        <ContractPreview />
      </div>
    </section>
    <section className="border-b border-rule bg-surface">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="max-w-2xl"><p className="text-[13px] font-semibold text-link">Platform</p><h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">Everything a partnership needs, nothing it doesn't.</h2><p className="mt-4 text-base leading-relaxed text-muted">Replace the spreadsheet, the inbox thread and the invoice chase with one shared record of the work.</p></div>
        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-3">{features.map((item) => <article key={item.title} className="bg-surface p-7">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-rule bg-canvas text-link"><Icon name={item.icon} width="17" height="17" /></span>
          <h3 className="mt-5 text-[15px] font-semibold tracking-[-0.01em]">{item.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
        </article>)}</div>
      </div>
    </section>
    <section id="how-it-works" className="scroll-mt-16 border-b border-rule">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="max-w-2xl"><p className="text-[13px] font-semibold text-link">How it works</p><h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">From introduction to payout in four steps.</h2></div>
        <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">{steps.map((step, index) => <li key={step.title} className="relative">
          <div className="flex items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rule bg-surface font-mono text-xs font-medium text-ink shadow-card">{index + 1}</span>{index < steps.length - 1 ? <span aria-hidden="true" className="hidden h-px flex-1 bg-rule lg:block" /> : null}</div>
          <h3 className="mt-5 text-[15px] font-semibold">{step.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.body}</p>
        </li>)}</ol>
      </div>
    </section>
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-rule bg-surface px-8 py-10 shadow-card sm:px-12">
        <div><h2 className="text-2xl font-semibold tracking-[-0.03em]">Start your next partnership on solid terms.</h2><p className="mt-2 text-sm text-muted">Create a sponsor or creator profile in minutes.</p></div>
        <ButtonLink className="h-11 px-5 text-[15px]" to="/login">Get started <Icon name="arrow" width="16" height="16" /></ButtonLink>
      </div>
    </section>
  </PublicLayout>;
}

function ContractPreview() {
  const deliverables = [
    { platform: "YouTube", label: "Dedicated video", state: "Released", tone: "text-success bg-success-soft border-success-rule" },
    { platform: "Instagram", label: "Reel + story set", state: "In review", tone: "text-warning bg-warning-soft border-warning-rule" },
    { platform: "TikTok", label: "Short-form cut", state: "Scheduled", tone: "text-muted bg-canvas border-rule" },
  ];
  return <figure className="relative mx-auto w-full max-w-lg" aria-label="Illustrative contract preview">
    <div className="overflow-hidden rounded-2xl border border-rule bg-surface shadow-floating">
      <div className="flex items-center justify-between gap-3 border-b border-rule px-5 py-3.5">
        <div className="flex items-center gap-2 text-[13px] font-medium"><Icon name="contracts" width="15" height="15" className="text-muted" /> Spring trail series</div>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-success-rule bg-success-soft px-2 py-0.5 text-xs font-medium text-success"><span className="h-1.5 w-1.5 rounded-full bg-current" />Active</span>
      </div>
      <div className="p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2"><span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-surface bg-ink text-[11px] font-semibold text-canvas">NO</span><span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-surface bg-accent-soft text-[11px] font-semibold text-link">MC</span></div>
          <div className="min-w-0 text-[13px] leading-tight"><div className="font-medium">Northwind Outdoors × Maya Chen</div><div className="text-muted">Due Jun 30 · 3 deliverables</div></div>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-rule bg-rule text-[12px]">
          {[["Escrowed", "$12,000"], ["Released", "$4,800"], ["Pending", "$3,600"]].map(([label, value]) => <div key={label} className="bg-surface px-3.5 py-3"><div className="text-muted">{label}</div><div className="mt-1 text-[17px] font-semibold tracking-[-0.02em] tabular-nums">{value}</div></div>)}
        </div>
        <div className="mt-4"><div className="flex justify-between text-[12px] text-muted"><span>Payout progress</span><span className="tabular-nums">40%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-rule"><div className="h-full w-[40%] rounded-full bg-accent" /></div></div>
        <ul className="mt-6 divide-y divide-rule rounded-xl border border-rule">
          {deliverables.map((item) => <li key={item.platform} className="flex items-center justify-between gap-3 px-4 py-3 text-[13px]"><div className="min-w-0"><span className="font-medium">{item.platform}</span><span className="text-muted"> · {item.label}</span></div><span className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium ${item.tone}`}>{item.state}</span></li>)}
        </ul>
      </div>
    </div>
    <figcaption className="mt-3 text-right text-[11px] text-muted">Illustrative preview · not live account data</figcaption>
  </figure>;
}
