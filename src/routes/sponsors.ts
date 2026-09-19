import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { ChainClient } from "../blockchain/client.js";
import { DISCOVERY_METRICS, tokenForChain } from "../accounts/constants.js";
import { contractInviteFormSchema, buildAgreementInputFromContractInvite } from "../accounts/contractBuilder.js";
import { requireUser } from "../accounts/auth.js";
import {
  ensureSponsorOwnsAgreement,
  getCreatorProfile,
  getSponsorProfileForUser,
  publicSponsorProfile,
} from "../accounts/profiles.js";
import { buildDashboardTotals, enrichAgreement, presentInvite, summarizeAgreement } from "../accounts/presenters.js";
import { deliverableReviewSchema, metricObservationSchema } from "../domain/validation.js";
import { conflict, serviceUnavailable } from "../http/errors.js";
import {
  agreementInclude,
  createAgreementFromInput,
  getAgreement,
  listAgreementsForBrandWallet,
  recordMetricObservation,
} from "../services/agreementService.js";
import { reviewDeliverable } from "../services/deliverableService.js";
import { areConnected, socialIdentityId } from "../services/networkService.js";
import { requirePrimaryCreatorWallet } from "../accounts/creatorWallets.js";
import { hasVerifiedAccountWallet, requireVerifiedAccountWallet } from "../accounts/accountWallets.js";

type RouteDeps = {
  prisma: PrismaClient;
  chain?: ChainClient;
};

