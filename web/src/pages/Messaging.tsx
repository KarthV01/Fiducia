import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { useSearchParams, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { connectProfileRealtime } from "../lib/realtime";
import type { ChatMessage, ConnectionRequest, ConversationSummary, SocialProfile } from "../lib/types";
import { Banner, Button, EmptyState, Input, Select } from "../ui/primitives";

const ATTACHMENT_ACCEPT = ".csv,.xls,.xlsx,.doc,.docx,.ppt,.pptx,.pdf,.txt,.gif,.jpg,.jpeg,.png,.bmp,.mp4,.mov";

export function MessagingPage() {
  const { sponsorId, creatorId } = useParams();
  const role = sponsorId ? "sponsor" : "creator";
  const profileId = sponsorId ?? creatorId ?? "";
  const identityId = `${role}:${profileId}`;
  const [searchParams, setSearchParams] = useSearchParams();
  const [bucket, setBucket] = useState("inbox");
  const [query, setQuery] = useState("");
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
  const typingSocket = useRef<ReturnType<typeof connectProfileRealtime> | null>(null);
  const typingTimer = useRef<number | null>(null);

  const loadSidebar = useCallback(async () => {
    try {
      if (bucket === "requests") {
        setRequests((await api.connections(identityId, "incoming")).items);
      } else {
        setConversations((await api.conversations(identityId, { bucket: bucket === "inbox" ? undefined : bucket, q: query })).items);
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load messages"); }
  }, [bucket, identityId, query]);

  const loadConversation = useCallback(async (conversationId: string) => {
    try {
      const [conversation, result] = await Promise.all([api.conversation(identityId, conversationId), api.messages(identityId, conversationId)]);
      setSelected(conversation);
      setMessages(result.items);
      setBody(conversation.draftText ?? "");
      await api.updateConversationState(identityId, conversationId, { read: true });
      window.dispatchEvent(new CustomEvent("messaging:changed"));
    } catch (err) { setError(err instanceof Error ? err.message : "Could not open conversation"); }
  }, [identityId]);

  useEffect(() => { void loadSidebar(); }, [loadSidebar]);
  useEffect(() => { if (selectedId) void loadConversation(selectedId); }, [loadConversation, selectedId]);
  useEffect(() => {
    const target = searchParams.get("with");
    if (!target) return;
    void api.createDirectConversation(identityId, target).then((conversation) => {
      setSelectedId(conversation.id);
      setSearchParams({}, { replace: true });
      void loadSidebar();
    }).catch((err) => setError(err instanceof Error ? err.message : "Could not start conversation"));
  }, [identityId, loadSidebar, searchParams, setSearchParams]);
  useEffect(() => {
    const socket = connectProfileRealtime(identityId, (event) => {
      if (event.type === "typing" && event.conversationId === selectedId) {
        const payload = event.payload as { identityId: string; displayName: string; active: boolean };
        setTyping((current) => payload.active ? [...new Set([...current, payload.displayName])] : current.filter((name) => name !== payload.displayName));
      } else if (event.type !== "ready") {
        void loadSidebar();
        if (event.conversationId === selectedId) void loadConversation(selectedId);
      }
    });
    typingSocket.current = socket;
    return () => { socket.close(); typingSocket.current = null; };
  }, [identityId, loadConversation, loadSidebar, selectedId]);

  const ownProfile = selected?.participants.find((participant) => participant.id === identityId);
  const selectedOthers = selected?.participants.filter((participant) => participant.id !== identityId) ?? [];

  async function send() {
    if (!selectedId || (!body.trim() && !files.length)) return;
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
      setComposeOpen(false); setRecipients([]); setGroupTitle(""); setGroupMode(false); setSelectedId(conversation.id); await loadSidebar();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create conversation"); }
    finally { setBusy(false); }
  }

  return (
    <div className="-m-3 overflow-hidden rounded-[8px] border-2 border-ink/20 bg-surface lg:-m-4">
      {error ? <div className="m-3"><Banner>{error}</Banner></div> : null}
      <div className="grid min-h-[calc(100vh-8rem)] lg:grid-cols-[320px_minmax(360px,1fr)_260px]">
        <aside className="border-r border-rule">
          <div className="flex items-center justify-between border-b border-rule p-4"><div><h1 className="text-lg font-semibold">Messaging</h1><p className="text-xs text-muted">Professional conversations</p></div><Button type="button" onClick={() => void openComposer()}>Compose</Button></div>
          <div className="space-y-2 border-b border-rule p-3"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search messages" /><Select value={bucket} onChange={(event) => { setBucket(event.target.value); setSelectedId(null); }}><option value="inbox">Focused</option><option value="unread">Unread</option><option value="starred">Starred</option><option value="groups">Groups</option><option value="archived">Archived</option><option value="requests">Requests</option></Select></div>
          <div className="max-h-[calc(100vh-17rem)] overflow-y-auto">
            {bucket === "requests" ? requests.map((item) => <RequestRow key={item.id} item={item} busy={busy} onAccept={async () => { await api.respondToConnection(identityId, item.id, "accept"); await loadSidebar(); }} onDecline={async () => { await api.respondToConnection(identityId, item.id, "decline"); await loadSidebar(); }} />) : conversations.map((conversation) => <button type="button" key={conversation.id} onClick={() => setSelectedId(conversation.id)} className={`w-full border-b border-rule p-4 text-left hover:bg-accent-soft/50 ${selectedId === conversation.id ? "bg-accent-soft" : ""}`}><div className="flex justify-between gap-2"><span className="truncate font-semibold">{conversation.title}</span><span className="shrink-0 text-[10px] text-muted">{shortTime(conversation.lastMessageAt)}</span></div><div className="mt-1 flex items-center justify-between gap-2"><span className="truncate text-xs text-muted">{conversation.latestMessage?.deletedAt ? "Message deleted" : conversation.latestMessage?.body ?? conversation.latestMessage?.attachments[0]?.fileName ?? "No messages yet"}</span>{conversation.unreadCount ? <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">{conversation.unreadCount}</span> : null}</div></button>)}
            {bucket === "requests" && !requests.length ? <EmptyState>No message requests.</EmptyState> : null}
            {bucket !== "requests" && !conversations.length ? <EmptyState>No conversations here.</EmptyState> : null}
          </div>
        </aside>

        <main className="flex min-h-[620px] flex-col bg-[#f7f4eb]">
          {selected ? <>
            <header className="flex items-center justify-between border-b border-rule bg-surface px-5 py-3"><div><h2 className="font-semibold">{selected.title}</h2><p className="text-xs text-muted">{selected.type === "group" ? `${selected.participants.length} participants` : selectedOthers[0]?.descriptor}</p></div><div className="flex gap-1"><button type="button" className="rounded px-2 py-1 text-lg text-muted hover:bg-accent-soft" title="Star" onClick={() => void api.updateConversationState(identityId, selected.id, { starred: !selected.starred }).then(() => loadSidebar())}>☆</button><button type="button" className="rounded px-2 py-1 text-sm text-muted hover:bg-accent-soft" onClick={() => void api.updateConversationState(identityId, selected.id, { archived: true }).then(() => { setSelectedId(null); setSelected(null); void loadSidebar(); })}>Archive</button></div></header>
            <div className="flex-1 space-y-4 overflow-y-auto p-5">{messages.map((message) => <MessageBubble key={message.id} message={message} own={message.sender.id === identityId} identityId={identityId} onReply={() => setReplyTo(message)} onChanged={() => loadConversation(selected.id)} />)}</div>
            <div className="border-t border-rule bg-surface p-4">
              {replyTo ? <div className="mb-2 flex items-center justify-between rounded bg-accent-soft px-3 py-2 text-xs"><span className="truncate">Replying to {replyTo.sender.displayName}: {replyTo.body}</span><button type="button" onClick={() => setReplyTo(null)}>×</button></div> : null}
              {files.length ? <div className="mb-2 flex flex-wrap gap-2">{files.map((file) => <span key={`${file.name}-${file.size}`} className="rounded border border-rule bg-canvas px-2 py-1 text-xs">{file.name} <button type="button" onClick={() => setFiles((current) => current.filter((item) => item !== file))}>×</button></span>)}</div> : null}
              {typing.length ? <p className="mb-1 text-xs text-muted">{typing.join(", ")} typing…</p> : null}
              <div className="flex items-end gap-2" onDragOver={(event) => event.preventDefault()} onDrop={(event) => addDroppedFiles(event, setFiles, setError)}><label className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded border-2 border-ink/20 text-lg hover:bg-accent-soft" title="Attach files">＋<input className="sr-only" type="file" multiple accept={ATTACHMENT_ACCEPT} onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></label><textarea className="min-h-10 flex-1 resize-none rounded-[6px] border-2 border-ink/25 bg-surface px-3 py-2 text-sm outline-none focus:border-accent" rows={2} value={body} onChange={(event) => handleTyping(event.target.value)} onBlur={() => void api.updateConversationState(identityId, selected.id, { draftText: body || null })} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Write a message…" /><Button type="button" disabled={busy || (!body.trim() && !files.length)} onClick={() => void send()}>Send</Button></div>
            </div>
          </> : <div className="m-auto max-w-sm text-center"><div className="text-4xl">✉</div><h2 className="mt-3 text-lg font-semibold">Your conversations</h2><p className="mt-1 text-sm text-muted">Select a message or start a professional conversation with a connection.</p></div>}
        </main>

        <aside className="hidden border-l border-rule p-5 lg:block">{selected ? <><h2 className="text-sm font-semibold uppercase tracking-[0.04em] text-muted">Conversation details</h2><div className="mt-4 space-y-4">{selected.participants.map((profile) => <div key={profile.id} className="flex items-center gap-3"><Avatar profile={profile} /><div className="min-w-0"><div className="truncate text-sm font-semibold">{profile.displayName}</div><div className="truncate text-xs text-muted">{profile.handle} · {profile.role}</div></div></div>)}</div>{role === "sponsor" && selected.type === "direct" && selectedOthers[0]?.profileType === "creator" ? <a className="mt-6 inline-flex h-9 items-center rounded-[6px] bg-accent px-3.5 text-sm font-medium text-white" href={`/sponsor/${profileId}/contracts/new?creatorProfileId=${selectedOthers[0].profileId}`}>Draft contract</a> : null}</> : null}</aside>
      </div>

      {composeOpen ? <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/35 p-4"><div className="w-full max-w-lg rounded-[8px] border-2 border-ink/30 bg-surface p-5 shadow-xl"><div className="flex justify-between"><div><h2 className="text-lg font-semibold">New conversation</h2><p className="text-sm text-muted">Choose from your connections.</p></div><button type="button" className="text-xl" onClick={() => setComposeOpen(false)}>×</button></div><label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={groupMode} onChange={(event) => setGroupMode(event.target.checked)} />Create a group conversation</label>{groupMode ? <Input className="mt-3" value={groupTitle} onChange={(event) => setGroupTitle(event.target.value)} placeholder="Group name" /> : null}<div className="mt-3 max-h-64 space-y-1 overflow-y-auto">{connections.map((item) => <label key={item.id} className="flex items-center gap-3 rounded p-2 hover:bg-accent-soft"><input type={groupMode ? "checkbox" : "radio"} name="recipient" checked={recipients.includes(item.profile.id)} onChange={(event) => setRecipients((current) => groupMode ? event.target.checked ? [...current, item.profile.id] : current.filter((id) => id !== item.profile.id) : [item.profile.id])} /><Avatar profile={item.profile} /><span><span className="block text-sm font-semibold">{item.profile.displayName}</span><span className="block text-xs text-muted">{item.profile.handle}</span></span></label>)}</div><div className="mt-5 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setComposeOpen(false)}>Cancel</Button><Button type="button" disabled={busy || !recipients.length || (groupMode && !groupTitle.trim())} onClick={() => void createConversation()}>Start conversation</Button></div></div></div> : null}
    </div>
  );
}

function MessageBubble({ message, own, identityId, onReply, onChanged }: { message: ChatMessage; own: boolean; identityId: string; onReply: () => void; onChanged: () => void }) {
  const [menu, setMenu] = useState(false);
  return <div className={`group flex gap-2 ${own ? "flex-row-reverse" : ""}`}><Avatar profile={message.sender} small /><div className={`max-w-[78%] ${own ? "items-end" : "items-start"}`}><div className="mb-1 flex items-center gap-2 text-[11px] text-muted"><span>{message.sender.displayName}</span><span>{shortTime(message.createdAt)}</span>{message.editedAt ? <span>edited</span> : null}</div><div className={`rounded-[8px] border px-3 py-2 text-sm ${own ? "border-accent bg-accent text-white" : "border-ink/20 bg-surface"}`}>{message.deletedAt ? <em className="opacity-70">Message deleted</em> : <>{message.replyTo ? <div className={`mb-2 border-l-2 pl-2 text-xs ${own ? "border-white/50" : "border-accent/40 text-muted"}`}>{message.replyTo.sender.displayName}: {message.replyTo.body}</div> : null}{message.body ? <p className="whitespace-pre-wrap">{message.body}</p> : null}{message.attachments.map((attachment) => <a key={attachment.id} className={`mt-2 block underline ${own ? "text-white" : "text-accent"}`} href={`/api/profiles/${encodeURIComponent(identityId)}/attachments/${attachment.id}/content`} target="_blank" rel="noreferrer">{attachment.fileName}</a>)}</>}</div>{!message.deletedAt ? <div className="mt-1 flex items-center gap-1 text-xs"><button type="button" className="rounded px-1.5 py-0.5 text-muted hover:bg-accent-soft" onClick={onReply}>Reply</button>{["👍", "❤️", "👏"].map((emoji) => <button key={emoji} type="button" className="rounded px-1 hover:bg-accent-soft" onClick={() => void api.reactToMessage(identityId, message.conversationId, message.id, emoji).then(onChanged)}>{emoji}</button>)}{own && !message.id.startsWith("pending:") ? <button type="button" className="rounded px-1 text-muted hover:bg-accent-soft" onClick={() => setMenu(!menu)}>•••</button> : null}{message.reactions.length ? <span className="ml-1 rounded-full border border-rule bg-surface px-1.5">{message.reactions.map((reaction) => reaction.emoji).join(" ")}</span> : null}{message.sending ? <span className="text-muted">Sending…</span> : null}{message.failed ? <span className="text-[#c0392b]">Failed</span> : null}</div> : null}{menu ? <div className="flex gap-2 text-xs"><button type="button" className="text-accent" onClick={() => { const body = window.prompt("Edit message", message.body ?? ""); if (body) void api.editMessage(identityId, message.conversationId, message.id, body).then(onChanged); }}>Edit</button><button type="button" className="text-[#c0392b]" onClick={() => { if (window.confirm("Delete this message?")) void api.deleteMessage(identityId, message.conversationId, message.id).then(onChanged); }}>Delete</button></div> : null}</div></div>;
}

function RequestRow({ item, busy, onAccept, onDecline }: { item: ConnectionRequest; busy: boolean; onAccept: () => Promise<void>; onDecline: () => Promise<void> }) {
  return <div className="border-b border-rule p-4"><div className="flex gap-3"><Avatar profile={item.profile} /><div><div className="font-semibold">{item.profile.displayName}</div><div className="text-xs text-muted">{item.profile.handle}</div></div></div>{item.note ? <p className="mt-2 text-sm text-muted">{item.note}</p> : null}<div className="mt-3 flex gap-2"><Button type="button" disabled={busy} onClick={() => void onAccept()}>Accept</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => void onDecline()}>Decline</Button></div></div>;
}

function Avatar({ profile, small = false }: { profile: Pick<SocialProfile, "avatarUrl" | "displayName">; small?: boolean }) {
  return <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft font-semibold text-accent ${small ? "h-8 w-8 text-xs" : "h-10 w-10"}`}>{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" /> : profile.displayName.slice(0, 1).toUpperCase()}</div>;
}

function shortTime(value: string | null) { return value ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : ""; }

function addDroppedFiles(event: DragEvent, setFiles: (files: File[]) => void, setError: (message: string | null) => void) {
  event.preventDefault();
  const files = Array.from(event.dataTransfer.files);
  if (files.reduce((sum, file) => sum + file.size, 0) > 20_000_000) { setError("Attachments cannot exceed 20 MB per message."); return; }
  setFiles(files); setError(null);
}
