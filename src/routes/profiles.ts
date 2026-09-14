import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { ChainClient } from "../blockchain/client.js";
import { requireUser } from "../accounts/auth.js";
import {
  createCreatorProfile,
  createSponsorProfile,
  creatorProfileSchema,
  listProfilesForUser,
  publicCreatorProfile,
  publicSponsorProfile,
  searchCreatorProfiles,
  sponsorProfileSchema,
} from "../accounts/profiles.js";
import { forbidden } from "../http/errors.js";

type RouteDeps = {
  prisma: PrismaClient;
  chain?: ChainClient;
};

export async function registerProfileRoutes(app: FastifyInstance, deps: RouteDeps) {
  const { prisma } = deps;

  app.get("/api/profiles", async (request) => {
    const user = await requireUser(prisma, request);
    const profiles = await listProfilesForUser(prisma, user.id);
    return {
      user,
      sponsors: profiles.sponsors.map(publicSponsorProfile),
      creators: profiles.creators.map(publicCreatorProfile),
    };
  });

  app.post("/api/profiles/sponsors", async (request, reply) => {
    const user = await requireUser(prisma, request);
    if (!user.email) throw forbidden("A verified email sign-in is required to create a sponsor profile.");
    const input = sponsorProfileSchema.parse(request.body);
    const sponsor = await createSponsorProfile(prisma, user.id, input, deps.chain);
    return reply.code(201).send(publicSponsorProfile(sponsor));
  });

  app.post("/api/profiles/creators", async (request, reply) => {
    const user = await requireUser(prisma, request);
    const input = creatorProfileSchema.parse(request.body);
    const creator = await createCreatorProfile(prisma, user.id, input);
    return reply.code(201).send(publicCreatorProfile(creator));
  });

  app.get<{ Querystring: { q?: string } }>("/api/creators/search", async (request) => {
    await requireUser(prisma, request);
    const creators = await searchCreatorProfiles(prisma, request.query.q ?? "");
    return { creators: creators.map(publicCreatorProfile) };
  });
}
