import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { ChainClient } from "../blockchain/client.js";
import { CONTRACT_INVITE_STATUS } from "../accounts/constants.js";
import { requireUser } from "../accounts/auth.js";
import {
  ensureCreatorOwnsAgreement,
  getCreatorProfileForUser,
  provisionLocalSponsorWallet,
  requirePendingInviteOwnership,
  publicCreatorProfile,
} from "../accounts/profiles.js";
import { buildDashboardTotals, enrichAgreement, presentInvite, summarizeAgreement } from "../accounts/presenters.js";
import { AGREEMENT_STATUS } from "../domain/status.js";
import { deliverableSubmissionSchema, metricObservationSchema } from "../domain/validation.js";
import { serviceUnavailable } from "../http/errors.js";
import {
  agreementInclude,
  fundAgreementEscrow,
  getAgreement,
  listAgreementsForCreatorWallet,
  recordMetricObservation,
} from "../services/agreementService.js";
import { submitDeliverable } from "../services/deliverableService.js";

type RouteDeps = {
  prisma: PrismaClient;
  chain?: ChainClient;
};

export async function registerCreatorRoutes(app: FastifyInstance, deps: RouteDeps) {
  const { prisma } = deps;

  app.get<{ Params: { creatorId: string } }>("/api/creators/:creatorId/dashboard", async (request) => {
    const user = await requireUser(prisma, request);
    const creator = await getCreatorProfileForUser(prisma, user.id, request.params.creatorId);
    const [agreements, sponsors, invites] = await Promise.all([
      listAgreementsForCreatorWallet(prisma, creator.walletAddress),
      prisma.sponsorProfile.findMany(),
      prisma.contractInvite.findMany({
        where: { creatorProfileId: creator.id, status: CONTRACT_INVITE_STATUS.pending },
        include: { sponsorProfile: true, creatorProfile: true, agreement: { include: agreementInclude } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return {
      creator: publicCreatorProfile(creator),
      totals: buildDashboardTotals(agreements),
      contracts: agreements.map((agreement) => summarizeAgreement(agreement, sponsors, [creator])),
      pendingInvites: invites.map(presentInvite),
    };
  });

  app.get<{ Params: { creatorId: string } }>("/api/creators/:creatorId/contracts", async (request) => {
    const user = await requireUser(prisma, request);
    const creator = await getCreatorProfileForUser(prisma, user.id, request.params.creatorId);
    const agreements = await listAgreementsForCreatorWallet(prisma, creator.walletAddress);
    const sponsors = await prisma.sponsorProfile.findMany();
    return agreements.map((agreement) => enrichAgreement(agreement, sponsors, [creator]));
  });

  app.get<{ Params: { creatorId: string; id: string } }>("/api/creators/:creatorId/contracts/:id", async (request) => {
    const user = await requireUser(prisma, request);
    const creator = await getCreatorProfileForUser(prisma, user.id, request.params.creatorId);
    await ensureCreatorOwnsAgreement(prisma, creator.id, request.params.id);
    const agreement = await getAgreement(prisma, request.params.id);
    const sponsors = await prisma.sponsorProfile.findMany();
    return enrichAgreement(agreement, sponsors, [creator]);
  });

  app.get<{ Params: { creatorId: string } }>("/api/creators/:creatorId/invites", async (request) => {
    const user = await requireUser(prisma, request);
    const creator = await getCreatorProfileForUser(prisma, user.id, request.params.creatorId);
    const invites = await prisma.contractInvite.findMany({
      where: { creatorProfileId: creator.id, status: CONTRACT_INVITE_STATUS.pending },
      include: { sponsorProfile: true, creatorProfile: true, agreement: { include: agreementInclude } },
      orderBy: { createdAt: "desc" },
    });
    return { invites: invites.map(presentInvite) };
  });

  app.post<{ Params: { creatorId: string; inviteId: string } }>(
    "/api/creators/:creatorId/invites/:inviteId/accept",
    async (request) => {
      const user = await requireUser(prisma, request);
      const creator = await getCreatorProfileForUser(prisma, user.id, request.params.creatorId);
      const invite = await requirePendingInviteOwnership(prisma, creator.id, request.params.inviteId);
      const chain = requireChain(deps.chain);

      await provisionLocalSponsorWallet(prisma, chain, invite.sponsorProfile, invite.agreement.totalCapAmount);
      await prisma.agreement.update({
        where: { id: invite.agreementId },
        data: { status: AGREEMENT_STATUS.acceptedOffchain },
      });
      const funded = await fundAgreementEscrow(prisma, chain, invite.agreementId);
      const accepted = await prisma.contractInvite.update({
        where: { id: invite.id },
        data: {
          status: CONTRACT_INVITE_STATUS.accepted,
          acceptedAt: new Date(),
        },
        include: { sponsorProfile: true, creatorProfile: true, agreement: { include: agreementInclude } },
      });

      return {
        invite: presentInvite(accepted),
        agreement: enrichAgreement(funded, [invite.sponsorProfile], [creator]),
      };
    },
  );

  app.post<{ Params: { creatorId: string; id: string } }>(
    "/api/creators/:creatorId/contracts/:id/deliverables",
    async (request, reply) => {
      const user = await requireUser(prisma, request);
      const creator = await getCreatorProfileForUser(prisma, user.id, request.params.creatorId);
      await ensureCreatorOwnsAgreement(prisma, creator.id, request.params.id);
      const input = deliverableSubmissionSchema.parse(request.body);
      const submission = await submitDeliverable(prisma, request.params.id, creator.id, input);
      const agreement = await getAgreement(prisma, request.params.id);
      const sponsors = await prisma.sponsorProfile.findMany();
      return reply.code(201).send({ submission, agreement: enrichAgreement(agreement, sponsors, [creator]) });
    },
  );

  app.post<{ Params: { creatorId: string; id: string } }>(
    "/api/creators/:creatorId/contracts/:id/metrics",
    async (request) => {
      const user = await requireUser(prisma, request);
      const creator = await getCreatorProfileForUser(prisma, user.id, request.params.creatorId);
      await ensureCreatorOwnsAgreement(prisma, creator.id, request.params.id);
      const chain = requireChain(deps.chain);
      const input = metricObservationSchema.parse(request.body);
      const result = await recordMetricObservation(prisma, chain, request.params.id, input);
      const sponsors = await prisma.sponsorProfile.findMany();
      return {
        releasedPayoutIds: result.releasedPayoutIds,
        agreement: enrichAgreement(result.agreement, sponsors, [creator]),
      };
    },
  );
}

function requireChain(chain: ChainClient | undefined): ChainClient {
  if (!chain) {
    throw serviceUnavailable("Blockchain connection is not configured.");
  }
  return chain;
}
