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
  searchCreators: (q: string) =>
    request<{ creators: CreatorProfile[] }>(`/api/creators/search?q=${encodeURIComponent(q)}`),
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
    const chunkSize = 4 * 1024 * 1024;
    let offset = Number(upload.receivedSize);
    while (offset < file.size) {
      const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size));
      const response = await fetch(`/api/creators/${creatorId}/contracts/${agreementId}/uploads/${upload.id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/octet-stream", "Upload-Offset": String(offset) }, body: chunk, signal });
      if (!response.ok) throw new ApiError(response.status, `Upload failed (${response.status})`);
      offset = Number(response.headers.get("Upload-Offset") ?? offset + chunk.size);
      onProgress(Math.round((offset / file.size) * 100));
    }
    await request(`/api/creators/${creatorId}/contracts/${agreementId}/uploads/${upload.id}/complete`, { method: "POST" });
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
  acceptInvite: (creatorId: string, inviteId: string) =>
    request<AcceptInviteResult>(`/api/creators/${creatorId}/invites/${inviteId}/accept`, { method: "POST" }),
  connectYouTube: (creatorId: string, agreementId: string) => request<{ authorizationUrl: string }>(`/api/creators/${creatorId}/contracts/${agreementId}/youtube/connect`, { method: "POST" }),
  createPublication: (creatorId: string, agreementId: string, input: { method: "manual"; youtubeUrl: string } | { method: "service"; title: string; description: string }) => request(`/api/creators/${creatorId}/contracts/${agreementId}/publications`, { method: "POST", body: JSON.stringify(input) }),
};
