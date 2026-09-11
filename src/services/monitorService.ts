import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { ChainClient } from "../blockchain/client.js";
import { AGREEMENT_STATUS, PAYOUT_KIND, PAYOUT_STATUS, PUBLICATION_STATUS } from "../domain/status.js";
import { getAgreement } from "./agreementService.js";
import { settleVerifiedPerformance } from "./performanceService.js";
import { verifyPublication } from "./publicationService.js";

type YouTubeObservation = { public: boolean; channelId: string; title: string; description: string; views: string };

export async function monitorYouTube(prisma: PrismaClient, chain: ChainClient, now = new Date()) {
  const publications = await prisma.publication.findMany({ where: { status: { in: [PUBLICATION_STATUS.verifying, PUBLICATION_STATUS.retention, PUBLICATION_STATUS.verified] }, youtubeVideoId: { not: null } } });
  const results = [];
  for (const publication of publications) {
    if (publication.lastCheckedAt && publication.lastCheckedAt.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)) {
      results.push({ publicationId: publication.id, skipped: "already_checked_today" });
      continue;
    }
    const agreement = await getAgreement(prisma, publication.agreementId);
    const observation = await fetchObservation(publication.youtubeVideoId!);
    const requiredLinks = (agreement.publicationRequirements?.match(/https?:\/\/\S+/g) ?? []).map((url) => url.replace(/[),.;]+$/, ""));
    const compliant = observation.public && (!publication.channelId || publication.channelId === observation.channelId) && requiredLinks.every((url) => observation.description.includes(url));
    if (publication.status === PUBLICATION_STATUS.verifying && publication.method === "service" && compliant) {
      await verifyPublication(prisma, chain, publication.id, { videoId: publication.youtubeVideoId!, channelId: observation.channelId, publishedAt: now, artifactMatched: true, public: true, requirementsCompliant: true, views: observation.views, fingerprintScore: 1, fingerprintVersion: "service-upload-v1" });
      results.push({ publicationId: publication.id, compliant: true, views: observation.views, confirmations: 0 });
      continue;
    }
    const confirmations = compliant ? publication.consecutiveConfirmations + 1 : 0;
    await prisma.publication.update({ where: { id: publication.id }, data: { visibility: observation.public ? "public" : "unavailable", viewCount: observation.views, requirementsCompliant: compliant, consecutiveConfirmations: confirmations, lastCheckedAt: now } });
    if (compliant && confirmations >= 2) await settleVerifiedPerformance(prisma, chain, agreement.id, observation.views);
    const retentionEnd = publication.publishedAt ? new Date(publication.publishedAt.getTime() + agreement.retentionDays * 86_400_000) : null;
    const retentionPayout = agreement.payouts.find((p) => p.kind === PAYOUT_KIND.retention);
    if (compliant && retentionEnd && now >= retentionEnd && retentionPayout?.status === PAYOUT_STATUS.pending) await releasePayout(prisma, chain, agreement.id, retentionPayout.id, retentionPayout.amount, `retention:${publication.id}`, "retention");
    if (publication.measurementEndsAt && now >= publication.measurementEndsAt) {
      if (compliant && confirmations >= 2) await settleVerifiedPerformance(prisma, chain, agreement.id, observation.views);
      await refundAgreement(prisma, chain, agreement.id, `measurement-end:${agreement.id}`);
      await prisma.publication.update({ where: { id: publication.id }, data: { status: PUBLICATION_STATUS.completed } });
    }
    results.push({ publicationId: publication.id, compliant, views: observation.views, confirmations });
  }
  return results;
}

export async function refundExpired(prisma: PrismaClient, chain: ChainClient, now = new Date()) {
  const agreements = await prisma.agreement.findMany({ where: { status: AGREEMENT_STATUS.active, publicationDeadline: { lt: now } }, include: { publications: true } });
  const refunded = [];
  for (const agreement of agreements) {
    if (agreement.publications.some((p) => p.verifiedAt)) continue;
    await refundAgreement(prisma, chain, agreement.id, `publication-expired:${agreement.id}`);
    refunded.push(agreement.id);
  }
  return refunded;
}

async function refundAgreement(prisma: PrismaClient, chain: ChainClient, agreementId: string, idempotencyKey: string) {
  const existing = await prisma.chainOperation.findUnique({ where: { idempotencyKey } });
  const operation = existing ?? await prisma.chainOperation.create({ data: { id: randomUUID(), agreementId, kind: "refund", idempotencyKey, payloadJson: "{}" } });
  const result = operation.status === "confirmed" && operation.txHash ? { txHash: operation.txHash } : await chain.refundRemaining(agreementId);
  if (operation.status !== "confirmed") await prisma.chainOperation.update({ where: { id: operation.id }, data: { status: "confirmed", txHash: result.txHash } });
  await prisma.$transaction([
    prisma.agreement.update({ where: { id: agreementId }, data: { status: AGREEMENT_STATUS.completed } }),
    prisma.payout.updateMany({ where: { agreementId, status: PAYOUT_STATUS.pending }, data: { status: "refunded" } }),
  ]);
}

async function releasePayout(prisma: PrismaClient, chain: ChainClient, agreementId: string, payoutId: string, amount: string, idempotencyKey: string, kind: string) {
  const existing = await prisma.chainOperation.findUnique({ where: { idempotencyKey } });
  const operation = existing ?? await prisma.chainOperation.create({ data: { id: randomUUID(), agreementId, kind, idempotencyKey, payloadJson: JSON.stringify({ payoutId, amount }) } });
  const result = operation.status === "confirmed" && operation.txHash ? { txHash: operation.txHash } : await chain.releasePayout({ agreementId, payoutId, amount });
  if (operation.status !== "confirmed") await prisma.chainOperation.update({ where: { id: operation.id }, data: { status: "confirmed", txHash: result.txHash } });
  await prisma.$transaction([
    prisma.payout.update({ where: { id: payoutId }, data: { status: PAYOUT_STATUS.released, releasedAt: new Date(), releasedTxHash: result.txHash } }),
  ]);
}

async function fetchObservation(videoId: string): Promise<YouTubeObservation> {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) throw new Error("YOUTUBE_API_KEY is required for monitoring.");
  const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,status,statistics&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(key)}`);
  if (!response.ok) throw new Error(`YouTube monitor returned ${response.status}.`);
  const body = await response.json() as { items?: Array<{ snippet: { channelId: string; title: string; description: string }; status: { privacyStatus: string; uploadStatus: string }; statistics?: { viewCount?: string } }> };
  const video = body.items?.[0];
  if (!video) return { public: false, channelId: "", title: "", description: "", views: "0" };
  return { public: video.status.privacyStatus === "public" && video.status.uploadStatus === "processed", channelId: video.snippet.channelId, title: video.snippet.title, description: video.snippet.description, views: video.statistics?.viewCount ?? "0" };
}
