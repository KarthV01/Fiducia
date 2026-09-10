import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { ChainClient } from "../blockchain/client.js";
import { createAgreementSchema, metricObservationSchema } from "../domain/validation.js";
import { serviceUnavailable } from "../http/errors.js";
import {
  createAgreementFromInput,
  fundAgreementEscrow,
  getAgreement,
  recordMetricObservation,
} from "../services/agreementService.js";

type RouteDeps = {
  prisma: PrismaClient;
  chain?: ChainClient;
};

export async function registerAgreementRoutes(app: FastifyInstance, deps: RouteDeps) {
  const { prisma } = deps;

  app.post("/agreements", async (request, reply) => {
    const input = createAgreementSchema.parse(request.body);
    return reply.code(201).send(await createAgreementFromInput(prisma, input));
  });

  app.get<{ Params: { id: string } }>("/agreements/:id", async (request) => {
    return getAgreement(prisma, request.params.id);
  });

  app.post<{ Params: { id: string } }>("/agreements/:id/accept", async (request) => {
    const chain = requireChain(deps.chain);
    return fundAgreementEscrow(prisma, chain, request.params.id);
  });

  app.post<{ Params: { id: string } }>("/agreements/:id/metrics", async (request) => {
    const chain = requireChain(deps.chain);
    const input = metricObservationSchema.parse(request.body);
    return recordMetricObservation(prisma, chain, request.params.id, input);
  });
}

function requireChain(chain: ChainClient | undefined): ChainClient {
  if (!chain) {
    throw serviceUnavailable("Blockchain client is not configured");
  }

  return chain;
}