export async function registerSponsorRoutes(app: FastifyInstance, deps: RouteDeps) {
  const { prisma } = deps;

  app.get<{ Params: { sponsorId: string } }>("/api/sponsors/:sponsorId/dashboard", async (request) => {
    const user = await requireUser(prisma, request);
    const sponsor = await getSponsorProfileForUser(prisma, user.id, request.params.sponsorId);
    const [agreements, sponsors, creators, invites, walletConnected] = await Promise.all([
      listAgreementsForBrandWallet(prisma, sponsor.walletAddress),
      prisma.sponsorProfile.findMany({ where: { id: sponsor.id } }),
      prisma.creatorProfile.findMany(),
      prisma.contractInvite.findMany({
        where: { sponsorProfileId: sponsor.id, status: "pending" },
        include: { sponsorProfile: true, creatorProfile: true, agreement: { include: agreementInclude } },
        orderBy: { createdAt: "desc" },
      }),
      hasVerifiedAccountWallet(prisma, user.id),
    ]);

    return {
      sponsor: publicSponsorProfile(sponsor),
      totals: buildDashboardTotals(agreements),
      contracts: agreements.map((agreement) => summarizeAgreement(agreement, sponsors, creators)),
      pendingInvites: invites.map(presentInvite),
      walletConnected,
    };
  });

  app.get<{ Params: { sponsorId: string } }>("/api/sponsors/:sponsorId/contract-builder", async (request) => {
    const user = await requireUser(prisma, request);
    const sponsor = await getSponsorProfileForUser(prisma, user.id, request.params.sponsorId);

    return {
      sponsor: publicSponsorProfile(sponsor),
      walletConnected: await hasVerifiedAccountWallet(prisma, user.id),
      metrics: DISCOVERY_METRICS,
      token: {
        ...tokenForChain(deps.chain?.chainId),
        address: deps.chain?.defaultTokenAddress ?? null,
      },
      defaults: {
        measurementWindowDays: 30,
        viewMilestones: [],
      },
    };
  });

  app.get<{ Params: { sponsorId: string } }>("/api/sponsors/:sponsorId/contracts", async (request) => {
    const user = await requireUser(prisma, request);
    const sponsor = await getSponsorProfileForUser(prisma, user.id, request.params.sponsorId);
    const agreements = await listAgreementsForBrandWallet(prisma, sponsor.walletAddress);
    const creators = await prisma.creatorProfile.findMany();
    return agreements.map((agreement) => enrichAgreement(agreement, [sponsor], creators));
  });

  app.get<{ Params: { sponsorId: string; id: string } }>("/api/sponsors/:sponsorId/contracts/:id", async (request) => {
    const user = await requireUser(prisma, request);
    const sponsor = await getSponsorProfileForUser(prisma, user.id, request.params.sponsorId);
    await ensureSponsorOwnsAgreement(prisma, sponsor.id, request.params.id);
    const agreement = await getAgreement(prisma, request.params.id);
    const creators = await prisma.creatorProfile.findMany();
    return enrichAgreement(agreement, [sponsor], creators);
  });

  app.post<{ Params: { sponsorId: string } }>("/api/sponsors/:sponsorId/contract-invites", async (request, reply) => {
    const user = await requireUser(prisma, request);
    const sponsor = await getSponsorProfileForUser(prisma, user.id, request.params.sponsorId);
    await requireVerifiedAccountWallet(prisma, user.id);
    const input = contractInviteFormSchema.parse(request.body);
    const creator = await getCreatorProfile(prisma, input.creatorProfileId);
    if (!await areConnected(prisma, socialIdentityId("sponsor", sponsor.id), socialIdentityId("creator", creator.id))) {
      throw conflict("Connect with this creator before drafting a contract.");
    }
    const payoutWallet = await requirePrimaryCreatorWallet(prisma, creator.id);
    const agreementInput = buildAgreementInputFromContractInvite(
      input,
      sponsor,
      { ...creator, walletAddress: payoutWallet.address },
      deps.chain?.defaultTokenAddress,
    );
    const agreement = await createAgreementFromInput(prisma, agreementInput);
    for (const deliverable of input.platformDeliverables) {
      const label = deliverable.provider === "x" ? "X" : deliverable.provider[0].toUpperCase() + deliverable.provider.slice(1);
      const publicationPayout = agreement.payouts.find((payout) => payout.kind === "publication" && payout.label === `${label} verified publication`);
      const retentionPayout = agreement.payouts.find((payout) => payout.kind === "retention" && payout.label === `${label} live-window retention`);
      await prisma.agreementContent.create({ data: {
        agreementId: agreement.id,
        creatorProfileId: creator.id,
        provider: deliverable.provider,
        status: "awaiting_publication",
        requirementsJson: JSON.stringify({ publicationRequirements: deliverable.requirements }),
        measurementSpecJson: JSON.stringify({ metricKeys: agreement.metrics.filter((metric) => metric.key.startsWith(`${deliverable.provider}.`)).map((metric) => metric.key), confirmations: 2 }),
        publicationPayoutId: publicationPayout?.id,
        retentionPayoutId: retentionPayout?.id,
        idempotencyKey: `agreement-content-template:${agreement.id}:${deliverable.provider}`,
      } });
    }
    const invite = await prisma.contractInvite.create({
      data: {
        sponsorProfileId: sponsor.id,
        creatorProfileId: creator.id,
        agreementId: agreement.id,
      },
      include: {
        sponsorProfile: true,
        creatorProfile: true,
        agreement: { include: agreementInclude },
      },
    });

    return reply.code(201).send(presentInvite(invite));
  });

  app.post<{ Params: { sponsorId: string; id: string; submissionId: string } }>(
    "/api/sponsors/:sponsorId/contracts/:id/submissions/:submissionId/review",
    async (request) => {
      const user = await requireUser(prisma, request);
      const sponsor = await getSponsorProfileForUser(prisma, user.id, request.params.sponsorId);
      await ensureSponsorOwnsAgreement(prisma, sponsor.id, request.params.id);
      const input = deliverableReviewSchema.parse(request.body);
      const result = await reviewDeliverable(
        prisma,
        deps.chain,
        request.params.id,
        request.params.submissionId,
        sponsor.id,
        input,
      );
      const creators = await prisma.creatorProfile.findMany();
      return {
        releasedPayoutIds: result.releasedPayoutIds,
        agreement: enrichAgreement(result.agreement, [sponsor], creators),
      };
    },
  );

  app.post<{ Params: { sponsorId: string; id: string } }>(
    "/api/sponsors/:sponsorId/contracts/:id/metrics",
    async (request) => {
      if (process.env.ENABLE_SIMULATION_METRICS !== "true") throw serviceUnavailable("Simulation metrics are disabled.");
      const user = await requireUser(prisma, request);
      const sponsor = await getSponsorProfileForUser(prisma, user.id, request.params.sponsorId);
      await ensureSponsorOwnsAgreement(prisma, sponsor.id, request.params.id);
      const chain = requireChain(deps.chain);
      const input = metricObservationSchema.parse(request.body);
      const result = await recordMetricObservation(prisma, chain, request.params.id, input);
      const creators = await prisma.creatorProfile.findMany();
      return {
        releasedPayoutIds: result.releasedPayoutIds,
        agreement: enrichAgreement(result.agreement, [sponsor], creators),
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
