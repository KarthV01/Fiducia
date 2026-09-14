import type { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { Hex } from "viem";
import type { ChainClient } from "../blockchain/client.js";
import { AGREEMENT_STATUS, PARTICIPANT_ROLE, PAYOUT_KIND, PAYOUT_STATUS } from "../domain/status.js";
import { buildTermsSnapshot, hashTerms, type AgreementTermsSource } from "../domain/termsHash.js";
import { conditionIsSatisfied } from "../domain/payoutEvaluator.js";
import type { CreateAgreementInput, MetricObservationInput } from "../domain/validation.js";
import { conflict, notFound, serviceUnavailable } from "../http/errors.js";
import { agreementKey } from "../blockchain/ids.js";

export const agreementInclude = {
  participants: {
    orderBy: {
      role: "asc",
    },
  },
  metrics: {
    orderBy: {
      key: "asc",
    },
  },
  payouts: {
    orderBy: {
      createdAt: "asc",
    },
    include: {
      condition: {
        include: {
          metric: true,
        },
      },
    },
  },
  observations: {
    orderBy: {
      observedAt: "desc",
    },
    include: {
      metric: true,
    },
  },
  blockchainRecord: true,
  contractInvite: true,
  deliverableSubmissions: {
    orderBy: { version: "desc" },
    include: {
      evidence: { orderBy: { position: "asc" } },
      reviews: { orderBy: { reviewedAt: "asc" } },
      upload: true,
    },
  },
  uploadSessions: { orderBy: { createdAt: "desc" } },
  publications: { orderBy: { createdAt: "desc" } },
  performanceRules: true,
  chainOperations: { orderBy: { createdAt: "desc" } },
} satisfies Prisma.AgreementInclude;

export type AgreementView = Prisma.AgreementGetPayload<{
  include: typeof agreementInclude;
}>;

export async function createAgreementFromInput(
  prisma: PrismaClient,
  input: CreateAgreementInput,
): Promise<AgreementView> {
  const metricKeys = Array.from(
    new Set(input.payouts.flatMap((payout) => (payout.condition ? [payout.condition.metricKey] : []))),
  );

  const agreement = await prisma.$transaction(async (tx) => {
    const created = await tx.agreement.create({
      data: {
        title: input.title,
        deliverableDescription: input.deliverableDescription,
        deadline: new Date(input.deadline),
        measurementWindowDays: input.measurementWindowDays,
        totalCapAmount: input.totalCapAmount,
        tokenAddress: input.tokenAddress,
        status: AGREEMENT_STATUS.draft,
        basePayoutAmount: input.basePayoutAmount,
        performancePoolAmount: input.performancePoolAmount,
        promoRequirements: input.promoRequirements,
        finalCutRequirements: input.finalCutRequirements,
        publicationRequirements: input.publicationRequirements,
        publicationDeadline: input.publicationDeadline ? new Date(input.publicationDeadline) : undefined,
        retentionDays: input.retentionDays,
      },
    });

    await tx.participant.createMany({
      data: [
        {
          agreementId: created.id,
          role: PARTICIPANT_ROLE.brand,
          walletAddress: input.participants.brand.walletAddress,
          handle: input.participants.brand.handle,
          displayName: input.participants.brand.displayName,
        },
        {
          agreementId: created.id,
          role: PARTICIPANT_ROLE.creator,
          walletAddress: input.participants.creator.walletAddress,
          handle: input.participants.creator.handle,
          displayName: input.participants.creator.displayName,
        },
      ],
    });

    const metricsByKey = new Map<string, string>();
    for (const key of metricKeys) {
      const metric = await tx.metric.create({
        data: {
          agreementId: created.id,
          key,
        },
      });
      metricsByKey.set(key, metric.id);
    }

    for (const payout of input.payouts) {
      await tx.payout.create({
        data: {
          agreementId: created.id,
          kind: payout.kind,
          label: payout.label,
          amount: payout.amount,
          status: PAYOUT_STATUS.pending,
          condition: payout.condition
            ? {
                create: {
                  metricId: metricsByKey.get(payout.condition.metricKey)!,
                  operator: payout.condition.operator,
                  threshold: payout.condition.threshold,
                },
              }
            : undefined,
        },
      });
    }

    for (const rule of input.performanceRules) {
      await tx.performanceRule.create({ data: { agreementId: created.id, ...rule } });
    }

    return created;
  });

  return getAgreement(prisma, agreement.id);
}

export async function getAgreement(prisma: PrismaClient, id: string): Promise<AgreementView> {
  const agreement = await prisma.agreement.findUnique({
    where: { id },
    include: agreementInclude,
  });

  if (!agreement) {
    throw notFound("Agreement not found");
  }

  return agreement;
}

export async function listAgreementsForBrandWallet(
  prisma: PrismaClient,
  brandWalletAddress: string,
): Promise<AgreementView[]> {
  return listAgreementsForParticipantWallet(prisma, PARTICIPANT_ROLE.brand, brandWalletAddress);
}

export async function listAgreementsForCreatorWallet(
  prisma: PrismaClient,
  creatorWalletAddress: string,
): Promise<AgreementView[]> {
  return listAgreementsForParticipantWallet(prisma, PARTICIPANT_ROLE.creator, creatorWalletAddress);
}

export async function listAgreementsForCreatorProfile(prisma: PrismaClient, creatorProfileId: string): Promise<AgreementView[]> {
  const wallets = await prisma.creatorWalletConnection.findMany({ where: { creatorProfileId }, select: { address: true } });
  return prisma.agreement.findMany({
    where: {
      OR: [
        { contractInvite: { is: { creatorProfileId } } },
        ...(wallets.length ? [{ participants: { some: { role: PARTICIPANT_ROLE.creator, walletAddress: { in: wallets.map((wallet) => wallet.address) } } } }] : []),
      ],
    },
    include: agreementInclude,
    orderBy: { createdAt: "desc" },
  });
}

async function listAgreementsForParticipantWallet(
  prisma: PrismaClient,
  role: string,
  walletAddress: string,
): Promise<AgreementView[]> {
  return prisma.agreement.findMany({
    where: {
      participants: {
        some: {
          role,
          walletAddress,
        },
      },
    },
    include: agreementInclude,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function fundAgreementEscrow(
  prisma: PrismaClient,
  chain: ChainClient,
  agreementId: string,
): Promise<AgreementView> {
  const agreement = await getAgreement(prisma, agreementId);

  if (agreement.status === AGREEMENT_STATUS.active && agreement.blockchainRecord) {
    return agreement;
  }

  if (agreement.status !== AGREEMENT_STATUS.draft && agreement.status !== AGREEMENT_STATUS.acceptedOffchain) {
    throw conflict(`Agreement cannot be funded from status ${agreement.status}`);
  }

  const brand = requireParticipant(agreement, PARTICIPANT_ROLE.brand);
  const creator = requireParticipant(agreement, PARTICIPANT_ROLE.creator);
  const tokenAddress = agreement.tokenAddress ?? chain.defaultTokenAddress;

  if (!tokenAddress) {
    throw serviceUnavailable("No token address configured for escrow creation");
  }

  const termsSource = {
    ...agreement,
    tokenAddress,
  } as AgreementTermsSource;
  const termsHash = (agreement.termsHash ?? hashTerms(buildTermsSnapshot(termsSource))) as Hex;

  const idempotencyKey = `create-escrow:${agreement.id}`;
  const priorOperation = await prisma.chainOperation.findUnique({ where: { idempotencyKey } });
  const operation = priorOperation ?? await prisma.chainOperation.create({ data: { id: randomUUID(), agreementId: agreement.id, kind: "create_escrow", idempotencyKey, payloadJson: JSON.stringify({ tokenAddress, totalCapAmount: agreement.totalCapAmount, termsHash }) } });
  let escrow: Awaited<ReturnType<ChainClient["createEscrow"]>>;
  try {
    escrow = operation.status === "confirmed" && operation.txHash ? { txHash: operation.txHash as Hex, chainId: chain.chainId, escrowAddress: chain.escrowAddress, agreementKey: agreementKey(agreement.id) } : await chain.createEscrow({
      agreementId: agreement.id,
      brand: brand.walletAddress,
      creator: creator.walletAddress,
      token: tokenAddress,
      totalCapAmount: agreement.totalCapAmount,
      termsHash,
      refundAfter: Math.floor((agreement.publicationDeadline ?? agreement.deadline).getTime() / 1000),
    });
    if (operation.status !== "confirmed") await prisma.chainOperation.update({ where: { id: operation.id }, data: { status: "confirmed", txHash: escrow.txHash } });
  } catch (error) {
    throw serviceUnavailable(
      `Unable to create local escrow. Confirm Anvil is running, contracts are deployed, and the sponsor wallet has approved the escrow contract. ${(error as Error).message}`,
    );
  }

  await prisma.$transaction([
    prisma.blockchainRecord.create({
      data: {
        agreementId: agreement.id,
        chainId: escrow.chainId,
        escrowAddress: escrow.escrowAddress,
        agreementKey: escrow.agreementKey,
        tokenAddress,
        totalCapAmount: agreement.totalCapAmount,
        termsHash,
        createTxHash: escrow.txHash,
      },
    }),
    prisma.agreement.update({
      where: { id: agreement.id },
      data: {
        status: AGREEMENT_STATUS.active,
        termsHash,
        tokenAddress,
      },
    }),
  ]);

  return getAgreement(prisma, agreement.id);
}

export async function releasePayoutAndMark(
  prisma: PrismaClient,
  chain: ChainClient,
  agreementId: string,
  payoutId: string,
  amount: string,
): Promise<string> {
  const result = await chain.releasePayout({
    agreementId,
    payoutId,
    amount,
  });

  await markPayoutReleased(prisma, payoutId, result.txHash);
  return result.txHash;
}

export async function markPayoutReleased(prisma: PrismaClient, payoutId: string, txHash: string) {
  await prisma.payout.update({
    where: { id: payoutId },
    data: {
      status: PAYOUT_STATUS.released,
      releasedAt: new Date(),
      releasedTxHash: txHash,
    },
  });
}

export async function recordMetricObservation(
  prisma: PrismaClient,
  chain: ChainClient,
  agreementId: string,
  input: MetricObservationInput,
): Promise<{ releasedPayoutIds: string[]; agreement: AgreementView }> {
  const agreement = await getAgreement(prisma, agreementId);

  if (agreement.status === AGREEMENT_STATUS.completed) {
    return {
      releasedPayoutIds: [],
      agreement,
    };
  }

  requireActiveAgreement(agreement);

  const metric = agreement.metrics.find((candidate) => candidate.key === input.metricKey);
  if (!metric) {
    throw notFound(`Metric ${input.metricKey} is not part of this agreement`);
  }

  await prisma.metricObservation.create({
    data: {
      agreementId: agreement.id,
      metricId: metric.id,
      value: input.value,
      source: input.source,
      observedAt: input.observedAt ? new Date(input.observedAt) : new Date(),
    },
  });

  const eligiblePayouts = agreement.payouts.filter(
    (payout) =>
      payout.kind === PAYOUT_KIND.bonus &&
      payout.status === PAYOUT_STATUS.pending &&
      payout.condition?.metric.key === input.metricKey &&
      conditionIsSatisfied(payout.condition, input.value),
  );

  const releasedPayoutIds: string[] = [];

  for (const payout of eligiblePayouts) {
    await releasePayoutAndMark(prisma, chain, agreement.id, payout.id, payout.amount);
    releasedPayoutIds.push(payout.id);
  }

  await completeIfCapReached(prisma, agreement.id);

  return {
    releasedPayoutIds,
    agreement: await getAgreement(prisma, agreement.id),
  };
}

export async function completeIfCapReached(prisma: PrismaClient, agreementId: string) {
  const agreement = await prisma.agreement.findUnique({
    where: { id: agreementId },
    include: {
      payouts: true,
    },
  });

  if (!agreement) {
    throw notFound("Agreement not found");
  }

  const releasedTotal = agreement.payouts
    .filter((payout) => payout.status === PAYOUT_STATUS.released)
    .reduce((sum, payout) => sum + BigInt(payout.amount), 0n);

  if (releasedTotal >= BigInt(agreement.totalCapAmount)) {
    await prisma.agreement.update({
      where: { id: agreementId },
      data: {
        status: AGREEMENT_STATUS.completed,
      },
    });
  }
}

function requireParticipant(agreement: AgreementView, role: string) {
  const participant = agreement.participants.find((candidate) => candidate.role === role);
  if (!participant) {
    throw notFound(`Agreement is missing ${role} participant`);
  }

  return participant;
}

function requireActiveAgreement(agreement: AgreementView) {
  if (agreement.status !== AGREEMENT_STATUS.active || !agreement.blockchainRecord) {
    throw conflict("Agreement must be active with an escrow before payouts can be released");
  }
}
