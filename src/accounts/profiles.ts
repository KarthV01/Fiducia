import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { z } from "zod";
import type { ChainClient } from "../blockchain/client.js";
import { LOCAL_CHAIN_ID } from "../blockchain/networks.js";
import { conflict, forbidden, notFound, serviceUnavailable } from "../http/errors.js";
import { CONTRACT_INVITE_STATUS, PROFILE_ROLE } from "./constants.js";
import type { PrismaClient, SponsorProfile, CreatorProfile } from "@prisma/client";
import { attachWalletIdentityToNewCreator } from "./creatorWallets.js";

const handleInput = z
  .string()
  .min(2)
  .max(32)
  .transform((value) => normalizeHandle(value))
  .refine((value) => /^@[a-z0-9._-]{2,31}$/.test(value), "Use a handle like @creatorname");

export const sponsorProfileSchema = z.object({
  name: z.string().min(1),
  handle: handleInput,
  industry: z.string().min(1),
  websiteUrl: z.string().url().optional().or(z.literal("")).transform(emptyToNull),
  logoUrl: z.string().url().optional().or(z.literal("")).transform(emptyToNull),
  monthlyBudgetAmount: z
    .string()
    .regex(/^(0|[1-9]\d*)$/, "Must be an integer token-unit amount")
    .default("0"),
});

export const creatorProfileSchema = z.object({
  handle: handleInput,
  displayName: z.string().min(1),
  channelUrl: z.string().url().optional().or(z.literal("")).transform(emptyToNull),
  category: z.string().min(1),
  audience: z.string().optional().or(z.literal("")).transform(emptyToNull),
  avatarUrl: z.string().url().optional().or(z.literal("")).transform(emptyToNull),
});

export type SponsorProfileInput = z.infer<typeof sponsorProfileSchema>;
export type CreatorProfileInput = z.infer<typeof creatorProfileSchema>;

export async function listProfilesForUser(prisma: PrismaClient, userId: string) {
  const [sponsors, creators] = await Promise.all([
    prisma.sponsorProfile.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.creatorProfile.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return { sponsors, creators };
}

export async function createSponsorProfile(
  prisma: PrismaClient,
  userId: string,
  input: SponsorProfileInput,
  chain?: ChainClient,
) {
  assertGeneratedWalletAllowed(chain);
  await ensureHandleAvailable(prisma, input.handle, "sponsor");
  const wallet = generateWallet();

  const sponsor = await prisma.$transaction(async (tx) => {
    const profile = await tx.sponsorProfile.create({
      data: {
        userId,
        name: input.name,
        handle: input.handle,
        walletAddress: wallet.address,
        industry: input.industry,
        websiteUrl: input.websiteUrl,
        logoUrl: input.logoUrl,
        monthlyBudgetAmount: input.monthlyBudgetAmount,
      },
    });

    await tx.profileWallet.create({
      data: {
        profileType: PROFILE_ROLE.sponsor,
        profileId: profile.id,
        walletAddress: wallet.address,
        privateKey: wallet.privateKey,
      },
    });

    await tx.socialIdentity.create({
      data: socialIdentityDataForSponsor(profile),
    });

    return profile;
  });

  if (chain?.chainId === LOCAL_CHAIN_ID) {
    await provisionLocalSponsorWallet(prisma, chain, sponsor, "1000000000000");
  }

  return sponsor;
}

export async function createCreatorProfile(prisma: PrismaClient, userId: string, input: CreatorProfileInput) {
  await ensureHandleAvailable(prisma, input.handle, "creator");
  const profile = await prisma.$transaction(async (tx) => {
    const profile = await tx.creatorProfile.create({
      data: {
        userId,
        handle: input.handle,
        displayName: input.displayName,
        walletAddress: null,
        channelUrl: input.channelUrl,
        category: input.category,
        audience: input.audience,
        avatarUrl: input.avatarUrl,
      },
    });

    await tx.socialIdentity.create({
      data: socialIdentityDataForCreator(profile),
    });

    return profile;
  });
  return attachWalletIdentityToNewCreator(prisma, userId, profile);
}

export async function getSponsorProfileForUser(
  prisma: PrismaClient,
  userId: string,
  sponsorId: string,
): Promise<SponsorProfile> {
  const sponsor = await prisma.sponsorProfile.findUnique({
    where: { id: sponsorId },
  });

  if (!sponsor || sponsor.userId !== userId) {
    throw notFound("Sponsor profile not found.");
  }

  return sponsor;
}

export async function getCreatorProfileForUser(
  prisma: PrismaClient,
  userId: string,
  creatorId: string,
): Promise<CreatorProfile> {
  const creator = await prisma.creatorProfile.findUnique({
    where: { id: creatorId },
  });

  if (!creator || creator.userId !== userId) {
    throw notFound("Creator profile not found.");
  }

  return creator;
}

export async function getCreatorProfile(prisma: PrismaClient, creatorId: string): Promise<CreatorProfile> {
  const creator = await prisma.creatorProfile.findUnique({
    where: { id: creatorId },
  });

  if (!creator) {
    throw notFound("Creator profile not found.");
  }

  return creator;
}

export async function searchCreatorProfiles(prisma: PrismaClient, query: string) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) {
    return [];
  }

  const creators = await prisma.creatorProfile.findMany({
    orderBy: { displayName: "asc" },
    take: 20,
  });

  return creators.filter((creator) =>
    [creator.handle, creator.displayName, creator.category]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(q)),
  );
}

