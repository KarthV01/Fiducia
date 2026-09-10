export type AuthUser = {
  id: string;
  email: string;
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

export type CreatorProfile = {
  id: string;
  handle: string;
  displayName: string;
  walletAddress: string;
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
};

export type DeliverableSubmission = {
  id: string;
  version: number;
  status: "submitted" | "changes_requested" | "approved";
  proofUrl: string;
  notes: string | null;
  contentHash: string;
  submittedAt: string;
  isLate: boolean;
  approvedTxHash: string | null;
  evidence: DeliverableEvidence[];
  reviews: DeliverableReview[];
};

export type ContractWorkflow = {
  deliveryStatus: "awaiting_submission" | "in_review" | "changes_requested" | "approved";
  currentStep: "accept_contract" | "submit_deliverable" | "review_deliverable" | "revise_deliverable" | "track_performance" | "completed";
  creatorAction: "accept" | "submit" | "revise" | null;
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
  workflow: ContractWorkflow;
};

export type DeliverableSubmissionInput = {
  proofUrl: string;
  notes?: string;
  evidence: Array<{ url: string; label?: string }>;
  attested: true;
};

export type DeliverableReviewInput = {
  decision: "changes_requested" | "approved";
  comment?: string;
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
};

export type CreatorDashboard = {
  creator: CreatorProfile;
  totals: DashboardTotals;
  contracts: ContractSummary[];
  pendingInvites: ContractInvite[];
};

export type MetricOption = {
  key: string;
  label: string;
  unit: string;
  description: string;
};

export type ContractBuilder = {
  sponsor: SponsorProfile;
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
  viewMilestones: Array<{ views: string | number; bonusAmount: string }>;
  metricBonuses: Array<{
    metricKey: string;
    label: string;
    threshold: string;
    bonusAmount: string;
  }>;
};

export type MetricObservationInput = {
  metricKey: string;
  value: string;
  source?: string;
};
