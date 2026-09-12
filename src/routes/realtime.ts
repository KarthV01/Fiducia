import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { RawData } from "ws";
import { requireUser } from "../accounts/auth.js";
import { getOwnedSocialIdentity } from "../services/networkService.js";
import type { RealtimePublisher } from "../services/realtimeService.js";

const clientEventSchema = z.object({ type: z.literal("typing"), conversationId: z.string().min(1), active: z.boolean() });

export async function registerRealtimeRoutes(app: FastifyInstance, deps: { prisma: PrismaClient; realtime: RealtimePublisher }) {
  app.get<{ Params: { identityId: string } }>("/api/realtime/:identityId", { websocket: true }, (socket, request) => {
    let unsubscribe: () => void = () => undefined;
    void (async () => {
      try {
        const user = await requireUser(deps.prisma, request);
        const identity = await getOwnedSocialIdentity(deps.prisma, user.id, request.params.identityId);
        unsubscribe = deps.realtime.subscribe(identity.id, socket);
        socket.send(JSON.stringify({ type: "ready", profileId: identity.id, sequence: 0, occurredAt: new Date().toISOString(), payload: null }));
        socket.on("message", (raw: RawData) => {
          void (async () => {
            const parsed = clientEventSchema.safeParse(JSON.parse(raw.toString()));
            if (!parsed.success || !identity.typingIndicatorsEnabled) return;
            const membership = await deps.prisma.conversationParticipant.findUnique({ where: { conversationId_identityId: { conversationId: parsed.data.conversationId, identityId: identity.id } } });
            if (!membership || membership.leftAt) return;
            const recipients = await deps.prisma.conversationParticipant.findMany({ where: { conversationId: parsed.data.conversationId, leftAt: null, identityId: { not: identity.id } }, include: { identity: true } });
            deps.realtime.publish(recipients.filter((item) => item.identity.typingIndicatorsEnabled).map((item) => item.identityId), "typing", { identityId: identity.id, displayName: identity.displayName, active: parsed.data.active }, parsed.data.conversationId);
          })().catch(() => undefined);
        });
      } catch {
        socket.close(1008, "Unauthorized");
      }
    })();
    socket.on("close", () => unsubscribe());
  });
}
