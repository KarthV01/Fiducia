import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { ChainClient } from "../blockchain/client.js";
import { requireUser } from "../accounts/auth.js";
import { ensureCreatorOwnsAgreement, ensureSponsorOwnsAgreement, getCreatorProfileForUser, getSponsorProfileForUser } from "../accounts/profiles.js";
import { serviceUnavailable, unauthorized } from "../http/errors.js";
import { agreementMeasurementEvidence, attachAgreementContent, monitorSocialMeasurements } from "../social/measurementService.js";

export async function registerSocialMeasurementRoutes(app: FastifyInstance, deps: { prisma: PrismaClient; chain?: ChainClient }) {
  const { prisma } = deps;
  app.post<{ Params: { creatorId: string; agreementId: string } }>("/api/creators/:creatorId/contracts/:agreementId/social-publications", async (request, reply) => {
    const user = await requireUser(prisma, request);
    const creator = await getCreatorProfileForUser(prisma, user.id, request.params.creatorId);
    await ensureCreatorOwnsAgreement(prisma, creator.id, request.params.agreementId);
    const body = z.object({ socialContentId: z.string().min(1), publishMode: z.enum(["api", "manual"]).default("manual") }).parse(request.body);
    return reply.code(201).send(await attachAgreementContent(prisma, { agreementId: request.params.agreementId, creatorProfileId: creator.id, ...body }));
  });
  app.get<{ Params: { creatorId: string; agreementId: string } }>("/api/creators/:creatorId/contracts/:agreementId/measurement-evidence", async (request) => {
    const user = await requireUser(prisma, request);
    const creator = await getCreatorProfileForUser(prisma, user.id, request.params.creatorId);
    await ensureCreatorOwnsAgreement(prisma, creator.id, request.params.agreementId);
    return { contents: await agreementMeasurementEvidence(prisma, request.params.agreementId) };
  });
  app.get<{ Params: { sponsorId: string; agreementId: string } }>("/api/sponsors/:sponsorId/contracts/:agreementId/measurement-evidence", async (request) => {
    const user = await requireUser(prisma, request);
    const sponsor = await getSponsorProfileForUser(prisma, user.id, request.params.sponsorId);
    await ensureSponsorOwnsAgreement(prisma, sponsor.id, request.params.agreementId);
    return { contents: await agreementMeasurementEvidence(prisma, request.params.agreementId) };
  });
  app.post("/internal/jobs/social-monitor", async (request) => {
    if (!process.env.INTERNAL_JOB_TOKEN || request.headers.authorization !== `Bearer ${process.env.INTERNAL_JOB_TOKEN}`) throw unauthorized("Invalid internal job token.");
    if (!deps.chain) throw serviceUnavailable("Blockchain connection is not configured.");
    return monitorSocialMeasurements(prisma, deps.chain);
  });
}