export async function provisionLocalSponsorWallet(
  prisma: PrismaClient,
  chain: ChainClient,
  sponsor: SponsorProfile,
  minimumTokenAmount: string,
) {
  if (chain.chainId !== LOCAL_CHAIN_ID || !chain.prepareLocalSponsorWallet) {
    throw serviceUnavailable("Generated sponsor wallet funding is only supported on local Anvil.");
  }

  const wallet = await prisma.profileWallet.findUnique({
    where: {
      profileType_profileId: {
        profileType: PROFILE_ROLE.sponsor,
        profileId: sponsor.id,
      },
    },
  });

  if (!wallet) {
    throw serviceUnavailable("Sponsor generated wallet is not available.");
  }

  await chain.prepareLocalSponsorWallet({
    walletAddress: sponsor.walletAddress,
    privateKey: wallet.privateKey as Hex,
    minimumTokenAmount,
  });

  await prisma.profileWallet.update({
    where: { id: wallet.id },
    data: { provisionedAt: new Date() },
  });
}

export async function requirePendingInviteOwnership(
  prisma: PrismaClient,
  creatorProfileId: string,
  inviteId: string,
) {
  const invite = await prisma.contractInvite.findUnique({
    where: { id: inviteId },
    include: { sponsorProfile: true, creatorProfile: true, agreement: { include: { participants: true } } },
  });

  if (!invite || invite.creatorProfileId !== creatorProfileId) {
    throw notFound("Contract invite not found.");
  }

  if (invite.status !== CONTRACT_INVITE_STATUS.pending) {
    throw conflict("Contract invite has already been accepted.");
  }

  return invite;
}

export async function ensureSponsorOwnsAgreement(prisma: PrismaClient, sponsorId: string, agreementId: string) {
  const invite = await prisma.contractInvite.findUnique({
    where: { agreementId },
    include: { sponsorProfile: true, creatorProfile: true },
  });

  if (!invite || invite.sponsorProfileId !== sponsorId) {
    throw notFound("Contract not found.");
  }

  return invite;
}

export async function ensureCreatorOwnsAgreement(prisma: PrismaClient, creatorId: string, agreementId: string) {
  const invite = await prisma.contractInvite.findUnique({
    where: { agreementId },
    include: { sponsorProfile: true, creatorProfile: true },
  });

  if (!invite || invite.creatorProfileId !== creatorId) {
    throw notFound("Contract not found.");
  }

  return invite;
}

export function publicSponsorProfile(sponsor: SponsorProfile) {
  return {
    id: sponsor.id,
    name: sponsor.name,
    handle: sponsor.handle,
    walletAddress: sponsor.walletAddress,
    industry: sponsor.industry,
    websiteUrl: sponsor.websiteUrl,
    logoUrl: sponsor.logoUrl,
    monthlyBudgetAmount: sponsor.monthlyBudgetAmount,
  };
}

export function publicCreatorProfile(creator: CreatorProfile) {
  return {
    id: creator.id,
    handle: creator.handle,
    displayName: creator.displayName,
    walletAddress: creator.walletAddress,
    channelUrl: creator.channelUrl,
    category: creator.category,
    averageViews: creator.averageViews,
    audience: creator.audience,
    avatarUrl: creator.avatarUrl,
  };
}

function assertGeneratedWalletAllowed(chain?: ChainClient) {
  if (chain && chain.chainId !== LOCAL_CHAIN_ID) {
    throw forbidden("Generated profile wallets are only allowed on local Anvil.");
  }
}

async function ensureHandleAvailable(prisma: PrismaClient, handle: string, kind: "sponsor" | "creator") {
  const existing =
    kind === "sponsor"
      ? await prisma.sponsorProfile.findUnique({ where: { handle } })
      : await prisma.creatorProfile.findUnique({ where: { handle } });

  if (existing) {
    throw conflict("That account handle is already taken.");
  }
}

function generateWallet() {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return {
    address: account.address,
    privateKey,
  };
}

function normalizeHandle(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

function emptyToNull(value: string | undefined): string | null {
  return value?.trim() ? value.trim() : null;
}

export function socialIdentityDataForSponsor(sponsor: SponsorProfile) {
  return {
    id: `sponsor:${sponsor.id}`,
    userId: sponsor.userId,
    profileType: PROFILE_ROLE.sponsor,
    sponsorProfileId: sponsor.id,
    handle: sponsor.handle,
    displayName: sponsor.name,
    avatarUrl: sponsor.logoUrl,
    descriptor: sponsor.industry,
    searchText: [sponsor.name, sponsor.handle, sponsor.industry].join(" ").toLowerCase(),
  };
}

export function socialIdentityDataForCreator(creator: CreatorProfile) {
  return {
    id: `creator:${creator.id}`,
    userId: creator.userId,
    profileType: PROFILE_ROLE.creator,
    creatorProfileId: creator.id,
    handle: creator.handle,
    displayName: creator.displayName,
    avatarUrl: creator.avatarUrl,
    descriptor: creator.category,
    searchText: [creator.displayName, creator.handle, creator.category, creator.audience].filter(Boolean).join(" ").toLowerCase(),
  };
}
