import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { MessagingPage } from "../pages/Messaging";
import { Icon } from "./Icon";

/** Kept in the workspace shell so navigation doesn't discard a conversation. */
export function MessagingDock({ identityId, basePath, unread }: { identityId: string; basePath: string; unread: number }) {
  const location = useLocation();
  const [opened, setOpened] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [recipient, setRecipient] = useState<{ id: string; requestId: number }>();
  const launcher = useRef<HTMLButtonElement>(null);
  const onInboxPage = location.pathname === `${basePath}/messages`;
  const active = opened && !onInboxPage;

  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<{ identityId: string; recipientId: string }>).detail;
      if (detail.identityId !== identityId) return;
      setRecipient((current) => ({ id: detail.recipientId, requestId: (current?.requestId ?? 0) + 1 }));
      setMounted(true);
      setOpened(true);
    };
    window.addEventListener("messaging:open", open);
    return () => window.removeEventListener("messaging:open", open);
  }, [identityId]);

  function minimize() { setOpened(false); launcher.current?.focus(); }

  return <aside aria-label="Quick messaging" hidden={onInboxPage} className="fixed right-3 bottom-0 z-40 w-[min(380px,calc(100vw-1.5rem))] overflow-hidden rounded-t-xl border border-rule bg-surface shadow-floating sm:right-6" onKeyDown={(event) => { if (event.key === "Escape" && !event.defaultPrevented) { event.stopPropagation(); minimize(); } }}>
    <header className="flex h-12 items-center gap-1 px-3">
      <button ref={launcher} type="button" aria-expanded={active} aria-controls="quick-messaging-body" className="flex h-full min-w-0 flex-1 items-center gap-2.5 text-left text-sm font-semibold" onClick={() => { setMounted(true); setOpened(!opened); }}>
        <Icon name="messages" className="text-link" />Messaging
        {unread > 0 ? <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] text-link" aria-label={`${unread} unread messages`}>{unread > 99 ? "99+" : unread}</span> : null}
      </button>
      <Link to={`${basePath}/messages${conversationId ? `?conversation=${encodeURIComponent(conversationId)}` : ""}`} title="Open full inbox" aria-label="Open full inbox" className="rounded-md p-2 text-muted hover:bg-accent-soft hover:text-ink" onClick={() => setOpened(false)}><Icon name="expand" width="15" height="15" /></Link>
      <button type="button" onClick={() => { setMounted(true); setOpened(!opened); }} title={active ? "Minimize messaging" : "Open messaging"} aria-label={active ? "Minimize messaging" : "Open messaging"} className="rounded-md p-2 text-muted hover:bg-accent-soft hover:text-ink"><Icon name="chevron" width="16" height="16" className={active ? "" : "rotate-180"} /></button>
    </header>
    <div id="quick-messaging-body" hidden={!active}>
      {mounted ? <MessagingPage compact active={active} recipient={recipient} onSelect={setConversationId} /> : null}
    </div>
  </aside>;
}
