import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { Hex } from "viem";
import type { ChainClient } from "../blockchain/client.js";
import { AGREEMENT_STATUS, DELIVERABLE_STATUS, PAYOUT_KIND, PAYOUT_STATUS, REVIEW_DECISION } from "../domain/status.js";
import type { DeliverableReviewInput } from "../domain/validation.js";
import { conflict, notFound, serviceUnavailable } from "../http/errors.js";
import { completeIfCapReached, getAgreement } from "./agreementService.js";

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

  if (!submission.upload?.sha256) throw conflict("The private artifact is missing or incomplete.");

  if (input.decision === REVIEW_DECISION.changesRequested) {
    await prisma.$transaction([
      prisma.deliverableReview.create({
        data: { submissionId, sponsorProfileId, decision: input.decision, comment: input.comment, failedCriteriaJson: JSON.stringify(input.failedCriteria) },
      }),
      prisma.deliverableSubmission.update({
        where: { id: submissionId },
        data: { status: DELIVERABLE_STATUS.changesRequested },
      }),
    ]);
    return { releasedPayoutIds: [], agreement: await getAgreement(prisma, agreementId) };
  }

  const payoutKind = submission.checkpoint === "promo" ? PAYOUT_KIND.promo : submission.checkpoint === "final_cut" ? PAYOUT_KIND.finalCut : PAYOUT_KIND.base;
  const basePayout = agreement.payouts.find((payout) => payout.kind === payoutKind);
  if (!basePayout) throw notFound("Base payout not found.");
  if (basePayout.status !== PAYOUT_STATUS.pending) throw conflict("The base payout has already been released.");
  if (!chain) throw serviceUnavailable("Blockchain connection is not configured.");

  let txHash: string;
  try {
    const idempotencyKey = `checkpoint:${submission.id}`;
    const priorOperation = await prisma.chainOperation.findUnique({ where: { idempotencyKey } });
    const operation = priorOperation ?? await prisma.chainOperation.create({ data: { id: randomUUID(), agreementId, kind: "checkpoint_approval", idempotencyKey, payloadJson: JSON.stringify({ submissionId, payoutId: basePayout.id, amount: basePayout.amount }) } });
    const result = operation.status === "confirmed" && operation.txHash ? { txHash: operation.txHash } : await chain.approveCheckpointAndRelease({
      agreementId,
      checkpoint: submission.checkpoint,
      artifactHash: submission.contentHash as Hex,
      payoutId: basePayout.id,
      amount: basePayout.amount,
    });
    txHash = result.txHash;
    if (operation.status !== "confirmed") await prisma.chainOperation.update({ where: { id: operation.id }, data: { status: "confirmed", txHash } });
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
        failedCriteriaJson: JSON.stringify(input.failedCriteria),
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
