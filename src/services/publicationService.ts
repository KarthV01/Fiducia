import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { PrismaClient } from "@prisma/client";
import type { ChainClient } from "../blockchain/client.js";
import { PAYOUT_KIND, PAYOUT_STATUS, PUBLICATION_STATUS } from "../domain/status.js";
import { conflict, notFound, serviceUnavailable } from "../http/errors.js";
import { getAgreement } from "./agreementService.js";
import { LocalDeliverableStorage } from "./deliverableStorage.js";
import { getYouTubeAccessToken } from "./youtubeOAuth.js";

const storage = new LocalDeliverableStorage();

export async function createPublication(prisma: PrismaClient, chain: ChainClient | undefined, agreementId: string, creatorProfileId: string, input: { method: "service" | "manual"; youtubeUrl?: string; title?: string; description?: string }) {
  const agreement = await getAgreement(prisma, agreementId);
  const approved = agreement.deliverableSubmissions.find((s) => s.checkpoint === "final_cut" && s.status === "approved" && s.upload);
  if (!approved?.upload) throw conflict("An approved private final cut is required before publication.");
  const connection = input.method === "service" ? await prisma.youTubeConnection.findUnique({ where: { creatorProfileId } }) : null;
  if (input.method === "service" && !connection?.encryptedRefreshToken) throw conflict("Connect the creator's YouTube channel before service publication.");
  const idempotencyKey = `publication:${agreementId}:${approved.id}:${input.method}`;
  const existing = await prisma.publication.findUnique({ where: { idempotencyKey } });
  if (existing) return existing;
  const publication = await prisma.publication.create({ data: {
    agreementId, method: input.method, status: input.method === "service" ? PUBLICATION_STATUS.publishing : PUBLICATION_STATUS.verifying,
    youtubeUrl: input.youtubeUrl, artifactHash: approved.contentHash, approvedArtifactId: approved.id, idempotencyKey,
  } });
  if (input.method === "manual") {
    if (process.env.ENABLE_MANUAL_FINGERPRINT !== "true") return prisma.publication.update({ where: { id: publication.id }, data: { status: PUBLICATION_STATUS.verificationRequired, failureReason: "Manual fingerprint verification is disabled." } });
    return requestFingerprintVerification(prisma, publication.id, input.youtubeUrl!);
  }
  try {
    const accessToken = await getYouTubeAccessToken(connection!.encryptedRefreshToken!);
    const videoId = await uploadToYouTube(accessToken, approved.upload.storageKey, approved.upload.mimeType, approved.upload.totalSize, input.title ?? agreement.title ?? "Sponsored video", input.description ?? agreement.publicationRequirements ?? "");
    return prisma.publication.update({ where: { id: publication.id }, data: { status: PUBLICATION_STATUS.verifying, youtubeVideoId: videoId, youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`, channelId: connection!.channelId } });
  } catch (error) {
    await prisma.publication.update({ where: { id: publication.id }, data: { status: PUBLICATION_STATUS.verificationRequired, failureReason: (error as Error).message } });
    throw serviceUnavailable(`YouTube publication requires verification. ${(error as Error).message}`);
  }
}

export async function verifyPublication(prisma: PrismaClient, chain: ChainClient | undefined, publicationId: string, observation: { videoId: string; channelId?: string; publishedAt: Date; artifactMatched: boolean; public: boolean; requirementsCompliant: boolean; views: string; fingerprintScore?: number; fingerprintVersion?: string }) {
  const publication = await prisma.publication.findUnique({ where: { id: publicationId } });
  if (!publication) throw notFound("Publication not found.");
  if (!observation.artifactMatched || !observation.public || !observation.requirementsCompliant) return prisma.publication.update({ where: { id: publicationId }, data: { status: PUBLICATION_STATUS.verificationRequired, failureReason: "Publication evidence did not conclusively match the approved final cut.", fingerprintScore: observation.fingerprintScore, fingerprintVersion: observation.fingerprintVersion } });
  const agreement = await getAgreement(prisma, publication.agreementId);
  const payout = agreement.payouts.find((p) => p.kind === PAYOUT_KIND.publication);
  if (!payout) throw notFound("Publication payout not found.");
  let txHash = payout.releasedTxHash;
  if (payout.status === PAYOUT_STATUS.pending) {
    if (!chain) throw serviceUnavailable("Blockchain connection is not configured.");
    const idempotencyKey = `publication-release:${publication.id}`;
    const operation = await prisma.chainOperation.upsert({ where: { idempotencyKey }, create: { id: randomUUID(), agreementId: agreement.id, kind: "verified_publication", idempotencyKey, payloadJson: JSON.stringify({ publicationId, payoutId: payout.id, amount: payout.amount }) }, update: {} });
    const liveDays = Math.max(agreement.retentionDays, agreement.measurementWindowDays);
    const refundAfter = Math.floor((observation.publishedAt.getTime() + liveDays * 86_400_000) / 1000);
    const result = await chain.recordPublicationAndRelease({ agreementId: agreement.id, artifactHash: publication.artifactHash as `0x${string}`, payoutId: payout.id, amount: payout.amount, refundAfter });
    txHash = result.txHash;
    await prisma.$transaction([
      prisma.chainOperation.update({ where: { id: operation.id }, data: { status: "confirmed", txHash } }),
      prisma.payout.update({ where: { id: payout.id }, data: { status: PAYOUT_STATUS.released, releasedAt: new Date(), releasedTxHash: txHash } }),
    ]);
  }
  return prisma.publication.update({ where: { id: publicationId }, data: { status: PUBLICATION_STATUS.retention, youtubeVideoId: observation.videoId, channelId: observation.channelId, youtubeUrl: `https://www.youtube.com/watch?v=${observation.videoId}`, publishedAt: observation.publishedAt, verifiedAt: new Date(), retentionStartedAt: new Date(), measurementEndsAt: new Date(observation.publishedAt.getTime() + agreement.measurementWindowDays * 86_400_000), visibility: "public", viewCount: observation.views, requirementsCompliant: true, fingerprintScore: observation.fingerprintScore, fingerprintVersion: observation.fingerprintVersion, failureReason: null } });
}

async function requestFingerprintVerification(prisma: PrismaClient, publicationId: string, youtubeUrl: string) {
  const endpoint = process.env.FINGERPRINT_WORKER_URL?.trim();
  if (!endpoint) return prisma.publication.update({ where: { id: publicationId }, data: { status: PUBLICATION_STATUS.verificationRequired, failureReason: "Fingerprint worker is not configured." } });
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.INTERNAL_JOB_TOKEN ?? ""}` }, body: JSON.stringify({ publicationId, youtubeUrl }) });
  if (!response.ok) return prisma.publication.update({ where: { id: publicationId }, data: { status: PUBLICATION_STATUS.verificationRequired, failureReason: `Fingerprint worker returned ${response.status}.` } });
  return prisma.publication.findUnique({ where: { id: publicationId } });
}

async function uploadToYouTube(accessToken: string, storageKey: string, mimeType: string, size: string, title: string, description: string) {
  const initiation = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", { method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json; charset=UTF-8", "x-upload-content-length": size, "x-upload-content-type": mimeType }, body: JSON.stringify({ snippet: { title, description }, status: { privacyStatus: "public" } }) });
  const location = initiation.headers.get("location");
  if (!initiation.ok || !location) throw new Error(`YouTube upload session failed (${initiation.status}).`);
  const file = await storage.read(storageKey);
  const uploaded = await fetch(location, { method: "PUT", headers: { "content-length": size, "content-type": mimeType }, body: Readable.toWeb(file.stream) as ReadableStream, duplex: "half" } as RequestInit & { duplex: "half" });
  if (!uploaded.ok) throw new Error(`YouTube media upload failed (${uploaded.status}).`);
  const result = await uploaded.json() as { id?: string };
  if (!result.id) throw new Error("YouTube upload did not return a video ID.");
  return result.id;
}
