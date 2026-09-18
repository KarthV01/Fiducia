import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { buildGoogleAuthUrl, createAuthSession, getCurrentUser, handleGoogleCallback, logout, publicUser, requireUser } from "../accounts/auth.js";
import { createEthereumChallenge, verifyEthereumSession } from "../accounts/ethereumAuth.js";
import { connectAccountWallet, createAccountWalletChallenge, listAccountWallets, publicAccountWallet } from "../accounts/accountWallets.js";
import { z } from "zod";

type RouteDeps = {
  prisma: PrismaClient;
};

export async function registerAuthRoutes(app: FastifyInstance, deps: RouteDeps) {
  const { prisma } = deps;

  app.get("/api/auth/google/start", async (_request, reply) => {
    return reply.redirect(buildGoogleAuthUrl(reply));
  });

  app.post("/api/auth/ethereum/challenges", async (request, reply) => {
    const input = z.object({ address: z.string().max(64), chainId: z.number().int().positive() }).parse(request.body);
    return reply.code(201).send(await createEthereumChallenge(prisma, input));
  });

  app.post("/api/auth/ethereum/sessions", async (request, reply) => {
    const input = z.object({ challengeId: z.string().min(1).max(128), message: z.string().min(1).max(4_096), signature: z.string().regex(/^0x[0-9a-fA-F]+$/).max(1_024), walletClient: z.enum(["metamask", "walletconnect"]) }).parse(request.body);
    const user = await verifyEthereumSession(prisma, input);
    await createAuthSession(prisma, reply, user.id);
    return { user: publicUser(user) };
  });

  app.get("/api/auth/wallets", async (request) => {
    const user = await requireUser(prisma, request);
    return { wallets: (await listAccountWallets(prisma, user.id)).map(publicAccountWallet) };
  });

  app.post("/api/auth/wallets/challenges", async (request, reply) => {
    const user = await requireUser(prisma, request);
    const input = z.object({ address: z.string().max(64), chainId: z.number().int().positive() }).parse(request.body);
    return reply.code(201).send(await createAccountWalletChallenge(prisma, user.id, input));
  });

  app.post("/api/auth/wallets", async (request, reply) => {
    const user = await requireUser(prisma, request);
    const proof = z.object({ challengeId: z.string().min(1).max(128), message: z.string().min(1).max(4_096), signature: z.string().regex(/^0x[0-9a-fA-F]+$/).max(1_024), walletClient: z.enum(["metamask", "walletconnect"]) }).parse(request.body);
    return reply.code(201).send(publicAccountWallet(await connectAccountWallet(prisma, user.id, proof)));
  });

  app.get("/api/auth/google/callback", async (request, reply) => {
    const appUrl = await handleGoogleCallback(prisma, request, reply);
    return reply.redirect(appUrl);
  });

  app.get("/api/auth/me", async (request) => {
    const user = await getCurrentUser(prisma, request);
    return { user };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    await logout(prisma, request, reply);
    return { ok: true };
  });
}
