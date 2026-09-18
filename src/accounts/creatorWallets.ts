import type { CreatorProfile, CreatorWalletConnection, PrismaClient } from "@prisma/client";
import { getAddress } from "viem";
import { conflict, notFound } from "../http/errors.js";
import { issueEthereumChallenge, verifyEthereumChallenge } from "./ethereumAuth.js";

type WalletProof = { challengeId: string; message: string; signature: string; walletClient: "metamask" | "walletconnect" };

export function publicCreatorWallet(wallet: CreatorWalletConnection) {
  return {
    id: wallet.id,
    address: wallet.address,
    source: wallet.source,
    isPrimary: wallet.isPrimary,
    verifiedAt: wallet.verifiedAt?.toISOString() ?? null,
    revokedAt: wallet.revokedAt?.toISOString() ?? null,
  };
}

export async function ensureCreatorWalletConnections(prisma: PrismaClient) {
  const creators = await prisma.creatorProfile.findMany({ where: { walletAddress: { not: null } } });
  for (const creator of creators) {
    const existing = await prisma.creatorWalletConnection.findFirst({ where: { creatorProfileId: creator.id } });
    if (existing) continue;
    const address = getAddress(creator.walletAddress!);
    await prisma.$transaction(async (tx) => {
      await tx.creatorWalletConnection.create({ data: { creatorProfileId: creator.id, address, addressKey: address.toLowerCase(), source: "legacy_generated", isPrimary: false } });
      await tx.creatorProfile.update({ where: { id: creator.id }, data: { walletAddress: null } });
    });
  }
}

export async function listCreatorWallets(prisma: PrismaClient, creator: CreatorProfile) {
  return prisma.creatorWalletConnection.findMany({ where: { creatorProfileId: creator.id }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] });
}

export async function createCreatorWalletChallenge(
  prisma: PrismaClient,
  userId: string,
  creator: CreatorProfile,
  input: { address: string; chainId: number },
) {
  return issueEthereumChallenge(prisma, { ...input, purpose: "link_creator", userId, profileId: creator.id });
}

export async function connectCreatorWallet(prisma: PrismaClient, userId: string, creator: CreatorProfile, proof: WalletProof) {
  const challenge = await verifyEthereumChallenge(prisma, proof, { purpose: "link_creator", userId, profileId: creator.id });
  const address = getAddress(challenge.address);
  const addressKey = address.toLowerCase();
  return prisma.$transaction(async (tx) => {
    let identity = await tx.authIdentity.findUnique({ where: { provider_providerSubject: { provider: "ethereum", providerSubject: addressKey } } });
    if (identity && identity.userId !== userId) throw conflict("This wallet is already connected to another account.");
    if (identity) {
      identity = await tx.authIdentity.update({ where: { id: identity.id }, data: { walletAddress: address, lastChainId: challenge.chainId, verifiedAt: new Date(), revokedAt: null } });
    } else {
      identity = await tx.authIdentity.create({ data: { userId, provider: "ethereum", providerSubject: addressKey, walletAddress: address, lastChainId: challenge.chainId } });
    }

    const activeExternalCount = await tx.creatorWalletConnection.count({ where: { creatorProfileId: creator.id, verifiedAt: { not: null }, revokedAt: null } });
    const makePrimary = activeExternalCount === 0;
    if (makePrimary) await tx.creatorWalletConnection.updateMany({ where: { creatorProfileId: creator.id }, data: { isPrimary: false } });
    const wallet = await tx.creatorWalletConnection.upsert({
      where: { creatorProfileId_addressKey: { creatorProfileId: creator.id, addressKey } },
      create: { creatorProfileId: creator.id, authIdentityId: identity.id, address, addressKey, source: proof.walletClient, isPrimary: makePrimary, verifiedAt: new Date() },
      update: { authIdentityId: identity.id, address, source: proof.walletClient, verifiedAt: new Date(), revokedAt: null, ...(makePrimary ? { isPrimary: true } : {}) },
    });
    if (makePrimary) await tx.creatorProfile.update({ where: { id: creator.id }, data: { walletAddress: address } });
    return wallet;
  });
}

