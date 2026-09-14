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
import { conflict, serviceUnavailable } from "../http/errors.js";
import {
  agreementInclude,
  fundAgreementEscrow,
  getAgreement,
  listAgreementsForCreatorProfile,
} from "../services/agreementService.js";
import { areConnected, socialIdentityId } from "../services/networkService.js";
import { connectCreatorWallet, createCreatorWalletChallenge, disconnectCreatorWallet, listCreatorWallets, makeCreatorWalletPrimary, publicCreatorWallet, requireActiveCreatorPayoutAddress } from "../accounts/creatorWallets.js";
import { z } from "zod";
import { PARTICIPANT_ROLE } from "../domain/status.js";

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
      listAgreementsForCreatorProfile(prisma, creator.id),
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
    const agreements = await listAgreementsForCreatorProfile(prisma, creator.id);
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
      if (!await areConnected(prisma, socialIdentityId("sponsor", invite.sponsorProfileId), socialIdentityId("creator", creator.id))) {
        throw conflict("Connect with the sponsor before accepting this contract.");
      }
      const recordedCreator = invite.agreement.participants.find((participant) => participant.role === PARTICIPANT_ROLE.creator);
      if (!recordedCreator) throw conflict("This contract does not contain a creator payout address.");
      await requireActiveCreatorPayoutAddress(prisma, creator.id, recordedCreator.walletAddress);
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

  app.get<{ Params: { creatorId: string } }>("/api/creators/:creatorId/wallets", async (request) => {
    const user = await requireUser(prisma, request);
    const creator = await getCreatorProfileForUser(prisma, user.id, request.params.creatorId);
    return { wallets: (await listCreatorWallets(prisma, creator)).map(publicCreatorWallet) };
  });

  app.post<{ Params: { creatorId: string } }>("/api/creators/:creatorId/wallets/challenges", async (request, reply) => {
    const user = await requireUser(prisma, request);
    const creator = await getCreatorProfileForUser(prisma, user.id, request.params.creatorId);
    const input = z.object({ address: z.string().max(64), chainId: z.number().int().positive() }).parse(request.body);
    return reply.code(201).send(await createCreatorWalletChallenge(prisma, user.id, creator, input));
  });

  app.post<{ Params: { creatorId: string } }>("/api/creators/:creatorId/wallets", async (request, reply) => {
    const user = await requireUser(prisma, request);
    const creator = await getCreatorProfileForUser(prisma, user.id, request.params.creatorId);
    const proof = z.object({ challengeId: z.string().min(1).max(128), message: z.string().min(1).max(4_096), signature: z.string().regex(/^0x[0-9a-fA-F]+$/).max(1_024), walletClient: z.literal("metamask") }).parse(request.body);
    return reply.code(201).send(publicCreatorWallet(await connectCreatorWallet(prisma, user.id, creator, proof)));
  });

  app.patch<{ Params: { creatorId: string; walletId: string } }>("/api/creators/:creatorId/wallets/:walletId", async (request) => {
    const user = await requireUser(prisma, request);
    const creator = await getCreatorProfileForUser(prisma, user.id, request.params.creatorId);
    z.object({ isPrimary: z.literal(true) }).parse(request.body);
    return publicCreatorWallet(await makeCreatorWalletPrimary(prisma, creator, request.params.walletId));
  });

  app.delete<{ Params: { creatorId: string; walletId: string } }>("/api/creators/:creatorId/wallets/:walletId", async (request) => {
    const user = await requireUser(prisma, request);
    const creator = await getCreatorProfileForUser(prisma, user.id, request.params.creatorId);
    return publicCreatorWallet(await disconnectCreatorWallet(prisma, user.id, creator, request.params.walletId));
  });

}

function requireChain(chain: ChainClient | undefined): ChainClient {
  if (!chain) {
    throw serviceUnavailable("Blockchain connection is not configured.");
  }
  return chain;
}
