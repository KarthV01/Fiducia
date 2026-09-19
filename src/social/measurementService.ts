import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { ChainClient } from "../blockchain/client.js";
import { AUTO_SETTLEMENT_METRICS } from "../accounts/constants.js";
import { PAYOUT_STATUS } from "../domain/status.js";
import { conflict, notFound } from "../http/errors.js";
import { getAgreement } from "../services/agreementService.js";
import { accessTokenForConnection } from "./connectionService.js";
import { providerAdapter } from "./providers/index.js";
import type { ProviderMetric, SocialProvider } from "./types.js";

export async function attachAgreementContent(prisma: PrismaClient, input: { agreementId: string; creatorProfileId: string; socialContentId: string; publishMode: "api" | "manual" }) {
  const [agreement, content] = await Promise.all([
    getAgreement(prisma, input.agreementId),
    prisma.socialContent.findUnique({ where: { id: input.socialContentId }, include: { socialConnection: true } }),
  ]);
  if (!content || content.socialConnection.creatorProfileId !== input.creatorProfileId) throw notFound("Connected social content not found.");
  const approved = agreement.deliverableSubmissions.find((submission) => submission.checkpoint === "final_cut" && submission.status === "approved");
  if (!approved) throw conflict("The sponsor must approve the final platform-ready post before publication can be attached.");
  const startsAt = content.publishedAt ?? new Date();
  const template = await prisma.agreementContent.findFirst({ where: { agreementId: agreement.id, creatorProfileId: input.creatorProfileId, provider: content.provider, socialContentId: null } });
  if (template) return prisma.agreementContent.update({ where: { id: template.id }, data: {
    socialContentId: content.id,
    status: "monitoring",
    publishMode: input.publishMode,
    approvedArtifactId: approved.id,
    artifactHash: approved.contentHash,
    measurementStartsAt: startsAt,
    measurementEndsAt: new Date(startsAt.getTime() + agreement.measurementWindowDays * 86_400_000),
    retentionEndsAt: new Date(startsAt.getTime() + agreement.retentionDays * 86_400_000),
  }, include: { socialContent: true } });
  return prisma.agreementContent.upsert({
    where: { idempotencyKey: `agreement-content:${agreement.id}:${content.provider}:${content.providerContentId}` },
    create: {
      agreementId: agreement.id,
      creatorProfileId: input.creatorProfileId,
      socialContentId: content.id,
      provider: content.provider,
      status: "monitoring",
      publishMode: input.publishMode,
      approvedArtifactId: approved.id,
      artifactHash: approved.contentHash,
      requirementsJson: JSON.stringify({ publicationRequirements: agreement.publicationRequirements }),
      measurementSpecJson: JSON.stringify({ metricKeys: agreement.metrics.filter((metric) => metric.key.startsWith(`${content.provider}.`)).map((metric) => metric.key), confirmations: 2 }),
      measurementStartsAt: startsAt,
      measurementEndsAt: new Date(startsAt.getTime() + agreement.measurementWindowDays * 86_400_000),
      retentionEndsAt: new Date(startsAt.getTime() + agreement.retentionDays * 86_400_000),
      idempotencyKey: `agreement-content:${agreement.id}:${content.provider}:${content.providerContentId}`,
    },
    update: { socialContentId: content.id, status: "monitoring", publishMode: input.publishMode, approvedArtifactId: approved.id, artifactHash: approved.contentHash },
    include: { socialContent: true },
  });
}

