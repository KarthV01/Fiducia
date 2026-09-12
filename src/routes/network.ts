import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "../accounts/auth.js";
import { blockProfile, getOwnedSocialIdentity, listConnections, removeConnection, requestConnection, respondToConnection, searchSocialProfiles, unblockProfile } from "../services/networkService.js";
import { ensureDirectConversation } from "../services/messagingService.js";
import type { RealtimePublisher } from "../services/realtimeService.js";

const searchSchema = z.object({ q: z.string().max(100).optional(), relationship: z.enum(["all", "none", "connected", "incoming", "outgoing"]).optional(), profileType: z.enum(["all", "sponsor", "creator"]).optional(), cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(50).optional() });
const requestSchema = z.object({ recipientId: z.string().min(1), note: z.string().max(300).optional() });
const responseSchema = z.object({ action: z.enum(["accept", "decline", "withdraw"]) });

export async function registerNetworkRoutes(app: FastifyInstance, deps: { prisma: PrismaClient; realtime?: RealtimePublisher }) {
  const { prisma } = deps;

  app.get<{ Params: { identityId: string } }>("/api/profiles/:identityId/search", async (request) => {
    const identity = await ownedIdentity(prisma, request, request.params.identityId);
    return searchSocialProfiles(prisma, identity.id, searchSchema.parse(request.query));
  });

  app.get<{ Params: { identityId: string }; Querystring: { bucket?: string } }>("/api/profiles/:identityId/connections", async (request) => {
    const identity = await ownedIdentity(prisma, request, request.params.identityId);
    const bucket = z.enum(["incoming", "outgoing", "connected"]).default("connected").parse(request.query.bucket);
    return { items: await listConnections(prisma, identity.id, bucket), nextCursor: null };
  });

  app.post<{ Params: { identityId: string } }>("/api/profiles/:identityId/connections", async (request, reply) => {
    const identity = await ownedIdentity(prisma, request, request.params.identityId);
    const input = requestSchema.parse(request.body);
    const connection = await requestConnection(prisma, identity.id, input.recipientId, input.note);
    deps.realtime?.publish([connection.requesterId, connection.recipientId], "connection.updated", connection);
    return reply.code(201).send(connection);
  });

  app.patch<{ Params: { identityId: string; connectionId: string } }>("/api/profiles/:identityId/connections/:connectionId", async (request) => {
    const identity = await ownedIdentity(prisma, request, request.params.identityId);
    const action = responseSchema.parse(request.body).action;
    const connection = await respondToConnection(prisma, identity.id, request.params.connectionId, action);
    if (action === "accept") await ensureDirectConversation(prisma, connection.requesterId, connection.recipientId, connection.note);
    deps.realtime?.publish([connection.requesterId, connection.recipientId], "connection.updated", connection);
    return connection;
  });

  app.delete<{ Params: { identityId: string; connectionId: string } }>("/api/profiles/:identityId/connections/:connectionId", async (request, reply) => {
    const identity = await ownedIdentity(prisma, request, request.params.identityId);
    const connection = await removeConnection(prisma, identity.id, request.params.connectionId);
    deps.realtime?.publish([connection.requesterId, connection.recipientId], "connection.updated", connection);
    return reply.code(204).send();
  });

  app.post<{ Params: { identityId: string; targetId: string } }>("/api/profiles/:identityId/blocks/:targetId", async (request, reply) => {
    const identity = await ownedIdentity(prisma, request, request.params.identityId);
    const block = await blockProfile(prisma, identity.id, request.params.targetId);
    deps.realtime?.publish([identity.id, request.params.targetId], "connection.updated", { blockerId: identity.id, blockedId: request.params.targetId, status: "blocked" });
    return reply.code(201).send(block);
  });

  app.delete<{ Params: { identityId: string; targetId: string } }>("/api/profiles/:identityId/blocks/:targetId", async (request, reply) => {
    const identity = await ownedIdentity(prisma, request, request.params.identityId);
    await unblockProfile(prisma, identity.id, request.params.targetId);
    deps.realtime?.publish([identity.id, request.params.targetId], "connection.updated", { blockerId: identity.id, blockedId: request.params.targetId, status: "unblocked" });
    return reply.code(204).send();
  });
}

async function ownedIdentity(prisma: PrismaClient, request: Parameters<typeof requireUser>[1], identityId: string) {
  const user = await requireUser(prisma, request);
  return getOwnedSocialIdentity(prisma, user.id, identityId);
}
