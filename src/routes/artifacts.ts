import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "../accounts/auth.js";
import { ensureCreatorOwnsAgreement, getCreatorProfileForUser } from "../accounts/profiles.js";
import { badRequest, notFound } from "../http/errors.js";
import { appendUpload, completeUpload, createUploadSession, submitCheckpoint } from "../services/artifactService.js";
import { LocalDeliverableStorage } from "../services/deliverableStorage.js";

const storage = new LocalDeliverableStorage();
const initSchema = z.object({ checkpoint: z.enum(["promo", "final_cut"]), fileName: z.string().min(1).max(255), mimeType: z.string().min(1), totalSize: z.string().regex(/^[1-9]\d*$/) });
const submitSchema = z.object({ uploadId: z.string().uuid(), notes: z.string().max(5000).optional(), attested: z.literal(true) });

export async function registerArtifactRoutes(app: FastifyInstance, deps: { prisma: PrismaClient }) {
  const { prisma } = deps;
  app.post<{ Params: { creatorId: string; agreementId: string } }>("/api/creators/:creatorId/contracts/:agreementId/uploads", async (request, reply) => {
    const creator = await ownedCreator(prisma, request, request.params.creatorId, request.params.agreementId);
    return reply.code(201).send(await createUploadSession(prisma, request.params.agreementId, creator.id, initSchema.parse(request.body)));
  });
  app.patch<{ Params: { creatorId: string; agreementId: string; uploadId: string } }>("/api/creators/:creatorId/contracts/:agreementId/uploads/:uploadId", async (request, reply) => {
    const creator = await ownedCreator(prisma, request, request.params.creatorId, request.params.agreementId);
    const offset = Number(request.headers["upload-offset"]);
    if (!Number.isSafeInteger(offset) || offset < 0 || !Buffer.isBuffer(request.body)) throw badRequest("A valid Upload-Offset and binary chunk are required.");
    const upload = await appendUpload(prisma, storage, request.params.uploadId, creator.id, offset, request.body);
    return reply.header("Upload-Offset", upload.receivedSize).code(204).send();
  });
  app.post<{ Params: { creatorId: string; agreementId: string; uploadId: string } }>("/api/creators/:creatorId/contracts/:agreementId/uploads/:uploadId/complete", async (request) => {
    const creator = await ownedCreator(prisma, request, request.params.creatorId, request.params.agreementId);
    return completeUpload(prisma, storage, request.params.uploadId, creator.id);
  });
  app.post<{ Params: { creatorId: string; agreementId: string; checkpoint: string } }>("/api/creators/:creatorId/contracts/:agreementId/checkpoints/:checkpoint/submissions", async (request, reply) => {
    const creator = await ownedCreator(prisma, request, request.params.creatorId, request.params.agreementId);
    return reply.code(201).send(await submitCheckpoint(prisma, request.params.agreementId, creator.id, request.params.checkpoint, submitSchema.parse(request.body)));
  });
  app.get<{ Params: { agreementId: string; artifactId: string } }>("/api/contracts/:agreementId/artifacts/:artifactId/content", async (request, reply) => {
    const user = await requireUser(prisma, request);
    const invite = await prisma.contractInvite.findUnique({ where: { agreementId: request.params.agreementId }, include: { sponsorProfile: true, creatorProfile: true } });
    if (!invite || (invite.sponsorProfile.userId !== user.id && invite.creatorProfile.userId !== user.id)) throw notFound("Artifact not found.");
    const submission = await prisma.deliverableSubmission.findUnique({ where: { id: request.params.artifactId }, include: { upload: true } });
    if (!submission || submission.agreementId !== request.params.agreementId || !submission.upload) throw notFound("Artifact not found.");
    const range = parseRange(request.headers.range);
    const file = await storage.read(submission.upload.storageKey, range);
    reply.header("Accept-Ranges", "bytes").header("Content-Type", submission.upload.mimeType).header("Content-Length", file.end - file.start + 1);
    if (range) reply.code(206).header("Content-Range", `bytes ${file.start}-${file.end}/${file.size}`);
    return reply.send(file.stream);
  });
}

async function ownedCreator(prisma: PrismaClient, request: Parameters<typeof requireUser>[1], creatorId: string, agreementId: string) {
  const user = await requireUser(prisma, request);
  const creator = await getCreatorProfileForUser(prisma, user.id, creatorId);
  await ensureCreatorOwnsAgreement(prisma, creator.id, agreementId);
  return creator;
}

function parseRange(value?: string) {
  if (!value) return undefined;
  const match = /^bytes=(\d+)-(\d*)$/.exec(value);
  if (!match) throw badRequest("Invalid Range header.");
  return { start: Number(match[1]), end: match[2] ? Number(match[2]) : undefined };
}
