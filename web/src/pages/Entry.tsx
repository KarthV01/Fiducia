import { Navigate } from "react-router-dom";
import { api } from "../lib/api";
import { useResource } from "../lib/useResource";
import { PublicLayout } from "../ui/PublicLayout";
import { Banner, ButtonLink } from "../ui/primitives";
import { Icon } from "../ui/Icon";

export function EntryPage() {
  const { data, error } = useResource("landing-auth", () => api.me());
  // Google returns here after sign-in; members go straight to their accounts.
  if (data?.user) return <Navigate to="/accounts" replace />;
  return <PublicLayout>
    {error ? <div className="mx-auto mt-4 max-w-6xl px-5"><Banner>We couldn't check your session. Please try signing in again.</Banner></div> : null}
    <section className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
      <div>
        <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-rule bg-surface px-3 py-1.5 text-[11px] font-medium text-muted"><span className="h-1.5 w-1.5 rounded-full bg-link" /> For creators. For brands. For what’s next.</p>
        <h1 className="max-w-xl text-[clamp(2.6rem,5vw,4.2rem)] leading-[1.07] font-semibold tracking-[-0.055em]">Great partnerships.<br /><span className="text-link">Less back-and-forth.</span></h1>
        <p className="mt-6 max-w-md text-base leading-relaxed text-muted">Meet your next collaborator. Keep the conversation, the contract, and the next step together—in one focused workspace.</p>
        <div className="mt-8 flex flex-wrap items-center gap-4"><ButtonLink className="h-11 px-5" to="/login">Get started <span aria-hidden="true" className="ml-3">↗</span></ButtonLink><a href="#how-it-works" className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">See how it works</a></div>
        <p className="mt-4 text-xs text-muted">One Google sign-in. Your sponsor and creator accounts.</p>
      </div>
      <WorkspacePreview />
    </section>
    <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-6 px-5 pb-16 sm:px-8 sm:pb-24">
      <div className="mb-8 border-t border-rule pt-10"><p className="text-[10px] font-medium tracking-[0.16em] text-link uppercase">From introduction to collaboration</p><h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em]">More room for the work that matters.</h2></div>
      <div className="grid gap-4 md:grid-cols-3">{[
        { icon: "network" as const, title: "Find your people", body: "Discover sponsor and creator profiles. Make a connection before starting a conversation." },
        { icon: "messages" as const, title: "Keep the conversation close", body: "Share ideas and files without losing your place. A small chat window follows you around your workspace." },
        { icon: "contracts" as const, title: "Make the next step clear", body: "Bring terms, deliverables, and payment progress into one shared collaboration." },
      ].map((item, index) => <article key={item.title} className="rounded-xl border border-rule bg-surface p-6"><div className="mb-6 flex items-center justify-between"><span className="text-link"><Icon name={item.icon} width="22" height="22" /></span><span className="font-mono text-[10px] text-muted">0{index + 1}</span></div><h3 className="text-base font-medium tracking-tight">{item.title}</h3><p className="mt-3 text-sm leading-relaxed text-muted">{item.body}</p></article>)}</div>
    </section>
  </PublicLayout>;
}

function WorkspacePreview() {
  return <figure className="relative isolate mx-auto w-full max-w-lg" aria-label="Illustrative collaboration workspace preview">
    <div aria-hidden="true" className="absolute -inset-8 -z-10 rounded-full bg-accent/15 blur-3xl" />
    <div className="overflow-hidden rounded-2xl border border-rule bg-surface shadow-[0_24px_80px_#0002]">
      <div className="flex items-center justify-between border-b border-rule px-5 py-4"><span className="text-xs font-medium">Your next collaboration</span><span className="rounded-full bg-accent-soft px-2 py-1 text-[10px] text-link">Workspace preview</span></div>
      <div className="p-5 sm:p-7">
        <div className="mb-6 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-rule bg-canvas text-xs font-semibold">ST</span><span className="text-muted">×</span><span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-link">CR</span><span className="ml-auto text-xs text-muted">A shared idea.</span></div>
        <p className="text-[10px] tracking-[0.13em] text-muted uppercase">Studio × Creator</p><h2 className="mt-2 text-xl font-medium tracking-tight">Something worth creating.</h2>
        <div className="mt-6 grid grid-cols-3 gap-2 text-[10px] text-muted">{["01 Connect", "02 Agree", "03 Create"].map((step, index) => <div key={step}><div className={`mb-2 h-1 rounded-full ${index < 2 ? "bg-link" : "bg-rule"}`} />{step}</div>)}</div>
        <div className="mt-7 rounded-xl border border-rule bg-canvas/60 p-4"><div className="mb-3 flex items-center gap-2 text-xs font-medium"><Icon name="messages" width="14" height="14" /> A conversation, not another tab.</div><p className="max-w-[90%] rounded-lg bg-surface p-3 text-xs leading-relaxed text-muted">I have an idea for our next collaboration.</p><p className="mt-2 ml-6 rounded-lg bg-accent-soft p-3 text-xs leading-relaxed text-link">Let’s make it happen.</p></div>
      </div>
    </div>
    <figcaption className="mt-3 text-right text-[10px] text-muted">Illustrative preview · not live account data</figcaption>
  </figure>;
}
