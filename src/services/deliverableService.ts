import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { keccak256, toBytes, type Hex } from "viem";
import type { ChainClient } from "../blockchain/client.js";
import { AGREEMENT_STATUS, DELIVERABLE_STATUS, PAYOUT_KIND, PAYOUT_STATUS, REVIEW_DECISION } from "../domain/status.js";
import { stableStringify } from "../domain/termsHash.js";
import type { DeliverableReviewInput, DeliverableSubmissionInput } from "../domain/validation.js";
import { conflict, notFound, serviceUnavailable } from "../http/errors.js";
import { completeIfCapReached, getAgreement } from "./agreementService.js";

export async function submitDeliverable(
  prisma: PrismaClient,
  agreementId: string,
  creatorProfileId: string,
  input: DeliverableSubmissionInput,
) {
  const agreement = await getAgreement(prisma, agreementId);
  if (agreement.status !== AGREEMENT_STATUS.active || !agreement.blockchainRecord) {
    throw conflict("The agreement must be active and funded before a deliverable can be submitted.");
  }

  const latest = agreement.deliverableSubmissions[0];
  if (latest && latest.status !== DELIVERABLE_STATUS.changesRequested) {
    throw conflict("The current deliverable is already awaiting review or has been approved.");
  }

  const id = randomUUID();
  const version = (latest?.version ?? 0) + 1;
  const submittedAt = new Date();
  const evidence = input.evidence.map((item, position) => ({ ...item, position }));
  const contentHash = hashSubmission({
    agreementId,
    agreementKey: agreement.blockchainRecord.agreementKey,
    submissionId: id,
    version,
    creatorWallet: agreement.participants.find((party) => party.role === "creator")?.walletAddress ?? "",
    proofUrl: input.proofUrl,
    notes: input.notes ?? null,
    evidence,
    submittedAt,
  });

  return prisma.deliverableSubmission.create({
    data: {
      id,
      agreementId,
      creatorProfileId,
      version,
      proofUrl: input.proofUrl,
      notes: input.notes,
      contentHash,
      submittedAt,
      isLate: submittedAt.getTime() > agreement.deadline.getTime(),
      evidence: { create: evidence },
    },
    include: deliverableSubmissionInclude,
  });
}

export async function reviewDeliverable(
  prisma: PrismaClient,
  chain: ChainClient | undefined,
  agreementId: string,
  submissionId: string,
  sponsorProfileId: string,
  input: DeliverableReviewInput,
) {
  const agreement = await getAgreement(prisma, agreementId);
  const submission = agreement.deliverableSubmissions.find((item) => item.id === submissionId);
  if (!submission) throw notFound("Deliverable submission not found.");
  if (agreement.deliverableSubmissions[0]?.id !== submission.id) {
    throw conflict("Only the latest deliverable version can be reviewed.");
  }
  if (submission.status !== DELIVERABLE_STATUS.submitted) {
    throw conflict("This deliverable is not awaiting review.");
  }

  const expectedHash = hashSubmission({
    agreementId,
    agreementKey: agreement.blockchainRecord?.agreementKey ?? "",
    submissionId: submission.id,
    version: submission.version,
    creatorWallet: agreement.participants.find((party) => party.role === "creator")?.walletAddress ?? "",
    proofUrl: submission.proofUrl,
    notes: submission.notes,
    evidence: submission.evidence,
    submittedAt: submission.submittedAt,
  });
  if (expectedHash.toLowerCase() !== submission.contentHash.toLowerCase()) {
    throw conflict("The stored deliverable no longer matches its submitted proof hash.");
  }

  if (input.decision === REVIEW_DECISION.changesRequested) {
    await prisma.$transaction([
      prisma.deliverableReview.create({
        data: { submissionId, sponsorProfileId, decision: input.decision, comment: input.comment },
      }),
      prisma.deliverableSubmission.update({
        where: { id: submissionId },
        data: { status: DELIVERABLE_STATUS.changesRequested },
      }),
    ]);
    return { releasedPayoutIds: [], agreement: await getAgreement(prisma, agreementId) };
  }

  const basePayout = agreement.payouts.find((payout) => payout.kind === PAYOUT_KIND.base);
  if (!basePayout) throw notFound("Base payout not found.");
  if (basePayout.status !== PAYOUT_STATUS.pending) throw conflict("The base payout has already been released.");
  if (!chain) throw serviceUnavailable("Blockchain connection is not configured.");

  let txHash: string;
  try {
    const result = await chain.approveDeliveryAndRelease({
      agreementId,
      submissionHash: submission.contentHash as Hex,
      payoutId: basePayout.id,
      amount: basePayout.amount,
    });
    txHash = result.txHash;
  } catch (error) {
    throw serviceUnavailable(`Unable to approve the deliverable on-chain. ${(error as Error).message}`);
  }

  await prisma.$transaction([
    prisma.deliverableReview.create({
      data: {
        submissionId,
        sponsorProfileId,
        decision: REVIEW_DECISION.approved,
        comment: input.comment,
        approvalTxHash: txHash,
      },
    }),
    prisma.deliverableSubmission.update({
      where: { id: submissionId },
      data: { status: DELIVERABLE_STATUS.approved, approvedTxHash: txHash },
    }),
    prisma.payout.update({
      where: { id: basePayout.id },
      data: { status: PAYOUT_STATUS.released, releasedAt: new Date(), releasedTxHash: txHash },
    }),
  ]);

  await completeIfCapReached(prisma, agreementId);
  return { releasedPayoutIds: [basePayout.id], agreement: await getAgreement(prisma, agreementId) };
}

export const deliverableSubmissionInclude = {
  evidence: { orderBy: { position: "asc" as const } },
  reviews: { orderBy: { reviewedAt: "asc" as const } },
};

type SubmissionSnapshot = {
  agreementId: string;
  agreementKey: string;
  submissionId: string;
  version: number;
  creatorWallet: string;
  proofUrl: string;
  notes: string | null;
  evidence: Array<{ url: string; label?: string | null; position: number }>;
  submittedAt: Date;
};

function hashSubmission(snapshot: SubmissionSnapshot): Hex {
  return keccak256(
    toBytes(
      stableStringify({
        agreementId: snapshot.agreementId,
        agreementKey: snapshot.agreementKey,
        submissionId: snapshot.submissionId,
        version: snapshot.version,
        creatorWallet: snapshot.creatorWallet.toLowerCase(),
        proofUrl: snapshot.proofUrl,
        notes: snapshot.notes,
        evidence: snapshot.evidence.map((item) => ({ url: item.url, label: item.label ?? null, position: item.position })),
        submittedAt: snapshot.submittedAt.toISOString(),
      }),
    ),
  );
}
