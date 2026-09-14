import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type DragEvent } from "react";
import { useSearchParams, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { ProfileAvatar as Avatar } from "../ui/ProfileAvatar";
import { useProfileRealtime } from "../lib/useProfileRealtime";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import type { ChatMessage, ConnectionRequest, ConversationSummary } from "../lib/types";
import { Banner, Button, EmptyState, Input, Select } from "../ui/primitives";
import { Icon } from "../ui/Icon";

const ATTACHMENT_ACCEPT = ".csv,.xls,.xlsx,.doc,.docx,.ppt,.pptx,.pdf,.txt,.gif,.jpg,.jpeg,.png,.bmp,.mp4,.mov";
const ATTACHMENT_EXTENSIONS = new Set(ATTACHMENT_ACCEPT.split(","));

function subscribeVisibility(notify: () => void) {
  document.addEventListener("visibilitychange", notify);
  return () => document.removeEventListener("visibilitychange", notify);
}
const getVisibility = () => !document.hidden;

export function MessagingPage({ compact = false, active = true, recipient, onSelect }: {
  compact?: boolean;
  active?: boolean;
  recipient?: { id: string; requestId: number };
  onSelect?: (id: string | null) => void;
}) {
  const { sponsorId, creatorId } = useParams();
  const role = sponsorId ? "sponsor" : "creator";
  const profileId = sponsorId ?? creatorId ?? "";
  const identityId = `${role}:${profileId}`;
  const [searchParams, setSearchParams] = useSearchParams();
  const documentVisible = useSyncExternalStore(subscribeVisibility, getVisibility, () => true);
  const visible = active && documentVisible;
  const requestedConversation = compact ? null : searchParams.get("conversation");
  const requestedRecipient = compact ? null : searchParams.get("with");
  const [bucket, setBucket] = useState("inbox");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query);
  const [inboxCursor, setInboxCursor] = useState<string | null>(null);
  const sidebarRequest = useRef(0);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [requests, setRequests] = useState<ConnectionRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [typing, setTyping] = useState<string[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [groupMode, setGroupMode] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [connections, setConnections] = useState<ConnectionRequest[]>([]);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const typingTimer = useRef<number | null>(null);
  const messageList = useRef<HTMLDivElement>(null);
  const selection = useRef<string | null>(null);
  const conversationRequest = useRef(0);
  const loadedConversation = useRef<string | null>(null);

  const selectConversation = useCallback((id: string | null) => {
    if (selection.current === id) return;
    selection.current = id;
    loadedConversation.current = null;
    conversationRequest.current++;
    setSelectedId(id);
    setSelected(null);
    setMessages([]);
    setBody("");
    setFiles([]);
    setReplyTo(null);
    setTyping([]);
    setError(null);
  }, []);

  const loadSidebar = useCallback(async (cursor?: string) => {
    if (!visible) return;
    const requestId = ++sidebarRequest.current;
    try {
      if (bucket === "requests") {
        const result = await api.connections(identityId, "incoming");
        if (requestId === sidebarRequest.current) setRequests(result.items);
      } else {
        const result = await api.conversations(identityId, { bucket: bucket === "inbox" ? undefined : bucket, q: debouncedQuery, cursor });
        if (requestId !== sidebarRequest.current) return;
        setConversations((current) => cursor ? [...current, ...result.items.filter((item) => !current.some((old) => old.id === item.id))] : result.items);
        setInboxCursor(result.nextCursor);
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load messages"); }
  }, [bucket, identityId, debouncedQuery, visible]);

  const loadConversation = useCallback(async (conversationId: string, refresh = false) => {
    if (!visible) return;
    const requestId = ++conversationRequest.current;
    try {
      const [conversation, result] = await Promise.all([api.conversation(identityId, conversationId), api.messages(identityId, conversationId)]);
      if (requestId !== conversationRequest.current) return;
      setSelected(conversation);
      setMessages(result.items);
      if (!refresh || loadedConversation.current !== conversationId) setBody(conversation.draftText ?? "");
      loadedConversation.current = conversationId;
      const lastMessage = result.items.at(-1);
      const lastReadAt = conversation.participants.find((member) => member.id === identityId)?.lastReadAt;
      if (lastMessage && (!lastReadAt || lastReadAt < lastMessage.createdAt)) {
        await api.updateConversationState(identityId, conversationId, { read: true, readThrough: lastMessage.createdAt });
        window.dispatchEvent(new CustomEvent("messaging:changed"));
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Could not open conversation"); }
  }, [identityId, visible]);

  useEffect(() => { void loadSidebar(); }, [loadSidebar]);
  useEffect(() => {
    if (selectedId) void loadConversation(selectedId, true);
    return () => { conversationRequest.current++; };
  }, [loadConversation, selectedId]);
  useEffect(() => { onSelect?.(selectedId); }, [onSelect, selectedId]);
  useEffect(() => {
    if (visible && messageList.current) messageList.current.scrollTop = messageList.current.scrollHeight;
  }, [messages.length, selectedId, visible]);
  useEffect(() => {
    if (!compact || !recipient) return;
    let cancelled = false;
    void api.createDirectConversation(identityId, recipient.id).then((conversation) => {
      if (!cancelled) selectConversation(conversation.id);
    }).catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not start conversation"); });
    return () => { cancelled = true; };
  }, [compact, recipient, identityId, selectConversation]);
  useEffect(() => {
    if (compact) return;
    const conversationId = requestedConversation;
    if (conversationId) {
      selectConversation(conversationId);
      setSearchParams({}, { replace: true });
      return;
    }
    const target = requestedRecipient;
    if (!target) return;
    let cancelled = false;
    void api.createDirectConversation(identityId, target).then((conversation) => {
      if (cancelled) return;
      selectConversation(conversation.id);
      if (!compact) setSearchParams({}, { replace: true });
    }).catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not start conversation"); });
    return () => { cancelled = true; };
  }, [identityId, compact, requestedRecipient, requestedConversation, setSearchParams, selectConversation]);
  const typingSocket = useProfileRealtime(identityId, (event) => {
      if (!visible) return;
      if (event.type === "typing") {
        if (event.conversationId !== selectedId) return;
        const payload = event.payload as { identityId: string; displayName: string; active: boolean };
        setTyping((current) => payload.active ? [...new Set([...current, payload.displayName])] : current.filter((name) => name !== payload.displayName));
      } else if (event.type === "message.created") {
        const message = event.payload as ChatMessage;
        void loadSidebar();
        if (event.conversationId !== selectedId) return;
        setMessages((current) => {
          const exists = current.some((item) => item.id === message.id || item.clientMessageId === message.clientMessageId && item.sender.id === message.sender.id);
          return exists ? current.map((item) => item.id === message.id || item.clientMessageId === message.clientMessageId && item.sender.id === message.sender.id ? message : item) : [...current, message];
        });
        if (message.sender.id !== identityId) {
          void api.updateConversationState(identityId, message.conversationId, { read: true, readThrough: message.createdAt }).catch(() => undefined);
        }
      } else if (event.type === "conversation.read") {
        const payload = event.payload as { identityId: string; readAt: string };
        setSelected((current) => current && current.id === event.conversationId ? {
          ...current, participants: current.participants.map((member) => member.id === payload.identityId ? { ...member, lastReadAt: payload.readAt } : member),
        } : current);
        if (payload.identityId === identityId) setConversations((current) => current.map((item) => item.id === event.conversationId ? { ...item, unreadCount: 0 } : item));
      } else {
        void loadSidebar();
        if (selectedId && (event.type === "ready" || event.conversationId === selectedId)) void loadConversation(selectedId, true);
      }
  });
  useEffect(() => () => {
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    if (selectedId) typingSocket.current?.sendTyping(selectedId, false);
  }, [selectedId, typingSocket, visible]);

  const ownProfile = selected?.participants.find((participant) => participant.id === identityId);
  const selectedOthers = selected?.participants.filter((participant) => participant.id !== identityId) ?? [];

  async function send() {
    if (busy || !selectedId || !ownProfile || (!body.trim() && !files.length)) return;
    if (files.reduce((sum, file) => sum + file.size, 0) > 20_000_000) { setError("Attachments cannot exceed 20 MB per message."); return; }
    const clientMessageId = crypto.randomUUID();
    const optimistic: ChatMessage = { id: `pending:${clientMessageId}`, conversationId: selectedId, clientMessageId, type: "user", body: body.trim() || null, sender: ownProfile!, replyTo: replyTo ? { id: replyTo.id, body: replyTo.body, sender: replyTo.sender } : null, attachments: [], reactions: [], editedAt: null, deletedAt: null, createdAt: new Date().toISOString(), sending: true };
    setMessages((current) => [...current, optimistic]);
    const sentBody = body;
    const sentFiles = files;
    const sentReply = replyTo;
    setBody(""); setFiles([]); setReplyTo(null); setBusy(true); setError(null);
    try {
      const attachmentIds = await Promise.all(sentFiles.map((file) => api.uploadMessageAttachment(identityId, selectedId, file)));
      const message = await api.sendMessage(identityId, selectedId, { clientMessageId, body: sentBody || undefined, replyToId: sentReply?.id, attachmentIds });
      setMessages((current) => current.map((item) => item.clientMessageId === clientMessageId ? message : item));
      await loadSidebar();
    } catch (err) {
      setMessages((current) => current.map((item) => item.clientMessageId === clientMessageId ? { ...item, sending: false, failed: true } : item));
      setError(err instanceof Error ? err.message : "Message failed to send");
    } finally { setBusy(false); }
  }

  function handleTyping(value: string) {
    setBody(value);
    if (!selectedId) return;
    typingSocket.current?.sendTyping(selectedId, true);
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => typingSocket.current?.sendTyping(selectedId, false), 1200);
  }

  async function openComposer() {
    setComposeOpen(true);
    setConnections((await api.connections(identityId, "connected")).items);
  }

  async function createConversation() {
    if (!recipients.length) return;
    setBusy(true);
    try {
      const conversation = groupMode || recipients.length > 1
        ? await api.createGroupConversation(identityId, groupTitle || "New conversation", recipients)
        : await api.createDirectConversation(identityId, recipients[0]);
      setComposeOpen(false); setRecipients([]); setGroupTitle(""); setGroupMode(false); selectConversation(conversation.id); await loadSidebar();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create conversation"); }
    finally { setBusy(false); }
  }

  async function renameGroup() {
    if (!selected) return;
    const title = window.prompt("Group name", selected.title)?.trim();
    if (!title) return;
    await api.updateConversationTitle(identityId, selected.id, title);
    await Promise.all([loadConversation(selected.id), loadSidebar()]);
  }

  async function addGroupMembers() {
    if (!selected) return;
    const available = (await api.connections(identityId, "connected")).items.filter(
      (item) => !selected.participants.some((participant) => participant.id === item.profile.id),
    );
    if (!available.length) { setError("All of your connections are already in this group."); return; }
    const labels = available.map((item) => item.profile.handle).join(", ");
    const requested = window.prompt(`Enter one or more handles, separated by commas. Available: ${labels}`);
    if (!requested) return;
    const handles = new Set(requested.split(",").map((value) => value.trim().toLowerCase()));
    const participantIds = available.filter((item) => handles.has(item.profile.handle.toLowerCase())).map((item) => item.profile.id);
    if (!participantIds.length) { setError("No matching connected profiles were selected."); return; }
    await api.addConversationMembers(identityId, selected.id, participantIds);
    await loadConversation(selected.id);
  }

  async function blockDirectProfile() {
    const target = selectedOthers[0];
    if (!target || !window.confirm(`Block ${target.displayName}? The connection will be removed and this direct conversation will become read-only.`)) return;
    await api.blockProfile(identityId, target.id);
    selectConversation(null); await loadSidebar();
  }

  async function reportDirectProfile() {
    const target = selectedOthers[0];
    if (!target) return;
    const details = window.prompt(`Describe why you are reporting ${target.displayName}.`);
    if (!details) return;
    await api.reportProfile(identityId, target.id, { reason: "other", details });
    setError("Report submitted for review.");
  }

  return (
    <div className={`messaging-workspace ${compact ? "messaging-compact" : "rounded-xl border border-rule"} ${selectedId ? "has-thread" : ""}`}>
      {error ? <div className="m-3" role="alert"><Banner>{error}</Banner></div> : null}
      <div className="messaging-grid">
        <aside className="messaging-rail">
          <div className="flex items-center justify-between gap-2 border-b border-rule p-4">
            <div><h1 className="text-base font-semibold">{compact ? "Your conversations" : "Messaging"}</h1><p className="mt-0.5 text-xs text-muted">Stay close to your network</p></div>
            <Button type="button" variant="ghost" title="New conversation" aria-label="New conversation" onClick={() => void openComposer().catch((err) => setError(err instanceof Error ? err.message : "Could not load connections"))}><Icon name="compose" /></Button>
          </div>
          <div className="space-y-2 border-b border-rule p-3">
            <Input aria-label="Search messages" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" />
            <Select aria-label="Inbox filter" value={bucket} onChange={(event) => { setBucket(event.target.value); selectConversation(null); }}>
              <option value="inbox">All conversations</option><option value="unread">Unread</option><option value="starred">Starred</option><option value="groups">Groups</option><option value="archived">Archived</option><option value="requests">Connection requests</option>
            </Select>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {bucket === "requests" ? requests.map((item) => <RequestRow key={item.id} item={item} busy={busy} onAccept={async () => { await api.respondToConnection(identityId, item.id, "accept"); await loadSidebar(); }} onDecline={async () => { await api.respondToConnection(identityId, item.id, "decline"); await loadSidebar(); }} />) : conversations.map((conversation) => <button type="button" key={conversation.id} onClick={() => selectConversation(conversation.id)} aria-pressed={selectedId === conversation.id} className={`flex w-full gap-3 border-b border-rule px-4 py-4 text-left transition-colors hover:bg-accent-soft/50 ${selectedId === conversation.id ? "border-l-2 border-l-link bg-accent-soft/60" : ""}`}>
              {conversation.participants.find((member) => member.id !== identityId) ? <Avatar profile={conversation.participants.find((member) => member.id !== identityId)!} /> : <Icon name="messages" />}
              <span className="min-w-0 flex-1"><span className="flex justify-between gap-2"><span className="truncate text-sm font-medium">{conversation.title}</span><span className="shrink-0 text-[10px] text-muted">{shortTime(conversation.lastMessageAt).split(",")[0]}</span></span>
              <span className="mt-1 flex items-center justify-between gap-2"><span className="truncate text-xs text-muted">{conversation.latestMessage?.deletedAt ? "Message deleted" : conversation.latestMessage?.body ?? conversation.latestMessage?.attachments[0]?.fileName ?? "Start the conversation"}</span>{conversation.unreadCount ? <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-white">{conversation.unreadCount}</span> : null}</span></span>
            </button>)}
            {bucket === "requests" && !requests.length ? <EmptyState>No connection requests.</EmptyState> : null}
            {bucket !== "requests" && !conversations.length ? <EmptyState>No conversations here yet. Start one with a connection.</EmptyState> : null}
            {bucket !== "requests" && inboxCursor ? <Button type="button" variant="ghost" onClick={() => void loadSidebar(inboxCursor)}>Load more conversations</Button> : null}
          </div>
          {!compact && notificationPermission === "default" ? <button type="button" className="border-t border-rule px-4 py-3 text-left text-xs text-muted hover:text-ink" onClick={() => void Notification.requestPermission().then(setNotificationPermission)}>Enable desktop notifications</button> : null}
        </aside>
        <section className="messaging-thread" aria-label="Conversation">
          {selected ? <>
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-rule bg-surface px-4 py-3">
              <button type="button" className="thread-back rounded p-1 text-muted hover:bg-accent-soft" aria-label="Back to conversations" onClick={() => selectConversation(null)}><Icon name="back" /></button>
              <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold">{selected.title}</h2><p className="truncate text-xs text-muted">{selected.type === "group" ? `${selected.participants.length} participants` : selectedOthers[0]?.descriptor}</p></div>
              <details className="relative" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
                <summary aria-label="Conversation options" title="Conversation options" className="list-none rounded-md px-2 py-1 text-lg text-muted hover:bg-accent-soft">···</summary>
                <div className="absolute right-0 top-9 z-20 flex w-48 flex-col gap-1 rounded-xl border border-rule bg-surface p-2 shadow-xl">
                  <Button type="button" variant="ghost" onClick={() => void api.updateConversationState(identityId, selected.id, { starred: !selected.starred }).then(() => { setSelected({ ...selected, starred: !selected.starred }); void loadSidebar(); })}>{selected.starred ? "Remove star" : "Star conversation"}</Button>
                  <Button type="button" variant="ghost" onClick={() => void api.updateConversationState(identityId, selected.id, { archived: !selected.archived }).then(() => { selectConversation(null); void loadSidebar(); })}>{selected.archived ? "Unarchive" : "Archive"}</Button>
                  {selected.type === "group" ? <>{ownProfile?.role === "owner" || ownProfile?.role === "admin" ? <><Button type="button" variant="secondary" onClick={() => void renameGroup().catch((err) => setError(err instanceof Error ? err.message : "Could not rename group"))}>Rename group</Button><Button type="button" variant="secondary" onClick={() => void addGroupMembers().catch((err) => setError(err instanceof Error ? err.message : "Could not add members"))}>Add members</Button></> : null}<Button type="button" variant="ghost" onClick={() => { if (window.confirm("Leave this group?")) void api.leaveConversation(identityId, selected.id).then(() => { selectConversation(null); void loadSidebar(); }); }}>Leave group</Button></> : <><Button type="button" variant="ghost" onClick={() => void reportDirectProfile().catch((err) => setError(err instanceof Error ? err.message : "Could not submit report"))}>Report</Button><Button type="button" variant="ghost" onClick={() => void blockDirectProfile().catch((err) => setError(err instanceof Error ? err.message : "Could not block profile"))}>Block</Button></>}
                </div>
              </details>
            </header>
            <div ref={messageList} className="message-list min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5">
              {messages.map((message) => <MessageBubble key={message.id} message={message} own={message.sender.id === identityId} identityId={identityId} onReply={() => setReplyTo(message)} onChanged={() => loadConversation(selected.id, true)} />)}
              {!messages.length ? <p className="py-8 text-center text-xs text-muted">This is the start of your conversation.</p> : null}
            </div>
            <div className="shrink-0 border-t border-rule bg-surface p-3">
              {replyTo ? <div className="mb-2 flex items-center justify-between gap-2 rounded bg-accent-soft px-3 py-2 text-xs"><span className="truncate">Replying to {replyTo.sender.displayName}: {replyTo.body}</span><button type="button" aria-label="Cancel reply" onClick={() => setReplyTo(null)}>×</button></div> : null}
              {files.length ? <div className="mb-2 flex flex-wrap gap-2">{files.map((file) => <span key={`${file.name}-${file.size}`} className="max-w-full truncate rounded border border-rule bg-canvas px-2 py-1 text-xs">{file.name} <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((item) => item !== file))}>×</button></span>)}</div> : null}
              {typing.length ? <p className="mb-1 text-xs text-muted">{typing.join(", ")} typing…</p> : null}
              <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => addDroppedFiles(event, setFiles, setError)}>
                <textarea aria-label="Write a message" className="min-h-16 w-full resize-none rounded-lg border border-rule bg-canvas/50 px-3 py-2 text-sm outline-none focus:border-link" rows={2} value={body} onChange={(event) => handleTyping(event.target.value)} onBlur={() => void api.updateConversationState(identityId, selected.id, { draftText: body || null }).catch(() => undefined)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} placeholder="Write a message…" />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <label className="relative inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-muted hover:bg-accent-soft focus-within:outline-2 focus-within:outline-link" title="Attach files"><span aria-hidden="true" className="text-lg">＋</span> Attach<input aria-label="Attach files" className="sr-only" type="file" multiple accept={ATTACHMENT_ACCEPT} onChange={(event) => { validateFiles(Array.from(event.target.files ?? []), setFiles, setError); event.target.value = ""; }} /></label>
                  <Button type="button" className="h-8 px-4 text-xs" disabled={busy || (!body.trim() && !files.length)} onClick={() => void send()}>Send</Button>
                </div>
              </div>
            </div>
          </> : <div className="m-auto max-w-sm px-8 text-center">{selectedId ? <p className="text-sm text-muted">Opening conversation…</p> : <><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-rule bg-surface text-link"><Icon name="messages" width="26" height="26" /></span><h2 className="mt-5 text-lg font-semibold">A conversation starts something.</h2><p className="mt-2 text-sm leading-relaxed text-muted">Connect with the people behind your next collaboration. Select a conversation to get started.</p></>}</div>}
        </section>
        <aside className="messaging-details">{selected ? <><h2 className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted">People in this conversation</h2><div className="mt-5 space-y-5">{selected.participants.map((profile) => <div key={profile.id} className="flex items-center gap-3"><Avatar profile={profile} /><div className="min-w-0"><div className="truncate text-sm font-medium">{profile.displayName}</div><div className="truncate text-xs text-muted">{profile.handle} · {profile.role}</div></div></div>)}</div>{role === "sponsor" && selected.type === "direct" && selectedOthers[0]?.profileType === "creator" ? <a className="mt-6 inline-flex h-9 items-center rounded-lg border border-rule px-3.5 text-xs font-medium text-ink hover:bg-accent-soft" href={`/sponsor/${profileId}/contracts/new?creatorProfileId=${selectedOthers[0].profileId}`}>Draft contract</a> : null}</> : null}</aside>
      </div>
      {composeOpen ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"><div role="dialog" aria-modal="true" aria-label="New conversation" className="w-full max-w-lg rounded-[8px] border border-rule bg-surface p-5 shadow-xl"><div className="flex justify-between"><div><h2 className="text-lg font-semibold">New conversation</h2><p className="text-sm text-muted">Choose from your connections.</p></div><button type="button" aria-label="Close new conversation" className="text-xl" onClick={() => setComposeOpen(false)}>×</button></div><label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={groupMode} onChange={(event) => setGroupMode(event.target.checked)} />Create a group conversation</label>{groupMode ? <Input className="mt-3" value={groupTitle} onChange={(event) => setGroupTitle(event.target.value)} placeholder="Group name" /> : null}<div className="mt-3 max-h-64 space-y-1 overflow-y-auto">{connections.map((item) => <label key={item.id} className="flex items-center gap-3 rounded p-2 hover:bg-accent-soft"><input type={groupMode ? "checkbox" : "radio"} name="recipient" checked={recipients.includes(item.profile.id)} onChange={(event) => setRecipients((current) => groupMode ? event.target.checked ? [...current, item.profile.id] : current.filter((id) => id !== item.profile.id) : [item.profile.id])} /><Avatar profile={item.profile} /><span><span className="block text-sm font-semibold">{item.profile.displayName}</span><span className="block text-xs text-muted">{item.profile.handle}</span></span></label>)}</div><div className="mt-5 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setComposeOpen(false)}>Cancel</Button><Button type="button" disabled={busy || !recipients.length || (groupMode && !groupTitle.trim())} onClick={() => void createConversation()}>Start conversation</Button></div></div></div> : null}
    </div>
  );
}

function MessageBubble({ message, own, identityId, onReply, onChanged }: { message: ChatMessage; own: boolean; identityId: string; onReply: () => void; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  async function mutate(operation: Promise<unknown>) {
    try { await operation; await onChanged(); setError(null); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not update message"); }
  }
  return <div className="group flex gap-2.5">
    <Avatar profile={message.sender} small />
    <div className="min-w-0 flex-1">
      <div className="mb-1.5 flex flex-wrap items-baseline gap-2 text-[10px] text-muted"><span className="text-xs font-medium text-ink">{message.sender.displayName}</span><span>{shortTime(message.createdAt)}</span>{message.editedAt ? <span>edited</span> : null}</div>
      <div className={`rounded-lg border px-3 py-2.5 text-sm leading-relaxed break-words ${own ? "border-accent-rule bg-message-own" : "border-rule bg-surface"}`}>
        {message.deletedAt ? <em className="text-muted">Message deleted</em> : <>
          {message.replyTo ? <div className="mb-2 border-l-2 border-link/50 pl-2 text-xs text-muted">{message.replyTo.sender.displayName}: {message.replyTo.body}</div> : null}
          {message.body ? <p className="whitespace-pre-wrap">{message.body}</p> : null}
          {message.attachments.map((attachment) => <a key={attachment.id} className="mt-2 block text-xs text-link underline underline-offset-4" href={`/api/profiles/${encodeURIComponent(identityId)}/attachments/${attachment.id}/content`} target="_blank" rel="noreferrer">{attachment.fileName}</a>)}
        </>}
      </div>
      {!message.deletedAt ? <div className="mt-1 flex min-h-5 flex-wrap items-center gap-2 text-[11px]">
        {message.reactions.length ? <span className="rounded-full border border-rule bg-surface px-1.5">{message.reactions.map((reaction) => reaction.emoji).join(" ")}</span> : null}
        {message.sending ? <span className="text-muted">Sending…</span> : null}
        {message.failed ? <span className="text-danger">Not sent. Please try again.</span> : null}
        {!message.sending && !message.failed ? <div className="message-actions flex items-center gap-1">
          <button type="button" className="rounded px-1.5 py-0.5 text-muted hover:bg-accent-soft" onClick={onReply}>Reply</button>
          {["👍", "❤️", "👏"].map((emoji) => <button key={emoji} type="button" aria-label={`React ${emoji}`} className="rounded px-1 hover:bg-accent-soft" onClick={() => void mutate(api.reactToMessage(identityId, message.conversationId, message.id, emoji))}>{emoji}</button>)}
          {own ? <details className="relative"><summary aria-label="Message options" className="list-none rounded px-1.5 text-muted hover:bg-accent-soft">···</summary><div className="absolute right-0 top-6 z-10 flex gap-3 rounded-lg border border-rule bg-surface p-3 shadow-xl">
            <button type="button" className="text-link" onClick={() => { const body = window.prompt("Edit message", message.body ?? ""); if (body) void mutate(api.editMessage(identityId, message.conversationId, message.id, body)); }}>Edit</button>
            <button type="button" className="text-danger" onClick={() => { if (window.confirm("Delete this message?")) void mutate(api.deleteMessage(identityId, message.conversationId, message.id)); }}>Delete</button>
          </div></details> : null}
        </div> : null}
      </div> : null}
      {error ? <p role="alert" className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  </div>;
}

function RequestRow({ item, busy, onAccept, onDecline }: { item: ConnectionRequest; busy: boolean; onAccept: () => Promise<void>; onDecline: () => Promise<void> }) {
  return <div className="border-b border-rule p-4"><div className="flex gap-3"><Avatar profile={item.profile} /><div><div className="font-semibold">{item.profile.displayName}</div><div className="text-xs text-muted">{item.profile.handle}</div></div></div>{item.note ? <p className="mt-2 text-sm text-muted">{item.note}</p> : null}<div className="mt-3 flex gap-2"><Button type="button" disabled={busy} onClick={() => void onAccept()}>Accept</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => void onDecline()}>Decline</Button></div></div>;
}

function shortTime(value: string | null) { return value ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : ""; }

function addDroppedFiles(event: DragEvent, setFiles: (files: File[]) => void, setError: (message: string | null) => void) {
  event.preventDefault();
  validateFiles(Array.from(event.dataTransfer.files), setFiles, setError);
}

function validateFiles(files: File[], setFiles: (files: File[]) => void, setError: (message: string | null) => void) {
  if (files.length > 10) { setError("A message can contain at most 10 attachments."); return; }
  if (files.some((file) => !ATTACHMENT_EXTENSIONS.has(`.${file.name.split(".").pop()?.toLowerCase()}`))) { setError("One or more attachment types are not supported."); return; }
  if (files.reduce((sum, file) => sum + file.size, 0) > 20_000_000) { setError("Attachments cannot exceed 20 MB per message."); return; }
  setFiles(files); setError(null);
}