export async function agreementMeasurementEvidence(prisma: PrismaClient, agreementId: string) {
  return prisma.agreementContent.findMany({
    where: { agreementId },
    include: { socialContent: true, observations: { include: { metric: true }, orderBy: { observedAt: "desc" } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function monitorSocialMeasurements(prisma: PrismaClient, chain: ChainClient, now = new Date()) {
  const bindings = await prisma.agreementContent.findMany({
    where: { status: "monitoring", measurementStartsAt: { lte: now }, measurementEndsAt: { gte: now }, socialContentId: { not: null } },
    include: { socialContent: { include: { socialConnection: true } }, agreement: { include: { metrics: true, payouts: { include: { condition: { include: { metric: true } } } } } } },
  });
  const results: Array<{ agreementContentId: string; observed: number; releasedPayoutIds: string[]; error?: string }> = [];
  for (const binding of bindings) {
    if (!binding.socialContent) continue;
    const connection = binding.socialContent.socialConnection;
    const run = await prisma.socialSyncRun.create({ data: { agreementId: binding.agreementId, socialConnectionId: connection.id, resource: `metrics:${binding.socialContent.providerContentId}` } });
    try {
      const accessToken = await accessTokenForConnection(prisma, connection);
      const adapter = providerAdapter(connection.provider as SocialProvider);
      const metrics = await adapter.metrics(accessToken, [binding.socialContent.providerContentId]);
      let observed = 0;
      const released = new Set<string>();
      for (const observation of metrics) {
        if (!AUTO_SETTLEMENT_METRICS.has(observation.key)) continue;
        const metric = binding.agreement.metrics.find((candidate) => candidate.key === observation.key);
        if (!metric) continue;
        const created = await persistObservation(prisma, binding.id, connection.id, binding.agreementId, metric.id, observation, now);
        if (!created) continue;
        observed += 1;
        for (const payoutId of await settleConfirmedBonuses(prisma, chain, binding.id, binding.agreementId, metric.id, observation.key)) released.add(payoutId);
      }
      await prisma.$transaction([
        prisma.socialSyncRun.update({ where: { id: run.id }, data: { status: "completed", resultCount: observed, completedAt: new Date() } }),
        prisma.socialConnection.update({ where: { id: connection.id }, data: { lastSyncedAt: new Date(), status: "active", errorCode: null } }),
      ]);
      results.push({ agreementContentId: binding.id, observed, releasedPayoutIds: [...released] });
    } catch (error) {
      await prisma.socialSyncRun.update({ where: { id: run.id }, data: { status: "failed", errorCategory: error instanceof Error ? error.name : "unknown", errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Unknown provider error", completedAt: new Date() } });
      results.push({ agreementContentId: binding.id, observed: 0, releasedPayoutIds: [], error: error instanceof Error ? error.message : "Unknown provider error" });
    }
  }
  return results;
}

async function persistObservation(prisma: PrismaClient, agreementContentId: string, socialConnectionId: string, agreementId: string, metricId: string, observation: ProviderMetric, now: Date) {
  const bucket = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000).toISOString();
  const idempotencyKey = `social-observation:${agreementContentId}:${observation.key}:${bucket}`;
  const existing = await prisma.metricObservation.findUnique({ where: { idempotencyKey } });
  if (existing) return false;
  const evidence = { providerContentId: observation.providerContentId, providerField: observation.providerField, value: observation.value, unit: observation.unit, sourceEndpoint: observation.sourceEndpoint, sourceClass: observation.sourceClass, observedAt: observation.observedAt.toISOString(), intervalStart: observation.intervalStart?.toISOString(), intervalEnd: observation.intervalEnd?.toISOString() };
  await prisma.metricObservation.create({ data: {
    agreementId,
    metricId,
    agreementContentId,
    socialConnectionId,
    value: observation.value,
    source: `provider:${observation.sourceClass}`,
    observedAt: observation.observedAt,
    providerField: observation.providerField,
    sourceEndpoint: observation.sourceEndpoint,
    sourceClass: observation.sourceClass,
    intervalStart: observation.intervalStart,
    intervalEnd: observation.intervalEnd,
    ingestedAt: now,
    evidenceJson: JSON.stringify(evidence),
    evidenceHash: createHash("sha256").update(JSON.stringify(evidence)).digest("hex"),
    idempotencyKey,
  } });
  return true;
}

async function settleConfirmedBonuses(prisma: PrismaClient, chain: ChainClient, agreementContentId: string, agreementId: string, metricId: string, metricKey: string) {
  const observations = await prisma.metricObservation.findMany({ where: { agreementContentId, metricId, source: { startsWith: "provider:" } }, orderBy: { observedAt: "desc" }, take: 2 });
  const payouts = await prisma.payout.findMany({ where: { agreementId, kind: "bonus", status: PAYOUT_STATUS.pending }, include: { condition: { include: { metric: true } } } });
  const released: string[] = [];
  for (const payout of payouts) {
    if (payout.condition?.metric.key !== metricKey || !confirmationsMeetThreshold(observations, payout.condition.threshold)) continue;
    const idempotencyKey = `social-metric-release:${payout.id}`;
    const operation = await prisma.chainOperation.upsert({ where: { idempotencyKey }, create: { id: randomUUID(), agreementId, kind: "social_metric", idempotencyKey, payloadJson: JSON.stringify({ payoutId: payout.id, observationIds: observations.map((item) => item.id) }) }, update: {} });
    if (operation.status === "confirmed") continue;
    const result = await chain.releasePayout({ agreementId, payoutId: payout.id, amount: payout.amount });
    await prisma.$transaction([
      prisma.chainOperation.update({ where: { id: operation.id }, data: { status: "confirmed", txHash: result.txHash } }),
      prisma.payout.update({ where: { id: payout.id }, data: { status: PAYOUT_STATUS.released, releasedAt: new Date(), releasedTxHash: result.txHash } }),
    ]);
    released.push(payout.id);
  }
  return released;
}

export function confirmationsMeetThreshold(observations: Array<{ value: string; observedAt: Date }>, threshold: string, minimumSpacingMs = 30 * 60_000) {
  if (observations.length < 2) return false;
  const [latest, prior] = [...observations].sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime());
  return latest.observedAt.getTime() - prior.observedAt.getTime() >= minimumSpacingMs && BigInt(latest.value) >= BigInt(threshold) && BigInt(prior.value) >= BigInt(threshold);
}
