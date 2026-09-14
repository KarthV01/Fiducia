import type { PrismaClient } from "@prisma/client";
import { queryRows } from "./queryRows.js";
import type {
  ChainClient,
  ApproveCheckpointInput,
  CreateEscrowInput,
  PrepareLocalSponsorWalletInput,
  ReleasePayoutInput,
} from "../../src/blockchain/client.js";

export class FakeChainClient implements ChainClient {
  chainId = 31337;
  escrowAddress = "0x3333333333333333333333333333333333333333" as const;
  defaultTokenAddress = "0x4444444444444444444444444444444444444444" as const;
  createdEscrows: CreateEscrowInput[] = [];
  releasedPayouts: ReleasePayoutInput[] = [];
  approvedDeliveries: ApproveCheckpointInput[] = [];
  preparedSponsorWallets: PrepareLocalSponsorWalletInput[] = [];

  async prepareLocalSponsorWallet(input: PrepareLocalSponsorWalletInput) {
    this.preparedSponsorWallets.push(input);
  }

  async createEscrow(input: CreateEscrowInput) {
    this.createdEscrows.push(input);
    return {
      txHash: `0x${"a".repeat(64)}` as const,
      chainId: this.chainId,
      escrowAddress: this.escrowAddress,
      agreementKey: `0x${"b".repeat(64)}` as const,
    };
  }

  async releasePayout(input: ReleasePayoutInput) {
    this.releasedPayouts.push(input);
    return {
      txHash: `0x${"c".repeat(64)}` as const,
    };
  }

  async approveCheckpointAndRelease(input: ApproveCheckpointInput) {
    this.approvedDeliveries.push(input);
    this.releasedPayouts.push(input);
    return {
      txHash: `0x${"d".repeat(64)}` as const,
    };
  }

  async recordPublicationAndRelease(input: Omit<ApproveCheckpointInput, "checkpoint"> & { refundAfter: number }) {
    this.releasedPayouts.push(input);
    return { txHash: `0x${"e".repeat(64)}` as const };
  }

  async refundRemaining(_agreementId: string) {
    return { txHash: `0x${"f".repeat(64)}` as const };
  }
}

