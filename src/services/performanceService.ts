import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { ChainClient } from "../blockchain/client.js";
import { PAYOUT_STATUS } from "../domain/status.js";
import { getAgreement } from "./agreementService.js";

export function meteredEarned(views: string, startsAt: string, rate: string, maximum: string) {
  const blocks = (BigInt(views) > BigInt(startsAt) ? BigInt(views) - BigInt(startsAt) : 0n) / 1_000n;
  const calculated = blocks * BigInt(rate);
  return (calculated > BigInt(maximum) ? BigInt(maximum) : calculated).toString();
}

export async function settleVerifiedPerformance(prisma: PrismaClient, chain: ChainClient, agreementId: string, verifiedViews: string) {
  const agreement = await getAgreement(prisma, agreementId);
  const released: string[] = [];
  for (const payout of agreement.payouts.filter((p) => p.kind === "bonus" && p.status === PAYOUT_STATUS.pending && p.condition?.metric.key === "youtube.video.views" && BigInt(verifiedViews) >= BigInt(p.condition.threshold))) {
    await release(prisma, chain, agreementId, payout.id, payout.amount, `fixed:${payout.id}`, "fixed_performance");
    released.push(payout.id);
  }
  for (const rule of agreement.performanceRules.filter((r) => r.kind === "metered")) {
    const earned = BigInt(meteredEarned(verifiedViews, rule.startsAtViews!, rule.amountPerThousandViews!, rule.maximumAmount!));
    const delta = earned - BigInt(rule.releasedAmount);
    if (delta <= 0n) continue;
    const settlementId = `metered:${rule.id}:${earned}`;
    await release(prisma, chain, agreementId, settlementId, delta.toString(), settlementId, "metered_performance");
    await prisma.performanceRule.update({ where: { id: rule.id }, data: { releasedAmount: earned.toString() } });
    released.push(settlementId);
  }
  return released;
}

async function release(prisma: PrismaClient, chain: ChainClient, agreementId: string, payoutId: string, amount: string, idempotencyKey: string, kind: string) {
  const existing = await prisma.chainOperation.findUnique({ where: { idempotencyKey } });
  if (existing?.status === "confirmed") return;
  const operation = existing ?? await prisma.chainOperation.create({ data: { id: randomUUID(), agreementId, kind, idempotencyKey, payloadJson: JSON.stringify({ payoutId, amount }) } });
  const result = await chain.releasePayout({ agreementId, payoutId, amount });
  await prisma.$transaction([
    prisma.chainOperation.update({ where: { id: operation.id }, data: { status: "confirmed", txHash: result.txHash } }),
    ...(payoutId.startsWith("metered:") ? [] : [prisma.payout.update({ where: { id: payoutId }, data: { status: PAYOUT_STATUS.released, releasedAt: new Date(), releasedTxHash: result.txHash } })]),
  ]);
}
