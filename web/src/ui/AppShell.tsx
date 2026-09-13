import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import type { Session } from "../lib/session";
import { AccountSwitcher } from "./AccountSwitcher";
import { api } from "../lib/api";
import { connectProfileRealtime } from "../lib/realtime";
import type { RealtimeEvent } from "../lib/types";

export type NavItem = {
  to: string;
  label: string;
};

export function AppShell({
  nav,
  accountLabel,
  accountMeta,
  currentSession,
  children,
}: {
  nav: NavItem[];
  accountLabel: string;
  accountMeta?: string;
  currentSession: Session;
  children: ReactNode;
}) {
  const identityId = `${currentSession.role}:${currentSession.id}`;
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
    <div className="flex min-h-screen bg-canvas">
      <aside className="flex w-56 shrink-0 flex-col border-r-2 border-ink/20 bg-surface">
        <div className="flex h-14 items-center px-5">
          <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink">Payouts</span>
        </div>
        <nav className="flex flex-col gap-0.5 px-3 py-2">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                `rounded-[6px] border-2 px-2.5 py-1.5 text-sm font-medium transition-colors ${
                  isActive ? "border-accent bg-accent text-white" : "border-transparent text-muted hover:border-ink/20 hover:bg-accent-soft"
                }`
              }
            >
              <span className="flex items-center justify-between gap-2"><span>{item.label}</span><NavBadge count={item.to.endsWith("/messages") ? badges.unread : item.to.endsWith("/network") ? badges.requests : 0} /></span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b-2 border-ink/20 bg-surface px-8">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-ink">{accountLabel}</div>
            {accountMeta ? <div className="truncate font-mono text-[11px] text-muted">{accountMeta}</div> : null}
          </div>
          <AccountSwitcher currentSession={currentSession} />
        </header>
        <main className="flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}

function NavBadge({ count }: { count: number }) {
  return count > 0 ? <span className="rounded-full bg-[#c0392b] px-1.5 py-0.5 text-[10px] leading-none text-white">{count > 99 ? "99+" : count}</span> : null;
}
