import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import type { Session } from "../lib/session";
import { AccountSwitcher } from "./AccountSwitcher";
import { api } from "../lib/api";
import { connectProfileRealtime } from "../lib/realtime";
import type { RealtimeEvent } from "../lib/types";
import { Icon } from "./Icon";
import { MessagingDock } from "./MessagingDock";
import { ThemeToggle } from "./ThemeToggle";
import { BrandMark } from "./BrandMark";
import { WalletGateContext } from "../lib/walletGate";

export type NavItem = {
  to: string;
  label: string;
  requiresWallet?: boolean;
};

export function AppShell({
  nav,
  accountLabel,
  accountMeta,
  currentSession,
  walletConnected,
  children,
}: {
  nav: NavItem[];
  accountLabel: string;
  accountMeta?: string;
  currentSession: Session;
  walletConnected?: boolean;
  children: ReactNode;
}) {
  const identityId = `${currentSession.role}:${currentSession.id}`;
  const basePath = `/${currentSession.role}/${currentSession.id}`;
  const [badges, setBadges] = useState({ unread: 0, requests: 0 });
  const badgeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const badgeVersion = useRef(0);
  const refreshBadge = useCallback(() => {
    clearTimeout(badgeTimer.current);
    const version = ++badgeVersion.current;
    badgeTimer.current = setTimeout(() => {
      void api.messagingCounts(identityId).then((counts) => {
        if (badgeVersion.current === version) setBadges(counts);
      }).catch(() => undefined);
    }, 100);
  }, [identityId]);

  useEffect(() => {
    refreshBadge();
    const onChanged = () => refreshBadge();
    window.addEventListener("messaging:changed", onChanged);
    const realtime = connectProfileRealtime(identityId, (event: RealtimeEvent) => {
      if (event.type === "typing") return;
      refreshBadge();
      window.dispatchEvent(new CustomEvent("messaging:realtime", { detail: event }));
      if (event.type === "message.created" && document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
        const payload = event.payload as { sender?: { displayName?: string }; body?: string };
        new Notification(payload.sender?.displayName ?? "New message", { body: payload.body ?? "Sent an attachment" });
      }
    });
    return () => {
      clearTimeout(badgeTimer.current);
      badgeVersion.current++;
      window.removeEventListener("messaging:changed", onChanged);
      realtime.close();
    };
  }, [identityId, refreshBadge]);

  return (
    <div className="flex min-h-screen flex-col bg-canvas md:flex-row" onClickCapture={(event) => {
      // Keep real profile links usable in new tabs; normal clicks open quick chat.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a") : null;
      if (!anchor || anchor.target === "_blank") return;
      const url = new URL(anchor.href, window.location.origin);
      const recipientId = url.searchParams.get("with");
      if (url.origin !== window.location.origin || url.pathname !== `${basePath}/messages` || !recipientId) return;
      event.preventDefault();
      window.dispatchEvent(new CustomEvent("messaging:open", { detail: { identityId, recipientId } }));
    }}>
      <aside className="flex shrink-0 flex-col border-b border-rule bg-sidebar md:sticky md:top-0 md:h-screen md:w-52 md:border-r md:border-b-0 xl:w-60">
        <div className="flex h-20 items-center gap-3 px-6">
          <BrandMark size="sm" withName />
        </div>
        <p className="mb-3 hidden px-6 text-[10px] font-medium uppercase tracking-[0.16em] text-muted md:block">Workspace</p>
        <nav aria-label="Workspace" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:px-4">
          {nav.map((item) => item.requiresWallet && walletConnected === false ? <span key={item.to} aria-disabled="true" title="Connect a wallet to unlock contract creation" className="shrink-0 rounded-lg border border-transparent px-3 py-2.5 text-sm font-medium text-muted opacity-45"><span className="flex items-center gap-3"><Icon name="contracts" /><span className="flex-1">{item.label}</span><span aria-hidden="true">🔒</span></span></span> : (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                `shrink-0 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? "border-accent-rule bg-accent-soft text-link" : "border-transparent text-muted hover:bg-ink/5 hover:text-ink"
                }`
              }
            >
              <span className="flex items-center gap-3"><Icon name={item.to.endsWith("/network") ? "network" : item.to.endsWith("/messages") ? "messages" : item.to.endsWith("/contracts") ? "contracts" : item.to.endsWith("/earnings") ? "earnings" : item.to.endsWith("/wallets") ? "wallet" : "home"} /><span className="flex-1">{item.label}</span><NavBadge count={item.to.endsWith("/messages") ? badges.unread : item.to.endsWith("/network") ? badges.requests : 0} /></span>
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto hidden px-6 py-6 md:block"><div className="border-t border-rule pt-5 text-xs text-muted"><span className="mb-2 block text-ink">Built for good partnerships.</span>Connect. Collaborate. Get paid.</div></div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-20 items-center justify-between gap-4 border-b border-rule px-5 md:px-8 xl:px-10">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-ink">{accountLabel}</div>
            {accountMeta ? <div className="truncate font-mono text-[11px] text-muted">{accountMeta}</div> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3"><AccountSwitcher currentSession={currentSession} /><ThemeToggle /></div>
        </header>
        {walletConnected === false ? <div role="alert" className="border-b border-warning-rule bg-warning-soft px-5 py-3 text-warning md:px-8 xl:px-10"><div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-3"><div><span className="font-semibold text-ink">Contract actions are locked.</span> <span className="text-sm">Connect and verify a wallet before drafting or accepting contracts.</span></div><Link to="/accounts" className="rounded-lg bg-warning px-3 py-1.5 text-xs font-semibold text-canvas">Connect wallet</Link></div></div> : null}
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-5 pt-8 pb-24 md:px-8 xl:px-10"><WalletGateContext.Provider value={walletConnected}>{children}</WalletGateContext.Provider></main>
      </div>
      <MessagingDock key={identityId} identityId={identityId} basePath={basePath} unread={badges.unread} />
    </div>
  );
}

function NavBadge({ count }: { count: number }) {
  return count > 0 ? <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] leading-none text-link">{count > 99 ? "99+" : count}</span> : null;
}
