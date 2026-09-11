import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { ChainClient } from "../blockchain/client.js";
import { requireUser } from "../accounts/auth.js";
import { ensureCreatorOwnsAgreement, getCreatorProfileForUser } from "../accounts/profiles.js";
import { notFound, serviceUnavailable, unauthorized } from "../http/errors.js";
import { createPublication, verifyPublication } from "../services/publicationService.js";
import { beginYouTubeConnection, finishYouTubeConnection } from "../services/youtubeOAuth.js";
import { monitorYouTube, refundExpired } from "../services/monitorService.js";

const publicationSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("service"), title: z.string().min(1).max(100), description: z.string().max(5000) }),
  z.object({ method: z.literal("manual"), youtubeUrl: z.string().url().regex(/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//) }),
]);
const fingerprintResultSchema = z.object({ videoId: z.string().min(1), channelId: z.string().optional(), publishedAt: z.string().datetime(), artifactMatched: z.boolean(), public: z.boolean(), requirementsCompliant: z.boolean(), views: z.string().regex(/^\d+$/), fingerprintScore: z.number().min(0).max(1).optional(), fingerprintVersion: z.string().min(1).optional() });

export async function registerPublicationRoutes(app: FastifyInstance, deps: { prisma: PrismaClient; chain?: ChainClient }) {
  const { prisma } = deps;
  app.post<{ Params: { creatorId: string; agreementId: string } }>("/api/creators/:creatorId/contracts/:agreementId/youtube/connect", async (request) => {
    const creator = await ownedCreator(prisma, request, request.params.creatorId, request.params.agreementId);
    return beginYouTubeConnection(prisma, creator.id);
  });
  app.get<{ Querystring: { state?: string; code?: string } }>("/api/youtube/callback", async (request, reply) => {
    await requireUser(prisma, request);
    if (!request.query.state || !request.query.code) throw unauthorized("Missing YouTube authorization response.");
    await finishYouTubeConnection(prisma, request.query.state, request.query.code);
    return reply.redirect(process.env.APP_URL?.trim() || "http://localhost:5173");
  });
  app.post<{ Params: { creatorId: string; agreementId: string } }>("/api/creators/:creatorId/contracts/:agreementId/publications", async (request, reply) => {
    const creator = await ownedCreator(prisma, request, request.params.creatorId, request.params.agreementId);
    return reply.code(202).send(await createPublication(prisma, deps.chain, request.params.agreementId, creator.id, publicationSchema.parse(request.body)));
  });
  app.get<{ Params: { creatorId: string; agreementId: string; publicationId: string } }>("/api/creators/:creatorId/contracts/:agreementId/publications/:publicationId", async (request) => {
    await ownedCreator(prisma, request, request.params.creatorId, request.params.agreementId);
    const result = await prisma.publication.findUnique({ where: { id: request.params.publicationId } });
    if (!result || result.agreementId !== request.params.agreementId) throw notFound("Publication not found.");
    return result;
  });
  app.post("/internal/jobs/youtube-monitor", async (request) => { requireInternal(request.headers.authorization); return monitorYouTube(prisma, requireChain(deps.chain)); });
  app.post("/internal/jobs/settle-performance", async (request) => { requireInternal(request.headers.authorization); return monitorYouTube(prisma, requireChain(deps.chain)); });
  app.post("/internal/jobs/refund-expired", async (request) => { requireInternal(request.headers.authorization); return refundExpired(prisma, requireChain(deps.chain)); });
  app.post<{ Params: { publicationId: string } }>("/internal/publications/:publicationId/verification", async (request) => {
    requireInternal(request.headers.authorization);
    const input = fingerprintResultSchema.parse(request.body);
    return verifyPublication(prisma, deps.chain, request.params.publicationId, { ...input, publishedAt: new Date(input.publishedAt) });
  });
}

async function ownedCreator(prisma: PrismaClient, request: Parameters<typeof requireUser>[1], creatorId: string, agreementId: string) {
  const user = await requireUser(prisma, request);
  const creator = await getCreatorProfileForUser(prisma, user.id, creatorId);
  await ensureCreatorOwnsAgreement(prisma, creator.id, agreementId);
  return creator;
}
function requireInternal(value?: string) { if (!process.env.INTERNAL_JOB_TOKEN || value !== `Bearer ${process.env.INTERNAL_JOB_TOKEN}`) throw unauthorized("Invalid internal job token."); }
function requireChain(chain?: ChainClient) { if (!chain) throw serviceUnavailable("Blockchain connection is not configured."); return chain; }
