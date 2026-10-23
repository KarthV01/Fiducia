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
      <aside className="flex shrink-0 flex-col border-b border-rule bg-sidebar md:sticky md:top-0 md:h-screen md:w-56 md:border-r md:border-b-0 xl:w-60">
        <div className="flex h-14 items-center px-5 md:h-16">
          <BrandMark size="sm" withName />
        </div>
        <p className="mt-2 mb-1.5 hidden px-5 text-[11px] font-medium text-muted md:block">{currentSession.role === "sponsor" ? "Sponsor workspace" : "Creator workspace"}</p>
        <nav aria-label="Workspace" className="flex gap-0.5 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
          {nav.map((item) => item.requiresWallet && walletConnected === false ? <span key={item.to} aria-disabled="true" title="Connect a wallet to unlock contract creation" className="flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-muted opacity-50"><Icon name="contracts" width="16" height="16" /><span className="flex-1">{item.label}</span><Icon name="lock" width="14" height="14" /></span> : (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                `group flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors ${
                  isActive ? "bg-ink/[0.06] text-ink" : "text-muted hover:bg-ink/[0.04] hover:text-ink"
                }`
              }
            >
              {({ isActive }) => <>
                <Icon name={navIcon(item.to)} width="16" height="16" className={isActive ? "text-link" : "text-muted group-hover:text-ink"} />
                <span className="flex-1 whitespace-nowrap">{item.label}</span>
                <NavBadge count={item.to.endsWith("/messages") ? badges.unread : item.to.endsWith("/network") ? badges.requests : 0} />
              </>}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto hidden p-3 md:block">
          <div className="rounded-lg border border-rule bg-surface px-3 py-3 shadow-card">
            <div className="flex items-center gap-2 text-xs font-medium text-ink"><Icon name="shield" width="14" height="14" className="text-link" /> Escrow-backed payouts</div>
            <p className="mt-1 text-xs leading-relaxed text-muted">Contract funds are held in on-chain escrow until contract terms are met.</p>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-end sm:justify-between gap-4 border-b border-rule bg-canvas/85 px-5 backdrop-blur-md md:h-16 md:px-8 xl:px-10">
          <div className="hidden min-w-0 items-center gap-3 sm:flex">
            <span aria-hidden="true" className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rule bg-surface text-xs font-semibold text-ink sm:flex">{initials(accountLabel)}</span>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold text-ink">{accountLabel}</div>
              {accountMeta ? <div className="truncate text-xs text-muted">{accountMeta}</div> : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2"><AccountSwitcher currentSession={currentSession} /><ThemeToggle /></div>
        </header>
        {walletConnected === false ? <div role="alert" className="border-b border-warning-rule bg-warning-soft px-5 py-2.5 md:px-8 xl:px-10"><div className="mx-auto flex w-full max-w-[1320px] flex-wrap items-center justify-between gap-3 text-sm"><div className="flex items-center gap-2.5 text-warning"><Icon name="lock" width="15" height="15" /><span><span className="font-medium text-ink">Contract actions are locked.</span> <span className="text-muted">Connect and verify a wallet before drafting or accepting contracts.</span></span></div><Link to="/accounts" className="inline-flex h-8 items-center rounded-md border border-warning-rule bg-surface px-3 text-xs font-medium text-ink shadow-card hover:bg-canvas">Connect wallet</Link></div></div> : null}
        <main className="mx-auto w-full max-w-[1320px] flex-1 px-5 pt-8 pb-24 md:px-8 md:pt-10 xl:px-10"><WalletGateContext.Provider value={walletConnected}>{children}</WalletGateContext.Provider></main>
      </div>
      <MessagingDock key={identityId} identityId={identityId} basePath={basePath} unread={badges.unread} />
    </div>
  );
}

function NavBadge({ count }: { count: number }) {
  return count > 0 ? <span className="min-w-5 rounded-full bg-accent px-1.5 py-0.5 text-center text-[10px] leading-none font-semibold text-white tabular-nums">{count > 99 ? "99+" : count}</span> : null;
}

function navIcon(to: string) {
  if (to.endsWith("/network")) return "network";
  if (to.endsWith("/messages")) return "messages";
  if (to.endsWith("/contracts") || to.endsWith("/contracts/new")) return to.endsWith("/new") ? "plus" : "contracts";
  if (to.endsWith("/earnings")) return "earnings";
  if (to.endsWith("/wallets")) return "wallet";
  if (to.endsWith("/platforms")) return "platforms";
  return "home";
}

function initials(label: string) {
  return label.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "F";
}
