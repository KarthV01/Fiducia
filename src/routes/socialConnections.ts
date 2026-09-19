import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "../accounts/auth.js";
import { getCreatorProfileForUser } from "../accounts/profiles.js";
import { badRequest } from "../http/errors.js";
import { completeConnection, disconnectConnection, listConnections, refreshConnection, startConnection, syncOwnedContent } from "../social/connectionService.js";
import { SOCIAL_PROVIDERS } from "../social/types.js";

const providerSchema = z.enum(SOCIAL_PROVIDERS);

export async function registerSocialConnectionRoutes(app: FastifyInstance, deps: { prisma: PrismaClient }) {
  const { prisma } = deps;
  app.post<{ Params: { creatorId: string; provider: string } }>("/api/creators/:creatorId/social-connections/:provider/start", async (request) => {
    const user = await requireUser(prisma, request);
    const creator = await getCreatorProfileForUser(prisma, user.id, request.params.creatorId);
    const provider = providerSchema.parse(request.params.provider);
    const body = z.object({ returnPath: z.string().max(500).optional() }).parse(request.body ?? {});
    return startConnection(prisma, { userId: user.id, creatorProfileId: creator.id, provider, returnPath: body.returnPath });
  });
  app.get<{ Params: { provider: string }; Querystring: { state?: string; code?: string; error?: string } }>("/api/oauth/:provider/callback", async (request, reply) => {
    const user = await requireUser(prisma, request);
    const provider = providerSchema.parse(request.params.provider);
    if (request.query.error) throw badRequest(`${provider} authorization was declined: ${request.query.error}`);
    if (!request.query.state || !request.query.code) throw badRequest("Missing social authorization response.");
    const result = await completeConnection(prisma, { userId: user.id, provider, state: request.query.state, code: request.query.code });
    const appUrl = process.env.APP_URL?.trim() || "http://localhost:5173";
    return reply.redirect(new URL(result.returnPath || "/accounts", appUrl).toString());
  });
  app.get<{ Params: { creatorId: string } }>("/api/creators/:creatorId/social-connections", async (request) => {
    const user = await requireUser(prisma, request);
    const creator = await getCreatorProfileForUser(prisma, user.id, request.params.creatorId);
    return { connections: await listConnections(prisma, creator.id) };
  });
  app.post<{ Params: { creatorId: string; connectionId: string } }>("/api/creators/:creatorId/social-connections/:connectionId/refresh", async (request) => {
    const user = await requireUser(prisma, request);
    const creator = await getCreatorProfileForUser(prisma, user.id, request.params.creatorId);
    return refreshConnection(prisma, creator.id, request.params.connectionId);
  });
  app.delete<{ Params: { creatorId: string; connectionId: string } }>("/api/creators/:creatorId/social-connections/:connectionId", async (request) => {
    const user = await requireUser(prisma, request);
    const creator = await getCreatorProfileForUser(prisma, user.id, request.params.creatorId);
    return disconnectConnection(prisma, creator.id, request.params.connectionId);
  });
  app.get<{ Params: { creatorId: string; connectionId: string }; Querystring: { cursor?: string } }>("/api/creators/:creatorId/social-connections/:connectionId/content", async (request) => {
    const user = await requireUser(prisma, request);
    const creator = await getCreatorProfileForUser(prisma, user.id, request.params.creatorId);
    return syncOwnedContent(prisma, creator.id, request.params.connectionId, request.query.cursor);
  });
}