export async function makeCreatorWalletPrimary(prisma: PrismaClient, creator: CreatorProfile, walletId: string) {
  const wallet = await ownedWallet(prisma, creator.id, walletId);
  if (wallet.revokedAt || !wallet.verifiedAt) throw conflict("Only an active verified wallet can receive future payouts.");
  return prisma.$transaction(async (tx) => {
    await tx.creatorWalletConnection.updateMany({ where: { creatorProfileId: creator.id }, data: { isPrimary: false } });
    const primary = await tx.creatorWalletConnection.update({ where: { id: wallet.id }, data: { isPrimary: true } });
    await tx.creatorProfile.update({ where: { id: creator.id }, data: { walletAddress: primary.address } });
    return primary;
  });
}

export async function disconnectCreatorWallet(prisma: PrismaClient, userId: string, creator: CreatorProfile, walletId: string) {
  const wallet = await ownedWallet(prisma, creator.id, walletId);
  if (wallet.revokedAt) return wallet;
  if (!wallet.authIdentityId) throw conflict("Historical generated wallets cannot be managed as sign-in identities.");
  const otherUsages = await prisma.creatorWalletConnection.count({ where: { authIdentityId: wallet.authIdentityId, revokedAt: null, id: { not: wallet.id } } });
  if (otherUsages === 0) {
    const alternateLogins = await prisma.authIdentity.count({ where: { userId, revokedAt: null, id: { not: wallet.authIdentityId } } });
    if (alternateLogins === 0) throw conflict("Add another verified sign-in method before disconnecting this wallet.");
  }
  return prisma.$transaction(async (tx) => {
    const revoked = await tx.creatorWalletConnection.update({ where: { id: wallet.id }, data: { revokedAt: new Date(), isPrimary: false } });
    if (wallet.isPrimary) {
      const replacement = await tx.creatorWalletConnection.findFirst({ where: { creatorProfileId: creator.id, revokedAt: null, verifiedAt: { not: null }, id: { not: wallet.id } }, orderBy: { createdAt: "asc" } });
      if (replacement) {
        await tx.creatorWalletConnection.update({ where: { id: replacement.id }, data: { isPrimary: true } });
        await tx.creatorProfile.update({ where: { id: creator.id }, data: { walletAddress: replacement.address } });
      } else {
        await tx.creatorProfile.update({ where: { id: creator.id }, data: { walletAddress: null } });
      }
    }
    if (otherUsages === 0) await tx.authIdentity.update({ where: { id: wallet.authIdentityId! }, data: { revokedAt: new Date() } });
    return revoked;
  });
}

export async function attachWalletIdentityToNewCreator(prisma: PrismaClient, userId: string, creator: CreatorProfile) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user?.email) return creator;
  const identity = await prisma.authIdentity.findFirst({ where: { userId, provider: "ethereum", revokedAt: null }, orderBy: { verifiedAt: "asc" } });
  if (!identity?.walletAddress) return creator;
  const address = getAddress(identity.walletAddress);
  await prisma.$transaction(async (tx) => {
    await tx.creatorWalletConnection.create({ data: { creatorProfileId: creator.id, authIdentityId: identity.id, address, addressKey: address.toLowerCase(), source: "external_verified", isPrimary: true, verifiedAt: identity.verifiedAt } });
    await tx.creatorProfile.update({ where: { id: creator.id }, data: { walletAddress: address } });
  });
  return { ...creator, walletAddress: address };
}

export async function requirePrimaryCreatorWallet(prisma: PrismaClient, creatorId: string) {
  const wallet = await prisma.creatorWalletConnection.findFirst({ where: { creatorProfileId: creatorId, isPrimary: true, verifiedAt: { not: null }, revokedAt: null } });
  if (!wallet) throw conflict("This creator needs a verified payout wallet before contracts can be drafted or accepted.");
  return wallet;
}

export async function requireActiveCreatorPayoutAddress(prisma: PrismaClient, creatorId: string, address: string) {
  const wallet = await prisma.creatorWalletConnection.findUnique({ where: { creatorProfileId_addressKey: { creatorProfileId: creatorId, addressKey: address.toLowerCase() } } });
  if (!wallet || !wallet.verifiedAt || wallet.revokedAt) throw conflict("The payout wallet recorded on this contract is no longer active. The sponsor must refresh or recreate it.");
  return wallet;
}

async function ownedWallet(prisma: PrismaClient, creatorId: string, walletId: string) {
  const wallet = await prisma.creatorWalletConnection.findUnique({ where: { id: walletId } });
  if (!wallet || wallet.creatorProfileId !== creatorId) throw notFound("Creator wallet not found.");
  return wallet;
}
