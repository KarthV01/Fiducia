import type {
  AcceptInviteResult,
  AuthUser,
  BrandDashboard,
  ContractBuilder,
  ContractInvite,
  CreateContractInput,
  CreatorDashboard,
  CreatorProfile,
  EnrichedAgreement,
  DeliverableReviewInput,
  MetricObservationInput,
  MutationResult,
  ProfilesResponse,
  SponsorProfile,
  UploadSession,
  ConnectionRequest,
  Paginated,
  SocialProfile,
  ChatMessage,
  ConversationSummary,
  MessageAttachment,
  MessagingCounts,
  WalletChallenge,
  CreatorWalletConnection,
  AccountWalletConnection,
} from "./types";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { message?: string; error?: string };
      message = body.message ?? body.error ?? message;
    } catch {
      // keep fallback
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  me: () => request<{ user: AuthUser | null }>("/api/auth/me"),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  ethereumChallenge: (address: string, chainId: number) => request<WalletChallenge>("/api/auth/ethereum/challenges", { method: "POST", body: JSON.stringify({ address, chainId }) }),
  ethereumSession: (input: { challengeId: string; message: string; signature: string; walletClient: "metamask" | "walletconnect" }) => request<{ user: AuthUser }>("/api/auth/ethereum/sessions", { method: "POST", body: JSON.stringify(input) }),
  accountWallets: () => request<{ wallets: AccountWalletConnection[] }>("/api/auth/wallets"),
  accountWalletChallenge: (address: string, chainId: number) => request<WalletChallenge>("/api/auth/wallets/challenges", { method: "POST", body: JSON.stringify({ address, chainId }) }),
  connectAccountWallet: (input: { challengeId: string; message: string; signature: string; walletClient: "metamask" | "walletconnect" }) => request<AccountWalletConnection>("/api/auth/wallets", { method: "POST", body: JSON.stringify(input) }),
  profiles: () => request<ProfilesResponse>("/api/profiles"),
  createSponsorProfile: (input: {
    name: string;
    handle: string;
    industry: string;
    websiteUrl?: string;
    logoUrl?: string;
    monthlyBudgetAmount?: string;
  }) =>
    request<SponsorProfile>("/api/profiles/sponsors", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createCreatorProfile: (input: {
    handle: string;
    displayName: string;
    channelUrl?: string;
    category: string;
    audience?: string;
    avatarUrl?: string;
  }) =>
    request<CreatorProfile>("/api/profiles/creators", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  searchProfiles: (identityId: string, input: { q?: string; relationship?: string; profileType?: string; cursor?: string }) => {
    const params = new URLSearchParams();
    if (input.q) params.set("q", input.q);
    if (input.relationship) params.set("relationship", input.relationship);
    if (input.profileType) params.set("profileType", input.profileType);
    if (input.cursor) params.set("cursor", input.cursor);
    return request<Paginated<SocialProfile>>(`/api/profiles/${encodeURIComponent(identityId)}/search?${params}`);
  },
  connections: (identityId: string, bucket: "incoming" | "outgoing" | "connected") =>
    request<Paginated<ConnectionRequest>>(`/api/profiles/${encodeURIComponent(identityId)}/connections?bucket=${bucket}`),
  requestConnection: (identityId: string, recipientId: string, note?: string) =>
    request(`/api/profiles/${encodeURIComponent(identityId)}/connections`, { method: "POST", body: JSON.stringify({ recipientId, note }) }),
  respondToConnection: (identityId: string, connectionId: string, action: "accept" | "decline" | "withdraw") =>
    request(`/api/profiles/${encodeURIComponent(identityId)}/connections/${connectionId}`, { method: "PATCH", body: JSON.stringify({ action }) }),
  removeConnection: (identityId: string, connectionId: string) =>
    request<void>(`/api/profiles/${encodeURIComponent(identityId)}/connections/${connectionId}`, { method: "DELETE" }),
  blockProfile: (identityId: string, targetId: string) =>
    request(`/api/profiles/${encodeURIComponent(identityId)}/blocks/${encodeURIComponent(targetId)}`, { method: "POST" }),
  unblockProfile: (identityId: string, targetId: string) =>
    request<void>(`/api/profiles/${encodeURIComponent(identityId)}/blocks/${encodeURIComponent(targetId)}`, { method: "DELETE" }),
  reportProfile: (identityId: string, targetId: string, input: { messageId?: string; reason: "spam" | "harassment" | "fraud" | "other"; details?: string }) =>
    request(`/api/profiles/${encodeURIComponent(identityId)}/reports/${encodeURIComponent(targetId)}`, { method: "POST", body: JSON.stringify(input) }),
  messagingCounts: (identityId: string) => request<MessagingCounts>(`/api/profiles/${encodeURIComponent(identityId)}/messaging-counts`),
  conversations: (identityId: string, input: { bucket?: string; q?: string; cursor?: string } = {}) => {
    const params = new URLSearchParams();
    if (input.bucket) params.set("bucket", input.bucket);
    if (input.cursor) params.set("cursor", input.cursor);
    if (input.q) params.set("q", input.q);
    return request<Paginated<ConversationSummary>>(`/api/profiles/${encodeURIComponent(identityId)}/conversations?${params}`);
  },
  conversation: (identityId: string, conversationId: string) => request<ConversationSummary>(`/api/profiles/${encodeURIComponent(identityId)}/conversations/${conversationId}`),
  createDirectConversation: (identityId: string, recipientId: string) => request<{ id: string }>(`/api/profiles/${encodeURIComponent(identityId)}/conversations/direct`, { method: "POST", body: JSON.stringify({ recipientId }) }),
  createGroupConversation: (identityId: string, title: string, participantIds: string[]) => request<{ id: string }>(`/api/profiles/${encodeURIComponent(identityId)}/conversations/groups`, { method: "POST", body: JSON.stringify({ title, participantIds }) }),
  messages: (identityId: string, conversationId: string, cursor?: string) => request<Paginated<ChatMessage>>(`/api/profiles/${encodeURIComponent(identityId)}/conversations/${conversationId}/messages${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
  sendMessage: (identityId: string, conversationId: string, input: { clientMessageId: string; body?: string; replyToId?: string; attachmentIds?: string[] }) => request<ChatMessage>(`/api/profiles/${encodeURIComponent(identityId)}/conversations/${conversationId}/messages`, { method: "POST", body: JSON.stringify(input) }),
  editMessage: (identityId: string, conversationId: string, messageId: string, body: string) => request<ChatMessage>(`/api/profiles/${encodeURIComponent(identityId)}/conversations/${conversationId}/messages/${messageId}`, { method: "PATCH", body: JSON.stringify({ body }) }),
  deleteMessage: (identityId: string, conversationId: string, messageId: string) => request<void>(`/api/profiles/${encodeURIComponent(identityId)}/conversations/${conversationId}/messages/${messageId}`, { method: "DELETE" }),
  reactToMessage: (identityId: string, conversationId: string, messageId: string, emoji: string) => request<{ active: boolean }>(`/api/profiles/${encodeURIComponent(identityId)}/conversations/${conversationId}/messages/${messageId}/reactions`, { method: "POST", body: JSON.stringify({ emoji }) }),
  updateConversationState: (identityId: string, conversationId: string, input: { read?: boolean; readThrough?: string; archived?: boolean; starred?: boolean; mutedUntil?: string | null; draftText?: string | null }) => request(`/api/profiles/${encodeURIComponent(identityId)}/conversations/${conversationId}/state`, { method: "PATCH", body: JSON.stringify(input) }),
  addConversationMembers: (identityId: string, conversationId: string, participantIds: string[]) => request(`/api/profiles/${encodeURIComponent(identityId)}/conversations/${conversationId}/members`, { method: "POST", body: JSON.stringify({ participantIds }) }),
  updateConversationTitle: (identityId: string, conversationId: string, title: string) => request(`/api/profiles/${encodeURIComponent(identityId)}/conversations/${conversationId}`, { method: "PATCH", body: JSON.stringify({ title }) }),
  updateGroupMember: (identityId: string, conversationId: string, targetId: string, action: "promote" | "demote" | "remove") => request(`/api/profiles/${encodeURIComponent(identityId)}/conversations/${conversationId}/members/${encodeURIComponent(targetId)}`, { method: "PATCH", body: JSON.stringify({ action }) }),
  leaveConversation: (identityId: string, conversationId: string) => request<void>(`/api/profiles/${encodeURIComponent(identityId)}/conversations/${conversationId}/members/me`, { method: "DELETE" }),
  uploadMessageAttachment: async (identityId: string, conversationId: string, file: File, onProgress?: (percent: number) => void) => {
    const attachment = await request<MessageAttachment>(`/api/profiles/${encodeURIComponent(identityId)}/conversations/${conversationId}/attachments`, { method: "POST", body: JSON.stringify({ fileName: file.name, mimeType: file.type || "application/octet-stream", totalSize: file.size }) });
    await uploadChunks(`/api/profiles/${encodeURIComponent(identityId)}/attachments/${attachment.id}`, file, 0, onProgress);
    return attachment.id;
  },
  brandDashboard: (sponsorId: string) => request<BrandDashboard>(`/api/sponsors/${sponsorId}/dashboard`),
  brandContracts: (sponsorId: string) => request<EnrichedAgreement[]>(`/api/sponsors/${sponsorId}/contracts`),
  brandContract: (sponsorId: string, id: string) =>
    request<EnrichedAgreement>(`/api/sponsors/${sponsorId}/contracts/${id}`),
  contractBuilder: (sponsorId: string) => request<ContractBuilder>(`/api/sponsors/${sponsorId}/contract-builder`),
  createContract: (sponsorId: string, input: CreateContractInput) =>
    request<ContractInvite>(`/api/sponsors/${sponsorId}/contract-invites`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  reviewDeliverable: (sponsorId: string, id: string, submissionId: string, input: DeliverableReviewInput) =>
    request<MutationResult>(`/api/sponsors/${sponsorId}/contracts/${id}/submissions/${submissionId}/review`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  uploadCheckpointFile: async (creatorId: string, agreementId: string, checkpoint: "promo" | "final_cut", file: File, onProgress: (percent: number) => void, existing?: UploadSession, signal?: AbortSignal) => {
    const upload = existing ?? await request<UploadSession>(`/api/creators/${creatorId}/contracts/${agreementId}/uploads`, { method: "POST", body: JSON.stringify({ checkpoint, fileName: file.name, mimeType: file.type || "application/octet-stream", totalSize: String(file.size) }) });
    await uploadChunks(`/api/creators/${creatorId}/contracts/${agreementId}/uploads/${upload.id}`, file, Number(upload.receivedSize), onProgress, signal);
    return upload.id;
  },
  submitCheckpoint: (creatorId: string, agreementId: string, checkpoint: "promo" | "final_cut", input: { uploadId: string; notes?: string; attested: true }) => request(`/api/creators/${creatorId}/contracts/${agreementId}/checkpoints/${checkpoint}/submissions`, { method: "POST", body: JSON.stringify(input) }),
  recordBrandMetric: (sponsorId: string, id: string, input: MetricObservationInput) =>
    request<MutationResult>(`/api/sponsors/${sponsorId}/contracts/${id}/metrics`, {
      method: "POST",
      body: JSON.stringify({ source: "simulation", ...input }),
    }),
  creatorDashboard: (creatorId: string) =>
    request<CreatorDashboard>(`/api/creators/${creatorId}/dashboard`),
  creatorContracts: (creatorId: string) =>
    request<EnrichedAgreement[]>(`/api/creators/${creatorId}/contracts`),
  creatorContract: (creatorId: string, id: string) =>
    request<EnrichedAgreement>(`/api/creators/${creatorId}/contracts/${id}`),
  creatorInvites: (creatorId: string) =>
    request<{ invites: ContractInvite[] }>(`/api/creators/${creatorId}/invites`),
  creatorWallets: (creatorId: string) => request<{ wallets: CreatorWalletConnection[] }>(`/api/creators/${creatorId}/wallets`),
  creatorWalletChallenge: (creatorId: string, address: string, chainId: number) => request<WalletChallenge>(`/api/creators/${creatorId}/wallets/challenges`, { method: "POST", body: JSON.stringify({ address, chainId }) }),
  connectCreatorWallet: (creatorId: string, input: { challengeId: string; message: string; signature: string; walletClient: "metamask" | "walletconnect" }) => request<CreatorWalletConnection>(`/api/creators/${creatorId}/wallets`, { method: "POST", body: JSON.stringify(input) }),
  makeCreatorWalletPrimary: (creatorId: string, walletId: string) => request<CreatorWalletConnection>(`/api/creators/${creatorId}/wallets/${walletId}`, { method: "PATCH", body: JSON.stringify({ isPrimary: true }) }),
  disconnectCreatorWallet: (creatorId: string, walletId: string) => request<CreatorWalletConnection>(`/api/creators/${creatorId}/wallets/${walletId}`, { method: "DELETE" }),
  acceptInvite: (creatorId: string, inviteId: string) =>
    request<AcceptInviteResult>(`/api/creators/${creatorId}/invites/${inviteId}/accept`, { method: "POST" }),
  connectYouTube: (creatorId: string, agreementId: string) => request<{ authorizationUrl: string }>(`/api/creators/${creatorId}/contracts/${agreementId}/youtube/connect`, { method: "POST" }),
  createPublication: (creatorId: string, agreementId: string, input: { method: "manual"; youtubeUrl: string } | { method: "service"; title: string; description: string }) => request(`/api/creators/${creatorId}/contracts/${agreementId}/publications`, { method: "POST", body: JSON.stringify(input) }),
};

// Both private-file flows use the same resumable transport and error handling.
async function uploadChunks(path: string, file: File, initialOffset: number, onProgress?: (percent: number) => void, signal?: AbortSignal) {
  let offset = initialOffset;
  while (offset < file.size) {
    const chunk = file.slice(offset, Math.min(offset + 4 * 1024 * 1024, file.size));
    const response = await fetch(path, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/octet-stream", "Upload-Offset": String(offset) }, body: chunk, signal });
    if (!response.ok) throw new ApiError(response.status, `Upload failed (${response.status})`);
    const received = Number(response.headers.get("Upload-Offset") ?? offset + chunk.size);
    if (!Number.isSafeInteger(received) || received <= offset || received > file.size) throw new Error("Server returned an invalid upload offset.");
    offset = received;
    onProgress?.(Math.round(offset / file.size * 100));
  }
  await request(`${path}/complete`, { method: "POST", signal });
}
