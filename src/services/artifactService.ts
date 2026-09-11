import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { keccak256, toBytes } from "viem";
import { CHECKPOINT, DELIVERABLE_STATUS, UPLOAD_STATUS } from "../domain/status.js";
import { stableStringify } from "../domain/termsHash.js";
import { conflict, notFound } from "../http/errors.js";
import { getAgreement } from "./agreementService.js";
import type { DeliverableStorage } from "./deliverableStorage.js";

const MAX_UPLOAD = 5_000_000_000n;
const allowedMime = /^(video\/(mp4|quicktime|webm)|image\/(png|jpeg|webp)|application\/pdf|text\/plain|application\/(msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document))$/;

export async function createUploadSession(prisma: PrismaClient, agreementId: string, creatorProfileId: string, input: {
  checkpoint: string; fileName: string; mimeType: string; totalSize: string;
}) {
  const agreement = await getAgreement(prisma, agreementId);
  if (agreement.status !== "active" || !agreement.blockchainRecord) throw conflict("Agreement must be active and funded.");
  if (!Object.values(CHECKPOINT).includes(input.checkpoint as typeof CHECKPOINT[keyof typeof CHECKPOINT])) throw conflict("Unknown checkpoint.");
  const total = BigInt(input.totalSize);
  if (total <= 0n || total > MAX_UPLOAD) throw conflict("Upload must be between 1 byte and 5 GB.");
  if (!allowedMime.test(input.mimeType)) throw conflict("This file type is not supported for private review.");
  const id = randomUUID();
  return prisma.uploadSession.create({ data: { id, agreementId, creatorProfileId, checkpoint: input.checkpoint, fileName: input.fileName, mimeType: input.mimeType, totalSize: input.totalSize, storageKey: id } });
}

export async function appendUpload(prisma: PrismaClient, storage: DeliverableStorage, uploadId: string, creatorProfileId: string, offset: number, chunk: Buffer) {
  const upload = await prisma.uploadSession.findUnique({ where: { id: uploadId } });
  if (!upload || upload.creatorProfileId !== creatorProfileId) throw notFound("Upload not found.");
  if (upload.status !== UPLOAD_STATUS.uploading) throw conflict("Upload is already complete.");
  if (BigInt(offset) !== BigInt(upload.receivedSize)) throw conflict(`Upload offset must be ${upload.receivedSize}.`);
  if (BigInt(offset + chunk.length) > BigInt(upload.totalSize)) throw conflict("Chunk exceeds declared file size.");
  const receivedSize = await storage.append(upload.storageKey, offset, chunk);
  return prisma.uploadSession.update({ where: { id: upload.id }, data: { receivedSize: String(receivedSize) } });
}

export async function completeUpload(prisma: PrismaClient, storage: DeliverableStorage, uploadId: string, creatorProfileId: string) {
  const upload = await prisma.uploadSession.findUnique({ where: { id: uploadId } });
  if (!upload || upload.creatorProfileId !== creatorProfileId) throw notFound("Upload not found.");
  if (upload.status === UPLOAD_STATUS.complete) return upload;
  if (upload.receivedSize !== upload.totalSize) throw conflict("Upload is incomplete.");
  const completed = await storage.complete(upload.storageKey);
  if (String(completed.size) !== upload.totalSize) throw conflict("Stored file size does not match the declared size.");
  return prisma.uploadSession.update({ where: { id: upload.id }, data: { status: UPLOAD_STATUS.complete, sha256: completed.sha256 } });
}

export async function submitCheckpoint(prisma: PrismaClient, agreementId: string, creatorProfileId: string, checkpoint: string, input: { uploadId: string; notes?: string; attested: true }) {
  const agreement = await getAgreement(prisma, agreementId);
  const upload = await prisma.uploadSession.findUnique({ where: { id: input.uploadId } });
  if (!upload || upload.agreementId !== agreementId || upload.creatorProfileId !== creatorProfileId) throw notFound("Upload not found.");
  if (upload.status !== UPLOAD_STATUS.complete || !upload.sha256) throw conflict("Upload must be completed first.");
  if (upload.checkpoint !== checkpoint) throw conflict("Upload belongs to another checkpoint.");
  const prior = agreement.deliverableSubmissions.filter((item) => item.checkpoint === checkpoint);
  const latest = prior[0];
  if (latest && latest.status !== DELIVERABLE_STATUS.changesRequested) throw conflict("This checkpoint is already awaiting review or approved.");
  if (checkpoint === CHECKPOINT.finalCut) {
    const promo = agreement.deliverableSubmissions.find((item) => item.checkpoint === CHECKPOINT.promo && item.status === DELIVERABLE_STATUS.approved);
    if (!promo) throw conflict("The promotional concept must be approved first.");
  }
  const id = randomUUID();
  const version = (latest?.version ?? 0) + 1;
  const submittedAt = new Date();
  const contentHash = keccak256(toBytes(stableStringify({ agreementId, agreementKey: agreement.blockchainRecord?.agreementKey ?? "", checkpoint, submissionId: id, version, creatorProfileId, fileSha256: upload.sha256, fileSize: upload.totalSize, notes: input.notes ?? null, submittedAt: submittedAt.toISOString() })));
  return prisma.deliverableSubmission.create({
    data: { id, agreementId, creatorProfileId, checkpoint, uploadId: upload.id, version, proofUrl: null, notes: input.notes, contentHash, submittedAt, isLate: submittedAt > (agreement.publicationDeadline ?? agreement.deadline) },
    include: { upload: true, evidence: { orderBy: { position: "asc" } }, reviews: { orderBy: { reviewedAt: "asc" } } },
  });
}
