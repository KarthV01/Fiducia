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
  DeliverableSubmission,
  DeliverableSubmissionInput,
  DeliverableReviewInput,
  MetricObservationInput,
  MutationResult,
  ProfilesResponse,
  SponsorProfile,
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
    request<MutationResult>(`/api/sponsors/${sponsorId}/contracts/${id}/deliverables/${submissionId}/review`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
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
  submitDeliverable: (creatorId: string, id: string, input: DeliverableSubmissionInput) =>
    request<{ submission: DeliverableSubmission; agreement: EnrichedAgreement }>(
      `/api/creators/${creatorId}/contracts/${id}/deliverables`,
      { method: "POST", body: JSON.stringify(input) },
    ),
  recordCreatorMetric: (creatorId: string, id: string, input: MetricObservationInput) =>
    request<MutationResult>(`/api/creators/${creatorId}/contracts/${id}/metrics`, {
      method: "POST",
      body: JSON.stringify({ source: "simulation", ...input }),
    }),
};