type AgreementRow = {
  id: string;
  title: string | null;
  deliverableDescription: string;
  deadline: Date;
  measurementWindowDays: number;
  totalCapAmount: string;
  tokenAddress: string | null;
  status: string;
  termsHash: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ParticipantRow = {
  id: string;
  agreementId: string;
  role: string;
  walletAddress: string;
  handle: string | null;
  displayName: string | null;
  createdAt: Date;
};

type MetricRow = {
  id: string;
  agreementId: string;
  key: string;
  label: string | null;
  createdAt: Date;
};

type ConditionRow = {
  id: string;
  payoutId: string;
  metricId: string;
  operator: string;
  threshold: string;
};

type PayoutRow = {
  id: string;
  agreementId: string;
  kind: string;
  label: string;
  amount: string;
  status: string;
  releasedAt: Date | null;
  releasedTxHash: string | null;
  createdAt: Date;
};

type ObservationRow = {
  id: string;
  agreementId: string;
  metricId: string;
  value: string;
  source: string;
  observedAt: Date;
  createdAt: Date;
};

type BlockchainRecordRow = {
  id: string;
  agreementId: string;
  chainId: number;
  escrowAddress: string;
  agreementKey: string;
  tokenAddress: string;
  totalCapAmount: string;
  termsHash: string;
  createTxHash: string;
  createdAt: Date;
};

type UserRow = {
  id: string;
  email: string | null;
  googleSub: string | null;
  name: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type AuthIdentityRow = {
  id: string; userId: string; provider: string; providerSubject: string; email: string | null;
  walletAddress: string | null; lastChainId: number | null; verifiedAt: Date; revokedAt: Date | null; createdAt: Date; updatedAt: Date;
};

type WalletChallengeRow = {
  id: string; purpose: string; address: string; chainId: number; nonce: string; messageHash: string;
  userId: string | null; profileId: string | null; expiresAt: Date; usedAt: Date | null; attempts: number; createdAt: Date;
};

type AuthSessionRow = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
};

type SponsorProfileRow = {
  id: string;
  userId: string;
  name: string;
  handle: string;
  walletAddress: string;
  industry: string;
  websiteUrl: string | null;
  logoUrl: string | null;
  monthlyBudgetAmount: string;
  createdAt: Date;
  updatedAt: Date;
};

type CreatorProfileRow = {
  id: string;
  userId: string;
  handle: string;
  displayName: string;
  walletAddress: string | null;
  channelUrl: string | null;
  category: string;
  averageViews: number;
  audience: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type CreatorWalletConnectionRow = {
  id: string; creatorProfileId: string; authIdentityId: string | null; address: string; addressKey: string;
  source: string; isPrimary: boolean; verifiedAt: Date | null; revokedAt: Date | null; createdAt: Date; updatedAt: Date;
};

type ProfileWalletRow = {
  id: string;
  profileType: string;
  profileId: string;
  walletAddress: string;
  privateKey: string;
  provisionedAt: Date | null;
  createdAt: Date;
};

type SocialIdentityRow = {
  id: string;
  userId: string;
  profileType: string;
  sponsorProfileId: string | null;
  creatorProfileId: string | null;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  descriptor: string | null;
  searchText: string;
  readReceiptsEnabled: boolean;
  typingIndicatorsEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type ConnectionRow = {
  id: string;
  pairKey: string;
  requesterId: string;
  recipientId: string;
  status: string;
  note: string | null;
  respondedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ProfileBlockRow = { id: string; blockerId: string; blockedId: string; createdAt: Date };

type ContractInviteRow = {
  id: string;
  sponsorProfileId: string;
  creatorProfileId: string;
  agreementId: string;
  status: string;
  acceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type DeliverableSubmissionRow = {
  id: string;
  agreementId: string;
  creatorProfileId: string;
  version: number;
  status: string;
  proofUrl: string;
  checkpoint: string;
  uploadId: string | null;
  notes: string | null;
  contentHash: string;
  submittedAt: Date;
  isLate: boolean;
  approvedTxHash: string | null;
  createdAt: Date;
  updatedAt: Date;
};
type UploadSessionRow = { id: string; agreementId: string; creatorProfileId: string; checkpoint: string; status: string; fileName: string; mimeType: string; totalSize: string; receivedSize: string; storageKey: string; sha256: string | null; createdAt: Date; updatedAt: Date };

type DeliverableEvidenceRow = { id: string; submissionId: string; url: string; label: string | null; position: number; createdAt: Date };
type DeliverableReviewRow = { id: string; submissionId: string; sponsorProfileId: string; decision: string; comment: string | null; approvalTxHash: string | null; reviewedAt: Date };

export class FakePrisma {
  private sequence = 0;
  private agreements: AgreementRow[] = [];
  private participants: ParticipantRow[] = [];
  private metrics: MetricRow[] = [];
  private conditions: ConditionRow[] = [];
  private payouts: PayoutRow[] = [];
  private observations: ObservationRow[] = [];
  private blockchainRecords: BlockchainRecordRow[] = [];
  private users: UserRow[] = [];
  private authSessions: AuthSessionRow[] = [];
  private authIdentities: AuthIdentityRow[] = [];
  private walletChallenges: WalletChallengeRow[] = [];
  private sponsorProfiles: SponsorProfileRow[] = [];
  private creatorProfiles: CreatorProfileRow[] = [];
  private creatorWalletConnections: CreatorWalletConnectionRow[] = [];
  private profileWallets: ProfileWalletRow[] = [];
  private socialIdentities: SocialIdentityRow[] = [];
  private connections: ConnectionRow[] = [];
  private profileBlocks: ProfileBlockRow[] = [];
  private conversations: Array<any> = [];
  private conversationParticipants: Array<any> = [];
  private messages: Array<any> = [];
  private messageReactions: Array<any> = [];
  private messageAttachments: Array<any> = [];
  private profileReports: Array<any> = [];
  private contractInvites: ContractInviteRow[] = [];
  private deliverableSubmissions: DeliverableSubmissionRow[] = [];
  private deliverableEvidence: DeliverableEvidenceRow[] = [];
  private deliverableReviews: DeliverableReviewRow[] = [];
  private uploadSessions: UploadSessionRow[] = [];
  private performanceRules: Array<Record<string, unknown>> = [];
  private chainOperations: Array<Record<string, unknown>> = [];

  agreement = {
    create: async ({ data }: { data: Partial<AgreementRow> }) => {
      const now = new Date();
      const row: AgreementRow = {
        id: data.id ?? this.id("agreement"),
        title: data.title ?? null,
        deliverableDescription: data.deliverableDescription!,
        deadline: data.deadline!,
        measurementWindowDays: data.measurementWindowDays!,
        totalCapAmount: data.totalCapAmount!,
        tokenAddress: data.tokenAddress ?? null,
        status: data.status ?? "draft",
        termsHash: data.termsHash ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.agreements.push(row);
      return row;
    },
    findUnique: async ({ where }: { where: { id: string } }) => this.hydrateAgreement(where.id),
    findMany: async (args?: { where?: unknown }) => {
      const matching = this.agreements.filter((agreement) => this.matchesAgreementWhere(agreement, args?.where));
      return matching
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((agreement) => this.hydrateAgreement(agreement.id)!);
    },
    findFirst: async (args?: { where?: unknown }) => {
      const matching = this.agreements.find((agreement) => this.matchesAgreementWhere(agreement, args?.where));
      return matching ? this.hydrateAgreement(matching.id) : null;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<AgreementRow> }) => {
      const row = this.agreements.find((agreement) => agreement.id === where.id);
      if (!row) throw new Error("Agreement not found");
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
  };

  participant = {
    createMany: async ({ data }: { data: Array<Partial<ParticipantRow>> }) => {
      for (const input of data) {
        this.participants.push({
          id: this.id("participant"),
          agreementId: input.agreementId!,
          role: input.role!,
          walletAddress: input.walletAddress!,
          handle: input.handle ?? null,
          displayName: input.displayName ?? null,
          createdAt: new Date(),
        });
      }
      return { count: data.length };
    },
  };

  metric = {
    create: async ({ data }: { data: Partial<MetricRow> }) => {
      const row: MetricRow = {
        id: this.id("metric"),
        agreementId: data.agreementId!,
        key: data.key!,
        label: data.label ?? null,
        createdAt: new Date(),
      };
      this.metrics.push(row);
      return row;
    },
  };

  payout = {
    create: async ({ data }: { data: Partial<PayoutRow> & { condition?: { create: Partial<ConditionRow> } } }) => {
      const row: PayoutRow = {
        id: this.id("payout"),
        agreementId: data.agreementId!,
        kind: data.kind!,
        label: data.label!,
        amount: data.amount!,
        status: data.status ?? "pending",
        releasedAt: null,
        releasedTxHash: null,
        createdAt: new Date(),
      };
      this.payouts.push(row);

      if (data.condition) {
        this.conditions.push({
          id: this.id("condition"),
          payoutId: row.id,
          metricId: data.condition.create.metricId!,
          operator: data.condition.create.operator!,
          threshold: data.condition.create.threshold!,
        });
      }

      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<PayoutRow> }) => {
      const row = this.payouts.find((payout) => payout.id === where.id);
      if (!row) throw new Error("Payout not found");
      Object.assign(row, data);
      return row;
    },
  };

  metricObservation = {
    create: async ({ data }: { data: Partial<ObservationRow> }) => {
      const row: ObservationRow = {
        id: this.id("observation"),
        agreementId: data.agreementId!,
        metricId: data.metricId!,
        value: data.value!,
        source: data.source!,
        observedAt: data.observedAt ?? new Date(),
        createdAt: new Date(),
      };
      this.observations.push(row);
      return row;
    },
  };

  deliverableSubmission = {
    create: async ({ data }: { data: Partial<DeliverableSubmissionRow> & { evidence?: { create: Array<{ url: string; label?: string; position: number }> } } }) => {
      const now = new Date();
      const row: DeliverableSubmissionRow = {
        id: data.id!, agreementId: data.agreementId!, creatorProfileId: data.creatorProfileId!, version: data.version!,
        status: data.status ?? "submitted", proofUrl: data.proofUrl!, checkpoint: data.checkpoint ?? "promo", uploadId: data.uploadId ?? null, notes: data.notes ?? null,
        contentHash: data.contentHash!, submittedAt: data.submittedAt ?? now, isLate: data.isLate ?? false,
        approvedTxHash: data.approvedTxHash ?? null, createdAt: now, updatedAt: now,
      };
      this.deliverableSubmissions.push(row);
      for (const evidence of data.evidence?.create ?? []) {
        this.deliverableEvidence.push({ id: this.id("evidence"), submissionId: row.id, url: evidence.url, label: evidence.label ?? null, position: evidence.position, createdAt: now });
      }
      return this.hydrateSubmission(row);
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<DeliverableSubmissionRow> }) => {
      const row = this.deliverableSubmissions.find((item) => item.id === where.id);
      if (!row) throw new Error("Submission not found");
      Object.assign(row, data, { updatedAt: new Date() });
      return this.hydrateSubmission(row);
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      const row = this.deliverableSubmissions.find((item) => item.id === where.id);
      return row ? this.hydrateSubmission(row) : null;
    },
  };

  uploadSession = {
    create: async ({ data }: { data: Partial<UploadSessionRow> }) => {
      const now = new Date();
      const row: UploadSessionRow = { id: data.id!, agreementId: data.agreementId!, creatorProfileId: data.creatorProfileId!, checkpoint: data.checkpoint!, status: data.status ?? "uploading", fileName: data.fileName!, mimeType: data.mimeType!, totalSize: data.totalSize!, receivedSize: data.receivedSize ?? "0", storageKey: data.storageKey!, sha256: data.sha256 ?? null, createdAt: now, updatedAt: now };
      this.uploadSessions.push(row);
      return row;
    },
    findUnique: async ({ where }: { where: { id: string } }) => this.uploadSessions.find((item) => item.id === where.id) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Partial<UploadSessionRow> }) => {
      const row = this.uploadSessions.find((item) => item.id === where.id);
      if (!row) throw new Error("Upload not found");
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
  };

  deliverableReview = {
    create: async ({ data }: { data: Partial<DeliverableReviewRow> }) => {
      const row: DeliverableReviewRow = {
        id: data.id ?? this.id("review"), submissionId: data.submissionId!, sponsorProfileId: data.sponsorProfileId!,
        decision: data.decision!, comment: data.comment ?? null, approvalTxHash: data.approvalTxHash ?? null,
        reviewedAt: data.reviewedAt ?? new Date(),
      };
      this.deliverableReviews.push(row);
      return row;
    },
  };

  performanceRule = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: this.id("performanceRule"), releasedAmount: "0", createdAt: new Date(), ...data };
      this.performanceRules.push(row);
      return row;
    },
  };

  chainOperation = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = { status: "pending", txHash: null, error: null, createdAt: new Date(), updatedAt: new Date(), ...data };
      this.chainOperations.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = this.chainOperations.find((item) => item.id === where.id);
      if (!row) throw new Error("Chain operation not found");
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
    findUnique: async ({ where }: { where: { idempotencyKey?: string; id?: string } }) => this.chainOperations.find((item) => where.idempotencyKey ? item.idempotencyKey === where.idempotencyKey : item.id === where.id) ?? null,
  };

  blockchainRecord = {
    create: async ({ data }: { data: Partial<BlockchainRecordRow> }) => {
      const row: BlockchainRecordRow = {
        id: this.id("blockchainRecord"),
        agreementId: data.agreementId!,
        chainId: data.chainId!,
        escrowAddress: data.escrowAddress!,
        agreementKey: data.agreementKey!,
        tokenAddress: data.tokenAddress!,
        totalCapAmount: data.totalCapAmount!,
        termsHash: data.termsHash!,
        createTxHash: data.createTxHash!,
        createdAt: new Date(),
      };
      this.blockchainRecords.push(row);
      return row;
    },
  };

  user = {
    findUnique: async ({ where }: { where: Partial<Pick<UserRow, "id" | "email" | "googleSub">> }) =>
      this.users.find(
        (user) =>
          (where.id && user.id === where.id) ||
          (where.email && user.email === where.email) ||
          (where.googleSub && user.googleSub === where.googleSub),
      ) ?? null,
    create: async ({ data }: { data: Partial<UserRow> }) => {
      const now = new Date();
      const row: UserRow = {
        id: data.id ?? this.id("user"),
        email: data.email ?? null,
        googleSub: data.googleSub ?? null,
        name: data.name ?? null,
        avatarUrl: data.avatarUrl ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.users.push(row);
      return row;
    },
    findMany: async ({ where }: { where?: { googleSub?: { not?: null } } } = {}) => this.users.filter((user) => !where?.googleSub?.not || user.googleSub !== null),
    update: async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
      const row = this.users.find((user) => user.id === where.id);
      if (!row) throw new Error("User not found");
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
  };

  authIdentity = {
    findUnique: async ({ where, include }: { where: { provider_providerSubject?: { provider: string; providerSubject: string }; walletAddress?: string }; include?: { user?: boolean } }) => {
      const row = this.authIdentities.find((item) => where.walletAddress ? item.walletAddress === where.walletAddress : item.provider === where.provider_providerSubject?.provider && item.providerSubject === where.provider_providerSubject?.providerSubject);
      return row && include?.user ? { ...row, user: this.users.find((user) => user.id === row.userId)! } : row ?? null;
    },
    create: async ({ data }: { data: Partial<AuthIdentityRow> }) => {
      const now = new Date();
      const row: AuthIdentityRow = { id: data.id ?? this.id("identity"), userId: data.userId!, provider: data.provider!, providerSubject: data.providerSubject!, email: data.email ?? null, walletAddress: data.walletAddress ?? null, lastChainId: data.lastChainId ?? null, verifiedAt: data.verifiedAt ?? now, revokedAt: data.revokedAt ?? null, createdAt: data.createdAt ?? now, updatedAt: data.updatedAt ?? now };
      this.authIdentities.push(row); return row;
    },
    upsert: async ({ where, create, update }: { where: { provider_providerSubject: { provider: string; providerSubject: string } }; create: Partial<AuthIdentityRow>; update: Partial<AuthIdentityRow> }) => {
      const key = where.provider_providerSubject;
      const row = this.authIdentities.find((item) => item.provider === key.provider && item.providerSubject === key.providerSubject);
      if (row) { Object.assign(row, update, { updatedAt: new Date() }); return row; }
      return this.authIdentity.create({ data: create });
    },
    findFirst: async ({ where }: { where: { userId?: string; provider?: string; revokedAt?: null } }) => this.authIdentities.find((item) => (!where.userId || item.userId === where.userId) && (!where.provider || item.provider === where.provider) && (where.revokedAt !== null || item.revokedAt === null)) ?? null,
    count: async ({ where }: { where: { userId?: string; revokedAt?: null; id?: { not: string } } }) => this.authIdentities.filter((item) => (!where.userId || item.userId === where.userId) && (where.revokedAt !== null || item.revokedAt === null) && (!where.id?.not || item.id !== where.id.not)).length,
    update: async ({ where, data }: { where: { id: string }; data: Partial<AuthIdentityRow> }) => {
      const row = this.authIdentities.find((item) => item.id === where.id); if (!row) throw new Error("Auth identity not found"); Object.assign(row, data, { updatedAt: new Date() }); return row;
    },
  };

  walletChallenge = {
    count: async ({ where }: { where: { address: string; createdAt: { gte: Date } } }) => this.walletChallenges.filter((item) => item.address === where.address && item.createdAt >= where.createdAt.gte).length,
    create: async ({ data }: { data: Partial<WalletChallengeRow> }) => {
      const row: WalletChallengeRow = { id: data.id ?? this.id("challenge"), purpose: data.purpose!, address: data.address!, chainId: data.chainId!, nonce: data.nonce!, messageHash: data.messageHash!, userId: data.userId ?? null, profileId: data.profileId ?? null, expiresAt: data.expiresAt!, usedAt: data.usedAt ?? null, attempts: data.attempts ?? 0, createdAt: data.createdAt ?? new Date() };
      this.walletChallenges.push(row); return row;
    },
    findUnique: async ({ where }: { where: { id: string } }) => this.walletChallenges.find((item) => item.id === where.id) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: { attempts?: { increment: number }; usedAt?: Date } }) => {
      const row = this.walletChallenges.find((item) => item.id === where.id); if (!row) throw new Error("Challenge not found");
      if (data.attempts) row.attempts += data.attempts.increment; if (data.usedAt) row.usedAt = data.usedAt; return row;
    },
    updateMany: async ({ where, data }: { where: { id: string; usedAt: null }; data: { usedAt: Date } }) => {
      const row = this.walletChallenges.find((item) => item.id === where.id && item.usedAt === null); if (!row) return { count: 0 }; row.usedAt = data.usedAt; return { count: 1 };
    },
  };

  authSession = {
    create: async ({ data }: { data: Partial<AuthSessionRow> }) => {
      const row: AuthSessionRow = {
        id: data.id ?? this.id("session"),
        userId: data.userId!,
        tokenHash: data.tokenHash!,
        expiresAt: data.expiresAt!,
        createdAt: data.createdAt ?? new Date(),
      };
      this.authSessions.push(row);
      return row;
    },
    findUnique: async ({ where, include }: { where: { tokenHash: string }; include?: { user?: boolean } }) => {
      const row = this.authSessions.find((session) => session.tokenHash === where.tokenHash);
      if (!row) return null;
      return include?.user
        ? { ...row, user: this.users.find((user) => user.id === row.userId)! }
        : row;
    },
    deleteMany: async ({ where }: { where: { tokenHash: string } }) => {
      const before = this.authSessions.length;
      this.authSessions = this.authSessions.filter((session) => session.tokenHash !== where.tokenHash);
      return { count: before - this.authSessions.length };
    },
  };

  sponsorProfile = {
    create: async ({ data }: { data: Partial<SponsorProfileRow> }) => {
      const now = new Date();
      const row: SponsorProfileRow = {
        id: data.id ?? this.id("sponsor"),
        userId: data.userId!,
        name: data.name!,
        handle: data.handle!,
        walletAddress: data.walletAddress!,
        industry: data.industry!,
        websiteUrl: data.websiteUrl ?? null,
        logoUrl: data.logoUrl ?? null,
        monthlyBudgetAmount: data.monthlyBudgetAmount ?? "0",
        createdAt: now,
        updatedAt: now,
      };
      this.sponsorProfiles.push(row);
      return row;
    },
    findUnique: async ({ where }: { where: Partial<Pick<SponsorProfileRow, "id" | "handle">> }) =>
      this.sponsorProfiles.find(
        (profile) => (where.id && profile.id === where.id) || (where.handle && profile.handle === where.handle),
      ) ?? null,
    findMany: async (args?: { where?: Partial<Pick<SponsorProfileRow, "id" | "userId">> }) => {
      const where = args?.where;
      return this.sponsorProfiles
        .filter((profile) => (!where?.id || profile.id === where.id) && (!where?.userId || profile.userId === where.userId))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },
  };

  creatorProfile = {
    create: async ({ data }: { data: Partial<CreatorProfileRow> }) => {
      const now = new Date();
      const row: CreatorProfileRow = {
        id: data.id ?? this.id("creator"),
        userId: data.userId!,
        handle: data.handle!,
        displayName: data.displayName!,
        walletAddress: data.walletAddress ?? null,
        channelUrl: data.channelUrl ?? null,
        category: data.category!,
        averageViews: data.averageViews ?? 0,
        audience: data.audience ?? null,
        avatarUrl: data.avatarUrl ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.creatorProfiles.push(row);
      return row;
    },
    findUnique: async ({ where }: { where: Partial<Pick<CreatorProfileRow, "id" | "handle">> }) =>
      this.creatorProfiles.find(
        (profile) => (where.id && profile.id === where.id) || (where.handle && profile.handle === where.handle),
      ) ?? null,
    findMany: async (args?: { where?: Partial<Pick<CreatorProfileRow, "id" | "userId">>; take?: number }) => {
      const where = args?.where;
      const rows = this.creatorProfiles
        .filter((profile) => (!where?.id || profile.id === where.id) && (!where?.userId || profile.userId === where.userId))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
      return args?.take ? rows.slice(0, args.take) : rows;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<CreatorProfileRow> }) => {
      const row = this.creatorProfiles.find((profile) => profile.id === where.id); if (!row) throw new Error("Creator profile not found"); Object.assign(row, data, { updatedAt: new Date() }); return row;
    },
  };

  creatorWalletConnection = {
    create: async ({ data }: { data: Partial<CreatorWalletConnectionRow> }) => {
      const now = new Date();
      const row: CreatorWalletConnectionRow = { id: data.id ?? this.id("creator_wallet"), creatorProfileId: data.creatorProfileId!, authIdentityId: data.authIdentityId ?? null, address: data.address!, addressKey: data.addressKey!, source: data.source!, isPrimary: data.isPrimary ?? false, verifiedAt: data.verifiedAt ?? null, revokedAt: data.revokedAt ?? null, createdAt: data.createdAt ?? now, updatedAt: data.updatedAt ?? now };
      this.creatorWalletConnections.push(row); return row;
    },
    findUnique: async ({ where }: { where: { id?: string; creatorProfileId_addressKey?: { creatorProfileId: string; addressKey: string } } }) => this.creatorWalletConnections.find((item) => (where.id && item.id === where.id) || (where.creatorProfileId_addressKey && item.creatorProfileId === where.creatorProfileId_addressKey.creatorProfileId && item.addressKey === where.creatorProfileId_addressKey.addressKey)) ?? null,
    findFirst: async ({ where }: { where: any }) => this.creatorWalletConnections.find((item) => (!where.creatorProfileId || item.creatorProfileId === where.creatorProfileId) && (!where.authIdentityId || item.authIdentityId === where.authIdentityId) && (!where.isPrimary || item.isPrimary) && (where.revokedAt !== null || item.revokedAt === null) && (!where.verifiedAt?.not || item.verifiedAt !== null) && (!where.id?.not || item.id !== where.id.not)) ?? null,
    findMany: async ({ where = {}, select }: { where?: any; select?: any } = {}) => this.creatorWalletConnections.filter((item) => (!where.creatorProfileId || item.creatorProfileId === where.creatorProfileId) && (where.revokedAt !== null || item.revokedAt === null)).map((item) => select?.address ? { address: item.address } : item),
    count: async ({ where }: { where: any }) => this.creatorWalletConnections.filter((item) => (!where.creatorProfileId || item.creatorProfileId === where.creatorProfileId) && (!where.authIdentityId || item.authIdentityId === where.authIdentityId) && (!where.id?.not || item.id !== where.id.not) && (where.revokedAt !== null || item.revokedAt === null) && (!where.verifiedAt?.not || item.verifiedAt !== null)).length,
    update: async ({ where, data }: { where: { id: string }; data: Partial<CreatorWalletConnectionRow> }) => { const row = this.creatorWalletConnections.find((item) => item.id === where.id); if (!row) throw new Error("Creator wallet not found"); Object.assign(row, data, { updatedAt: new Date() }); return row; },
    updateMany: async ({ where, data }: { where: any; data: Partial<CreatorWalletConnectionRow> }) => { const rows = this.creatorWalletConnections.filter((item) => !where.creatorProfileId || item.creatorProfileId === where.creatorProfileId); rows.forEach((item) => Object.assign(item, data, { updatedAt: new Date() })); return { count: rows.length }; },
    upsert: async ({ where, create, update }: { where: { creatorProfileId_addressKey: { creatorProfileId: string; addressKey: string } }; create: Partial<CreatorWalletConnectionRow>; update: Partial<CreatorWalletConnectionRow> }) => { const row = await this.creatorWalletConnection.findUnique({ where }); return row ? this.creatorWalletConnection.update({ where: { id: row.id }, data: update }) : this.creatorWalletConnection.create({ data: create }); },
  };

  profileWallet = {
    create: async ({ data }: { data: Partial<ProfileWalletRow> }) => {
      const row: ProfileWalletRow = {
        id: data.id ?? this.id("wallet"),
        profileType: data.profileType!,
        profileId: data.profileId!,
        walletAddress: data.walletAddress!,
        privateKey: data.privateKey!,
        provisionedAt: data.provisionedAt ?? null,
        createdAt: data.createdAt ?? new Date(),
      };
      this.profileWallets.push(row);
      return row;
    },
    findUnique: async ({
      where,
    }: {
      where: { id?: string; profileType_profileId?: { profileType: string; profileId: string } };
    }) =>
      this.profileWallets.find(
        (wallet) =>
          (where.id && wallet.id === where.id) ||
          (where.profileType_profileId &&
            wallet.profileType === where.profileType_profileId.profileType &&
            wallet.profileId === where.profileType_profileId.profileId),
      ) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Partial<ProfileWalletRow> }) => {
      const row = this.profileWallets.find((wallet) => wallet.id === where.id);
      if (!row) throw new Error("Wallet not found");
      Object.assign(row, data);
      return row;
    },
  };

  socialIdentity = {
    create: async ({ data }: { data: Partial<SocialIdentityRow> }) => {
      const now = new Date();
      const row: SocialIdentityRow = {
        id: data.id ?? this.id("identity"), userId: data.userId!, profileType: data.profileType!,
        sponsorProfileId: data.sponsorProfileId ?? null, creatorProfileId: data.creatorProfileId ?? null,
        handle: data.handle!, displayName: data.displayName!, avatarUrl: data.avatarUrl ?? null,
        descriptor: data.descriptor ?? null, searchText: data.searchText!,
        readReceiptsEnabled: data.readReceiptsEnabled ?? true,
        typingIndicatorsEnabled: data.typingIndicatorsEnabled ?? true, createdAt: now, updatedAt: now,
      };
      this.socialIdentities.push(row);
      return row;
    },
    findUnique: async ({ where }: { where: { id?: string; sponsorProfileId?: string; creatorProfileId?: string } }) =>
      this.socialIdentities.find((item) =>
        (where.id && item.id === where.id) ||
        (where.sponsorProfileId && item.sponsorProfileId === where.sponsorProfileId) ||
        (where.creatorProfileId && item.creatorProfileId === where.creatorProfileId)) ?? null,
    findMany: async (args: any = {}) => queryRows(this.socialIdentities, args),
    update: async ({ where, data }: { where: { id: string }; data: Partial<SocialIdentityRow> }) => {
      const row = this.socialIdentities.find((item) => item.id === where.id);
      if (!row) throw new Error("Social identity not found");
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
  };

  connection = {
    create: async ({ data }: { data: Partial<ConnectionRow> }) => {
      const now = new Date();
      const row: ConnectionRow = { id: data.id ?? this.id("connection"), pairKey: data.pairKey!, requesterId: data.requesterId!, recipientId: data.recipientId!, status: data.status ?? "pending", note: data.note ?? null, respondedAt: data.respondedAt ?? null, createdAt: now, updatedAt: now };
      this.connections.push(row);
      return row;
    },
    findUnique: async ({ where }: { where: { id?: string; pairKey?: string } }) => this.connections.find((item) => (where.id && item.id === where.id) || (where.pairKey && item.pairKey === where.pairKey)) ?? null,
    findMany: async () => [...this.connections],
    count: async (args: any = {}) => queryRows(this.connections, args).length,
    update: async ({ where, data }: { where: { id: string }; data: Partial<ConnectionRow> }) => {
      const row = this.connections.find((item) => item.id === where.id);
      if (!row) throw new Error("Connection not found");
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
  };

  profileBlock = {
    create: async ({ data }: { data: Partial<ProfileBlockRow> }) => {
      const row: ProfileBlockRow = { id: data.id ?? this.id("block"), blockerId: data.blockerId!, blockedId: data.blockedId!, createdAt: new Date() };
      this.profileBlocks.push(row);
      return row;
    },
    findFirst: async ({ where }: { where: { OR?: Array<{ blockerId: string; blockedId: string }> } }) => this.profileBlocks.find((item) => where.OR?.some((pair) => pair.blockerId === item.blockerId && pair.blockedId === item.blockedId)) ?? null,
    findUnique: async ({ where }: { where: { blockerId_blockedId: { blockerId: string; blockedId: string } } }) => this.profileBlocks.find((item) => item.blockerId === where.blockerId_blockedId.blockerId && item.blockedId === where.blockerId_blockedId.blockedId) ?? null,
    findMany: async () => [...this.profileBlocks],
    deleteMany: async ({ where }: { where: { blockerId: string; blockedId: string } }) => {
      const before = this.profileBlocks.length;
      this.profileBlocks = this.profileBlocks.filter((item) => item.blockerId !== where.blockerId || item.blockedId !== where.blockedId);
      return { count: before - this.profileBlocks.length };
    },
  };

  conversation = {
    create: async ({ data }: { data: any }) => {
      const now = new Date();
      const row = { id: data.id ?? this.id("conversation"), type: data.type, title: data.title ?? null, directPairKey: data.directPairKey ?? null, createdById: data.createdById, lastMessageAt: data.lastMessageAt ?? null, createdAt: now, updatedAt: now };
      this.conversations.push(row);
      for (const participant of data.participants?.create ?? []) await this.conversationParticipant.create({ data: { ...participant, conversationId: row.id } });
      return row;
    },
    findUnique: async ({ where, include }: { where: any; include?: any }) => {
      const row = this.conversations.find((item) => (where.id && item.id === where.id) || (where.directPairKey && item.directPairKey === where.directPairKey));
      return row && include ? this.hydrateConversation(row) : row ?? null;
    },
    update: async ({ where, data }: { where: { id: string }; data: any }) => {
      const row = this.conversations.find((item) => item.id === where.id);
      if (!row) throw new Error("Conversation not found");
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
  };

  conversationParticipant = {
    create: async ({ data }: { data: any }) => {
      const now = new Date();
      const row = { id: data.id ?? this.id("member"), conversationId: data.conversationId, identityId: data.identityId, role: data.role ?? "member", joinedAt: data.joinedAt ?? now, leftAt: data.leftAt ?? null, lastReadAt: data.lastReadAt ?? null, archivedAt: data.archivedAt ?? null, starredAt: data.starredAt ?? null, mutedUntil: data.mutedUntil ?? null, draftText: data.draftText ?? null, createdAt: now, updatedAt: now };
      this.conversationParticipants.push(row);
      return row;
    },
    findUnique: async ({ where }: { where: any }) => this.conversationParticipants.find((item) => item.conversationId === where.conversationId_identityId?.conversationId && item.identityId === where.conversationId_identityId?.identityId) ?? null,
    findFirst: async ({ where }: { where: any }) => this.conversationParticipants.find((item) => item.conversationId === where.conversationId && (typeof where.identityId === "string" ? item.identityId === where.identityId : item.identityId !== where.identityId?.not) && (!Object.hasOwn(where, "leftAt") || item.leftAt === where.leftAt)) ?? null,
    findMany: async (args: any) => queryRows(this.conversationParticipants.map((item) => ({ ...item, identity: this.socialIdentities.find((identity) => identity.id === item.identityId), conversation: this.hydrateConversation(this.conversations.find((conversation) => conversation.id === item.conversationId)) })), args),
    update: async ({ where, data }: { where: { id: string }; data: any }) => {
      const row = this.conversationParticipants.find((item) => item.id === where.id);
      if (!row) throw new Error("Participant not found");
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
    upsert: async ({ where, create, update }: { where: any; create: any; update: any }) => {
      const existing = await this.conversationParticipant.findUnique({ where });
      return existing ? this.conversationParticipant.update({ where: { id: existing.id }, data: update }) : this.conversationParticipant.create({ data: create });
    },
  };

  message = {
    findFirst: async (args: any) => queryRows(this.messages, args)[0] ?? null,
    groupBy: async (args: any) => {
      const counts = new Map<string, number>();
      for (const row of queryRows(this.messages, args)) counts.set(row.conversationId, (counts.get(row.conversationId) ?? 0) + 1);
      return [...counts].map(([conversationId, count]) => ({ conversationId, _count: { _all: count } }));
    },
    create: async ({ data }: { data: any }) => {
      const now = data.createdAt ?? new Date();
      const row = { id: data.id ?? this.id("message"), conversationId: data.conversationId, senderId: data.senderId, clientMessageId: data.clientMessageId, type: data.type ?? "user", body: data.body ?? null, replyToId: data.replyToId ?? null, editedAt: data.editedAt ?? null, deletedAt: data.deletedAt ?? null, createdAt: now, updatedAt: now };
      this.messages.push(row);
      return row;
    },
    findUnique: async ({ where, include }: { where: any; include?: any }) => {
      const row = this.messages.find((item) => (where.id && item.id === where.id) || (where.senderId_clientMessageId && item.senderId === where.senderId_clientMessageId.senderId && item.clientMessageId === where.senderId_clientMessageId.clientMessageId));
      return row && include ? this.hydrateMessage(row) : row ?? null;
    },
    findMany: async ({ where, take, cursor, skip, select }: { where: any; take?: number; cursor?: any; skip?: number; select?: any }) => {
      let rows = this.messages.filter((item) => (!where.conversationId || item.conversationId === where.conversationId) && (!where.body?.contains || item.body?.toLowerCase().includes(where.body.contains.toLowerCase()))).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      if (cursor?.id) rows = rows.slice(Math.max(0, rows.findIndex((item) => item.id === cursor.id) + (skip ?? 0)));
      return rows.slice(0, take ?? rows.length).map((item) => select ? { conversationId: item.conversationId } : this.hydrateMessage(item));
    },
    count: async ({ where }: { where: any }) => this.messages.filter((item) => (!where.conversationId || item.conversationId === where.conversationId) && (!where.senderId || (typeof where.senderId === "string" ? item.senderId === where.senderId : item.senderId !== where.senderId.not)) && (!where.createdAt?.gt || item.createdAt > where.createdAt.gt) && (!where.createdAt?.gte || item.createdAt >= where.createdAt.gte)).length,
    update: async ({ where, data, include }: { where: { id: string }; data: any; include?: any }) => {
      const row = this.messages.find((item) => item.id === where.id);
      if (!row) throw new Error("Message not found");
      Object.assign(row, data, { updatedAt: new Date() });
      return include ? this.hydrateMessage(row) : row;
    },
  };

  messageReaction = {
    findUnique: async ({ where }: { where: any }) => this.messageReactions.find((item) => item.messageId === where.messageId_identityId_emoji.messageId && item.identityId === where.messageId_identityId_emoji.identityId && item.emoji === where.messageId_identityId_emoji.emoji) ?? null,
    create: async ({ data }: { data: any }) => { const row = { id: this.id("reaction"), ...data, createdAt: new Date() }; this.messageReactions.push(row); return row; },
    delete: async ({ where }: { where: { id: string } }) => { const row = this.messageReactions.find((item) => item.id === where.id); this.messageReactions = this.messageReactions.filter((item) => item.id !== where.id); return row; },
  };

  messageAttachment = {
    create: async ({ data }: { data: any }) => { const now = new Date(); const row = { messageId: null, status: "uploading", receivedSize: 0, sha256: null, createdAt: now, updatedAt: now, ...data }; this.messageAttachments.push(row); return row; },
    findUnique: async ({ where }: { where: { id: string } }) => this.messageAttachments.find((item) => item.id === where.id) ?? null,
    findMany: async ({ where }: { where: any }) => this.messageAttachments.filter((item) => (!where.id?.in || where.id.in.includes(item.id)) && (!where.conversationId || item.conversationId === where.conversationId) && (!where.uploaderId || item.uploaderId === where.uploaderId) && (where.messageId !== null || item.messageId === null) && (!where.status || item.status === where.status)),
    update: async ({ where, data }: { where: { id: string }; data: any }) => { const row = this.messageAttachments.find((item) => item.id === where.id); if (!row) throw new Error("Attachment not found"); Object.assign(row, data, { updatedAt: new Date() }); return row; },
    updateMany: async ({ where, data }: { where: any; data: any }) => { const rows = this.messageAttachments.filter((item) => where.id.in.includes(item.id)); rows.forEach((item) => Object.assign(item, data)); return { count: rows.length }; },
  };

  profileReport = { create: async ({ data }: { data: any }) => { const now = new Date(); const row = { id: this.id("report"), status: "open", createdAt: now, updatedAt: now, ...data }; this.profileReports.push(row); return row; } };

  contractInvite = {
    create: async ({
      data,
      include,
    }: {
      data: Partial<ContractInviteRow>;
      include?: { sponsorProfile?: boolean; creatorProfile?: boolean; agreement?: unknown };
    }) => {
      const now = new Date();
      const row: ContractInviteRow = {
        id: data.id ?? this.id("invite"),
        sponsorProfileId: data.sponsorProfileId!,
        creatorProfileId: data.creatorProfileId!,
        agreementId: data.agreementId!,
        status: data.status ?? "pending",
        acceptedAt: data.acceptedAt ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.contractInvites.push(row);
      return this.hydrateInvite(row, include);
    },
    findUnique: async ({
      where,
      include,
    }: {
      where: { id?: string; agreementId?: string };
      include?: { sponsorProfile?: boolean; creatorProfile?: boolean; agreement?: unknown };
    }) => {
      const row =
        this.contractInvites.find(
          (invite) => (where.id && invite.id === where.id) || (where.agreementId && invite.agreementId === where.agreementId),
        ) ?? null;
      return row ? this.hydrateInvite(row, include) : null;
    },
    findMany: async ({
      where,
      include,
    }: {
      where?: Partial<Pick<ContractInviteRow, "sponsorProfileId" | "creatorProfileId" | "status">>;
      include?: { sponsorProfile?: boolean; creatorProfile?: boolean; agreement?: unknown };
    }) =>
      this.contractInvites
        .filter(
          (invite) =>
            (!where?.sponsorProfileId || invite.sponsorProfileId === where.sponsorProfileId) &&
            (!where?.creatorProfileId || invite.creatorProfileId === where.creatorProfileId) &&
            (!where?.status || invite.status === where.status),
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((invite) => this.hydrateInvite(invite, include)),
    update: async ({
      where,
      data,
      include,
    }: {
      where: { id: string };
      data: Partial<ContractInviteRow>;
      include?: { sponsorProfile?: boolean; creatorProfile?: boolean; agreement?: unknown };
    }) => {
      const row = this.contractInvites.find((invite) => invite.id === where.id);
      if (!row) throw new Error("Invite not found");
      Object.assign(row, data, { updatedAt: new Date() });
      return this.hydrateInvite(row, include);
    },
  };

  async $transaction<T>(work: ((tx: this) => Promise<T>) | Array<Promise<unknown>>): Promise<T> {
    if (typeof work === "function") {
      return work(this);
    }

    return Promise.all(work) as Promise<T>;
  }

  async $disconnect() {
    return undefined;
  }

  asPrisma(): PrismaClient {
    return this as unknown as PrismaClient;
  }

  expireWalletChallenge(id: string) {
    const challenge = this.walletChallenges.find((item) => item.id === id);
    if (challenge) challenge.expiresAt = new Date(0);
  }

  snapshot() {
    return {
      agreements: this.agreements.length,
      users: this.users.length,
      sponsorProfiles: this.sponsorProfiles.length,
      creatorProfiles: this.creatorProfiles.length,
      contractInvites: this.contractInvites.length,
    };
  }

  private hydrateMessage(message: any): any {
    const sender = this.socialIdentities.find((identity) => identity.id === message.senderId)!;
    const reply = message.replyToId ? this.messages.find((item) => item.id === message.replyToId) : null;
    return {
      ...message,
      sender,
      attachments: this.messageAttachments.filter((item) => item.messageId === message.id),
      reactions: this.messageReactions.filter((item) => item.messageId === message.id),
      replyTo: reply ? { ...reply, sender: this.socialIdentities.find((identity) => identity.id === reply.senderId)! } : null,
    };
  }

  private hydrateConversation(conversation: any): any {
    return {
      ...conversation,
      participants: this.conversationParticipants
        .filter((item) => item.conversationId === conversation.id && !item.leftAt)
        .map((item) => ({ ...item, identity: this.socialIdentities.find((identity) => identity.id === item.identityId)! })),
      messages: this.messages
        .filter((item) => item.conversationId === conversation.id)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 1)
        .map((item) => this.hydrateMessage(item)),
    };
  }

  private id(prefix: string): string {
    this.sequence += 1;
    return `${prefix}_${this.sequence}`;
  }

  private matchesAgreementWhere(agreement: AgreementRow, where: unknown): boolean {
    if (!where || typeof where !== "object") {
      return true;
    }

    const typed = where as {
      OR?: unknown[];
      title?: string;
      contractInvite?: { is?: { creatorProfileId?: string } };
      participants?: {
        some?: {
          role?: string;
          walletAddress?: string | { in: string[] };
        };
      };
    };

    if (typed.OR) return typed.OR.some((part) => this.matchesAgreementWhere(agreement, part));
    if (typed.contractInvite?.is?.creatorProfileId) {
      return this.contractInvites.some((invite) => invite.agreementId === agreement.id && invite.creatorProfileId === typed.contractInvite!.is!.creatorProfileId);
    }

    if (typed.title && agreement.title !== typed.title) {
      return false;
    }

    const participantFilter = typed.participants?.some;
    if (participantFilter) {
      return this.participants.some(
        (participant) =>
          participant.agreementId === agreement.id &&
          (!participantFilter.role || participant.role === participantFilter.role) &&
          (!participantFilter.walletAddress || (typeof participantFilter.walletAddress === "string"
            ? participant.walletAddress.toLowerCase() === participantFilter.walletAddress.toLowerCase()
            : participantFilter.walletAddress.in.some((address) => address.toLowerCase() === participant.walletAddress.toLowerCase()))),
      );
    }

    return true;
  }

  private hydrateInvite(
    invite: ContractInviteRow,
    include?: { sponsorProfile?: boolean; creatorProfile?: boolean; agreement?: unknown },
  ) {
    return {
      ...invite,
      ...(include?.sponsorProfile
        ? { sponsorProfile: this.sponsorProfiles.find((profile) => profile.id === invite.sponsorProfileId)! }
        : {}),
      ...(include?.creatorProfile
        ? { creatorProfile: this.creatorProfiles.find((profile) => profile.id === invite.creatorProfileId)! }
        : {}),
      ...(include?.agreement ? { agreement: this.hydrateAgreement(invite.agreementId)! } : {}),
    };
  }

  private hydrateAgreement(id: string) {
    const agreement = this.agreements.find((candidate) => candidate.id === id);
    if (!agreement) return null;

    const metrics = this.metrics
      .filter((metric) => metric.agreementId === id)
      .sort((a, b) => a.key.localeCompare(b.key));

    const payouts = this.payouts
      .filter((payout) => payout.agreementId === id)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((payout) => {
        const condition = this.conditions.find((candidate) => candidate.payoutId === payout.id);
        const metric = condition ? this.metrics.find((candidate) => candidate.id === condition.metricId)! : undefined;
        return {
          ...payout,
          condition: condition
            ? {
                ...condition,
                metric,
              }
            : null,
        };
      });

    const observations = this.observations
      .filter((observation) => observation.agreementId === id)
      .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())
      .map((observation) => ({
        ...observation,
        metric: this.metrics.find((metric) => metric.id === observation.metricId)!,
      }));

    return {
      ...agreement,
      participants: this.participants
        .filter((participant) => participant.agreementId === id)
        .sort((a, b) => a.role.localeCompare(b.role)),
      metrics,
      payouts,
      observations,
      deliverableSubmissions: this.deliverableSubmissions
        .filter((submission) => submission.agreementId === id)
        .sort((a, b) => b.version - a.version)
        .map((submission) => this.hydrateSubmission(submission)),
      uploadSessions: this.uploadSessions.filter((upload) => upload.agreementId === id),
      publications: [],
      performanceRules: this.performanceRules.filter((rule) => rule.agreementId === id),
      chainOperations: this.chainOperations.filter((operation) => operation.agreementId === id),
      blockchainRecord: this.blockchainRecords.find((record) => record.agreementId === id) ?? null,
      contractInvite: this.contractInvites.find((invite) => invite.agreementId === id) ?? null,
    };
  }

  private hydrateSubmission(submission: DeliverableSubmissionRow) {
    return {
      ...submission,
      evidence: this.deliverableEvidence
        .filter((item) => item.submissionId === submission.id)
        .sort((a, b) => a.position - b.position),
      reviews: this.deliverableReviews
        .filter((item) => item.submissionId === submission.id)
        .sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime()),
      upload: submission.uploadId ? this.uploadSessions.find((upload) => upload.id === submission.uploadId) ?? null : null,
    };
  }
}
