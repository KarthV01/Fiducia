import type { PrismaClient } from "@prisma/client";
import type {
  ChainClient,
  ApproveDeliveryInput,
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
  approvedDeliveries: ApproveDeliveryInput[] = [];
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

  async approveDeliveryAndRelease(input: ApproveDeliveryInput) {
    this.approvedDeliveries.push(input);
    this.releasedPayouts.push(input);
    return {
      txHash: `0x${"d".repeat(64)}` as const,
    };
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
  email: string;
  googleSub: string | null;
  name: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
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
  walletAddress: string;
  channelUrl: string | null;
  category: string;
  averageViews: number;
  audience: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
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
  notes: string | null;
  contentHash: string;
  submittedAt: Date;
  isLate: boolean;
  approvedTxHash: string | null;
  createdAt: Date;
  updatedAt: Date;
};

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
  private sponsorProfiles: SponsorProfileRow[] = [];
  private creatorProfiles: CreatorProfileRow[] = [];
  private profileWallets: ProfileWalletRow[] = [];
  private contractInvites: ContractInviteRow[] = [];
  private deliverableSubmissions: DeliverableSubmissionRow[] = [];
  private deliverableEvidence: DeliverableEvidenceRow[] = [];
  private deliverableReviews: DeliverableReviewRow[] = [];

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
        status: data.status ?? "submitted", proofUrl: data.proofUrl!, notes: data.notes ?? null,
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
        email: data.email!,
        googleSub: data.googleSub ?? null,
        name: data.name ?? null,
        avatarUrl: data.avatarUrl ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.users.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
      const row = this.users.find((user) => user.id === where.id);
      if (!row) throw new Error("User not found");
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
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
        walletAddress: data.walletAddress!,
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

  snapshot() {
    return {
      agreements: this.agreements.length,
      users: this.users.length,
      sponsorProfiles: this.sponsorProfiles.length,
      creatorProfiles: this.creatorProfiles.length,
      contractInvites: this.contractInvites.length,
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
      title?: string;
      participants?: {
        some?: {
          role?: string;
          walletAddress?: string;
        };
      };
    };

    if (typed.title && agreement.title !== typed.title) {
      return false;
    }

    const participantFilter = typed.participants?.some;
    if (participantFilter) {
      return this.participants.some(
        (participant) =>
          participant.agreementId === agreement.id &&
          (!participantFilter.role || participant.role === participantFilter.role) &&
          (!participantFilter.walletAddress ||
            participant.walletAddress.toLowerCase() === participantFilter.walletAddress.toLowerCase()),
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
      blockchainRecord: this.blockchainRecords.find((record) => record.agreementId === id) ?? null,
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
    };
  }
}
