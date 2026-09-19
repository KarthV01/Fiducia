export type AuthUser = {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
};

export type SponsorProfile = {
  id: string;
  name: string;
  handle: string;
  walletAddress: string;
  industry: string;
  websiteUrl: string | null;
  logoUrl: string | null;
  monthlyBudgetAmount: string;
};

export type AuthIdentity = { id: string; provider: "google" | "ethereum"; providerSubject: string; email: string | null; walletAddress: string | null; verifiedAt: string; revokedAt: string | null };
export type WalletChallenge = { challengeId: string; message: string; expiresAt: string };
export type AccountWalletConnection = { id: string; address: string; provider: "ethereum"; verifiedAt: string; revokedAt: string | null };
export type CreatorWalletConnection = { id: string; address: string; source: "metamask" | "legacy_generated" | string; isPrimary: boolean; verifiedAt: string | null; revokedAt: string | null };
export type WalletConnectionStatus = "missing" | "connecting" | "signing" | "connected" | "error";
export type SocialProvider = "instagram" | "x" | "tiktok" | "youtube";
export type SocialConnection = {
  id: string;
  provider: SocialProvider;
  providerAccountId: string;
  username: string | null;
  displayName: string | null;
  status: "pending" | "active" | "reauthorization_required" | "revoked" | "error";
  grantedScopes: string[];
  capabilities: string[];
  accessTokenExpiresAt: string | null;
  connectedAt: string;
  lastSyncedAt: string | null;
  revokedAt: string | null;
  errorCode: string | null;
};

export type SocialContent = {
  id: string;
  provider: SocialProvider;
  providerContentId: string;
  canonicalUrl: string | null;
  contentType: string | null;
  title: string | null;
  description: string | null;
  visibility: string | null;
  publishedAt: string | null;
};

export type CreatorProfile = {
  id: string;
  handle: string;
  displayName: string;
  walletAddress: string | null;
  channelUrl: string | null;
  category: string;
  averageViews: number;
  audience: string | null;
  avatarUrl: string | null;
};

export type ProfilesResponse = {
  user: AuthUser;
  sponsors: SponsorProfile[];
  creators: CreatorProfile[];
};

export type RelationshipState = "none" | "connected" | "incoming" | "outgoing";

export type SocialProfile = {
  id: string;
  profileType: "sponsor" | "creator";
  profileId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  descriptor: string | null;
  relationship: RelationshipState;
  walletReady: boolean;
};

export type ConnectionRequest = {
  id: string;
  status: string;
  direction: "incoming" | "outgoing";
  note: string | null;
  createdAt: string;
  updatedAt: string;
  profile: SocialProfile;
};

export type Paginated<T> = { items: T[]; nextCursor: string | null };

export type MessageAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  totalSize: number;
  status: string;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  clientMessageId: string;
  type: string;
  body: string | null;
  sender: SocialProfile;
  replyTo: { id: string; body: string | null; sender: SocialProfile } | null;
  attachments: MessageAttachment[];
  reactions: Array<{ id: string; identityId: string; emoji: string }>;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  sending?: boolean;
  failed?: boolean;
};

export type ConversationParticipant = SocialProfile & { role: "owner" | "admin" | "member"; joinedAt: string; lastReadAt: string | null };

export type ConversationSummary = {
  id: string;
  type: "direct" | "group";
  title: string;
  participants: ConversationParticipant[];
  latestMessage: ChatMessage | null;
  lastMessageAt: string | null;
  createdAt: string;
  unreadCount?: number;
  archived?: boolean;
  starred?: boolean;
  mutedUntil?: string | null;
  draftText?: string | null;
};

export type MessagingCounts = { unread: number; requests: number };

export type RealtimeEvent = { type: string; profileId: string; conversationId?: string; sequence: number; occurredAt: string; payload: unknown };

export type DashboardTotals = {
  totalContracts: number;
  byStatus: Record<string, number>;
  escrowedCapAmount: string;
  releasedPayoutAmount: string;
  pendingPayoutAmount: string;
};

export type Financials = {
  totalCapAmount: string;
  releasedPayoutAmount: string;
  pendingPayoutAmount: string;
};

export type BlockchainRecord = {
  id: string;
  chainId: number;
  escrowAddress: string;
  agreementKey: string;
  tokenAddress: string;
  totalCapAmount: string;
  termsHash: string;
  createTxHash: string;
};

export type Party = {
  id: string | null;
  handle: string | null;
  displayName?: string | null;
  name?: string | null;
  walletAddress?: string;
  category?: string;
  industry?: string;
};

export type ContractSummary = {
  id: string;
  title: string | null;
  status: string;
  deadline: string;
  measurementWindowDays: number;
  totalCapAmount: string;
  termsHash: string | null;
  blockchainRecord: BlockchainRecord | null;
  sponsorProfile: Party | null;
  creatorProfile: Party | null;
  financials: Financials;
  workflow: ContractWorkflow;
};

export type DeliverableEvidence = {
  id: string;
  url: string;
  label: string | null;
  position: number;
};

export type DeliverableReview = {
  id: string;
  decision: "changes_requested" | "approved";
  comment: string | null;
  approvalTxHash: string | null;
  reviewedAt: string;
  failedCriteriaJson?: string | null;
};

export type UploadSession = { id: string; checkpoint: "promo" | "final_cut"; status: string; fileName: string; mimeType: string; totalSize: string; receivedSize: string; sha256: string | null };

