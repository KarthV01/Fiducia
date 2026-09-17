import type { AuthIdentity, PrismaClient } from "@prisma/client";
import { getAddress } from "viem";
import { conflict } from "../http/errors.js";
import { issueEthereumChallenge, verifyEthereumChallenge } from "./ethereumAuth.js";

type WalletProof = { challengeId: string; message: string; signature: string; walletClient: "metamask" };

export function publicAccountWallet(identity: AuthIdentity) {
  return {
    id: identity.id,
    address: identity.walletAddress!,
    provider: identity.provider,
    verifiedAt: identity.verifiedAt.toISOString(),
    revokedAt: identity.revokedAt?.toISOString() ?? null,
  };
}

export async function listAccountWallets(prisma: PrismaClient, userId: string) {
  return prisma.authIdentity.findMany({
    where: { userId, provider: "ethereum" },
    orderBy: { verifiedAt: "asc" },
  });
}

export async function hasVerifiedAccountWallet(prisma: PrismaClient, userId: string) {
  return (await prisma.authIdentity.count({ where: { userId, provider: "ethereum", revokedAt: null } })) > 0;
}

export async function requireVerifiedAccountWallet(prisma: PrismaClient, userId: string) {
  if (!await hasVerifiedAccountWallet(prisma, userId)) {
    throw conflict("Connect and verify a wallet on this account before using contract features.");
  }
}

export async function createAccountWalletChallenge(prisma: PrismaClient, userId: string, input: { address: string; chainId: number }) {
  return issueEthereumChallenge(prisma, { ...input, purpose: "link_account", userId });
}

export async function connectAccountWallet(prisma: PrismaClient, userId: string, proof: WalletProof) {
  const challenge = await verifyEthereumChallenge(prisma, proof, { purpose: "link_account", userId });
  const address = getAddress(challenge.address);
  const subject = address.toLowerCase();
  return prisma.$transaction(async (tx) => {
    const existing = await tx.authIdentity.findUnique({ where: { provider_providerSubject: { provider: "ethereum", providerSubject: subject } } });
    if (existing && existing.userId !== userId) throw conflict("This wallet is already connected to another account.");
    if (existing) {
      return tx.authIdentity.update({ where: { id: existing.id }, data: { walletAddress: address, lastChainId: challenge.chainId, verifiedAt: new Date(), revokedAt: null } });
    }
    return tx.authIdentity.create({ data: { userId, provider: "ethereum", providerSubject: subject, walletAddress: address, lastChainId: challenge.chainId } });
  });
}
