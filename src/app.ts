import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError } from "zod";
import type { PrismaClient } from "@prisma/client";
import type { ChainClient } from "./blockchain/client.js";
import { registerAgreementRoutes } from "./routes/agreements.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerCreatorRoutes } from "./routes/creators.js";
import { registerProfileRoutes } from "./routes/profiles.js";
import { registerSponsorRoutes } from "./routes/sponsors.js";
import { HttpError } from "./http/errors.js";
import { registerArtifactRoutes } from "./routes/artifacts.js";

export type AppDependencies = {
  prisma: PrismaClient;
  chain?: ChainClient;
  logger?: boolean;
};

export async function buildApp(deps: AppDependencies) {
  const app = Fastify({
    logger: deps.logger ?? true,
  });

  await app.register(cors, { origin: true });
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: 8 * 1024 * 1024 }, (_request, body, done) => done(null, body));

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: "validation_error",
        details: error.issues,
      });
    }

    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({
        error: "http_error",
        message: error.message,
      });
    }

    app.log.error(error);
    return reply.code(500).send({
      error: "internal_error",
      message: "Unexpected server error",
    });
  });

  app.get("/", async (_request, reply) => {
    const appUrl = process.env.APP_URL?.trim() || "http://localhost:5173";
    return reply.redirect(appUrl);
  });

  app.get("/health", async () => ({
    ok: true,
  }));

  await app.register(registerAgreementRoutes, deps);
  await app.register(registerAuthRoutes, deps);
  await app.register(registerProfileRoutes, deps);
  await app.register(registerSponsorRoutes, deps);
  await app.register(registerCreatorRoutes, deps);
  await app.register(registerArtifactRoutes, deps);

  return app;
}