export type DeliverableSubmission = {
  id: string;
  version: number;
  status: "submitted" | "changes_requested" | "approved";
  proofUrl: string | null;
  checkpoint: "promo" | "final_cut";
  uploadId: string | null;
  upload: UploadSession | null;
  notes: string | null;
  contentHash: string;
  submittedAt: string;
  isLate: boolean;
  approvedTxHash: string | null;
  evidence: DeliverableEvidence[];
  reviews: DeliverableReview[];
};

export type ContractWorkflow = {
  deliveryStatus: string;
  currentStep: "accept_contract" | "submit_promo" | "review_promo" | "revise_promo" | "submit_final_cut" | "review_final_cut" | "revise_final_cut" | "publish" | "retention" | "track_performance" | "completed";
  creatorAction: "accept" | "submit_promo" | "revise_promo" | "submit_final_cut" | "revise_final_cut" | "publish" | null;
  sponsorAction: "review" | null;
  completedSteps: string[];
  remainingSteps: string[];
  latestSubmission: DeliverableSubmission | null;
  inviteId: string | null;
};

export type Participant = {
  id: string;
  role: string;
  walletAddress: string;
  handle: string | null;
  displayName: string | null;
};

export type Metric = {
  id: string;
  key: string;
  label: string | null;
};

export type Payout = {
  id: string;
  kind: string;
  label: string;
  amount: string;
  status: string;
  releasedAt: string | null;
  releasedTxHash: string | null;
  condition: {
    operator: string;
    threshold: string;
    metric: { key: string; label: string | null };
  } | null;
};

export type Observation = {
  id: string;
  value: string;
  source: string;
  observedAt: string;
  metric: { key: string; label: string | null };
};

export type AgreementContent = {
  id: string;
  provider: SocialProvider;
  status: string;
  publishMode: "api" | "manual" | null;
  publicationPayoutId: string | null;
  retentionPayoutId: string | null;
  measurementStartsAt: string | null;
  measurementEndsAt: string | null;
  retentionEndsAt: string | null;
  socialContent: SocialContent | null;
  observations?: Observation[];
};

export type EnrichedAgreement = {
  id: string;
  title: string | null;
  deliverableDescription: string;
  deadline: string;
  measurementWindowDays: number;
  totalCapAmount: string;
  tokenAddress: string | null;
  status: string;
  termsHash: string | null;
  createdAt: string;
  participants: Participant[];
  metrics: Metric[];
  payouts: Payout[];
  observations: Observation[];
  blockchainRecord: BlockchainRecord | null;
  sponsorProfile: Party | null;
  creatorProfile: Party | null;
  financials: Financials;
  deliverableSubmissions: DeliverableSubmission[];
  uploadSessions: UploadSession[];
  workflow: ContractWorkflow;
  basePayoutAmount: string | null;
  performancePoolAmount: string | null;
  promoRequirements: string | null;
  finalCutRequirements: string | null;
  publicationRequirements: string | null;
  publicationDeadline: string | null;
  retentionDays: number;
  publications: Array<{ id: string; method: string; status: string; youtubeUrl: string | null; fingerprintScore: number | null }>;
  agreementContents: AgreementContent[];
};

export type DeliverableReviewInput = {
  decision: "changes_requested" | "approved";
  comment?: string;
  failedCriteria: string[];
};

export type ContractInvite = {
  id: string;
  status: string;
  createdAt: string;
  acceptedAt: string | null;
  sponsorProfile: SponsorProfile;
  creatorProfile: CreatorProfile;
  agreement: EnrichedAgreement;
};

export type BrandDashboard = {
  sponsor: SponsorProfile;
  totals: DashboardTotals;
  contracts: ContractSummary[];
  pendingInvites: ContractInvite[];
  walletConnected: boolean;
};

export type CreatorDashboard = {
  creator: CreatorProfile;
  totals: DashboardTotals;
  contracts: ContractSummary[];
  pendingInvites: ContractInvite[];
  walletConnected: boolean;
};

export type MetricOption = {
  key: string;
  label: string;
  unit: string;
  description: string;
};

export type ContractBuilder = {
  sponsor: SponsorProfile;
  walletConnected: boolean;
  metrics: MetricOption[];
  token: { symbol: string; decimals: number; address: string | null };
  defaults: {
    measurementWindowDays: number;
    viewMilestones: Array<{ views: string; bonusAmount: string }>;
  };
};

export type MutationResult = {
  releasedPayoutIds: string[];
  agreement: EnrichedAgreement;
};

export type AcceptInviteResult = {
  invite: ContractInvite;
  agreement: EnrichedAgreement;
};

export type CreateContractInput = {
  creatorProfileId: string;
  title: string;
  deliverableDescription: string;
  deadline: string;
  measurementWindowDays: number;
  basePayoutAmount: string;
  totalCapAmount: string;
  viewMilestones: Array<{ views: string | number; bonusAmount: string; metricKey?: string }>;
  metricBonuses: Array<{
    metricKey: string;
    label: string;
    threshold: string;
    bonusAmount: string;
  }>;
  promoRequirements: string;
  finalCutRequirements: string;
  publicationRequirements: string;
  retentionDays: number;
  meteredViews?: { startsAtViews: string; amountPerThousandViews: string; maximumAmount: string };
  platformDeliverables: Array<{ provider: SocialProvider; requirements: string }>;
};

export type MetricObservationInput = {
  metricKey: string;
  value: string;
  source?: string;
};
