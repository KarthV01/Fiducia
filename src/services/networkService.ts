import type { PrismaClient, SocialIdentity } from "@prisma/client";
import { conflict, notFound } from "../http/errors.js";
import { socialIdentityDataForCreator, socialIdentityDataForSponsor } from "../accounts/profiles.js";

export const CONNECTION_STATUS = {
  pending: "pending",
  accepted: "accepted",
  declined: "declined",
  withdrawn: "withdrawn",
  removed: "removed",
} as const;

const DAILY_CONNECTION_REQUEST_LIMIT = Number(process.env.CONNECTION_REQUEST_LIMIT_PER_DAY ?? 50);

export function socialIdentityId(profileType: "sponsor" | "creator", profileId: string) {
  return `${profileType}:${profileId}`;
}

export async function ensureSocialIdentities(prisma: PrismaClient) {
  const [sponsors, creators, identities] = await Promise.all([
    prisma.sponsorProfile.findMany(),
    prisma.creatorProfile.findMany(),
    prisma.socialIdentity.findMany({ select: { id: true } }),
  ]);
  const existing = new Set(identities.map((identity) => identity.id));
  const missing = [...sponsors.map(socialIdentityDataForSponsor), ...creators.map(socialIdentityDataForCreator)].filter((data) => !existing.has(data.id));
  if (missing.length) await prisma.$transaction(missing.map((data) => prisma.socialIdentity.create({ data })));
}

export async function getOwnedSocialIdentity(prisma: PrismaClient, userId: string, identityId: string) {
  const identity = await prisma.socialIdentity.findUnique({ where: { id: identityId } });
  if (!identity || identity.userId !== userId) throw notFound("Profile not found.");
  return identity;
}

export async function searchSocialProfiles(
  prisma: PrismaClient,
  activeIdentityId: string,
  input: { q?: string; relationship?: string; profileType?: string; cursor?: string; limit?: number },
) {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const query = input.q?.trim().toLowerCase() ?? "";
  const [connections, blocks] = await Promise.all([
    prisma.connection.findMany({
      where: { OR: [{ requesterId: activeIdentityId }, { recipientId: activeIdentityId }] },
    }),
    prisma.profileBlock.findMany({
      where: { OR: [{ blockerId: activeIdentityId }, { blockedId: activeIdentityId }] },
    }),
  ]);
  const blockedIds = new Set(blocks.map((block) => block.blockerId === activeIdentityId ? block.blockedId : block.blockerId));
  const connectionByIdentity = new Map<string, typeof connections[number]>();
  for (const connection of connections) {
    const otherId = connection.requesterId === activeIdentityId ? connection.recipientId : connection.requesterId;
    connectionByIdentity.set(otherId, connection);
  }

  const relatedIds = [...connectionByIdentity].filter(([, connection]) => relationshipFor(activeIdentityId, connection) !== "none").map(([id]) => id);
  const matchingIds = [...connectionByIdentity].filter(([, connection]) => relationshipFor(activeIdentityId, connection) === input.relationship).map(([id]) => id);
  const identities = await prisma.socialIdentity.findMany({
    where: {
      id: {
        notIn: [activeIdentityId, ...blockedIds, ...(input.relationship === "none" ? relatedIds : [])],
        ...(input.relationship && !["all", "none"].includes(input.relationship) ? { in: matchingIds } : {}),
      },
      ...(input.profileType && input.profileType !== "all" ? { profileType: input.profileType } : {}),
      ...(query ? { searchText: { contains: query } } : {}),
    },
    orderBy: [{ displayName: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const items = identities.slice(0, limit).map((identity) => presentSocialProfile(identity, relationshipFor(activeIdentityId, connectionByIdentity.get(identity.id))));
  return { items, nextCursor: identities.length > limit ? items.at(-1)!.id : null };
}

export async function listConnections(prisma: PrismaClient, identityId: string, bucket: "incoming" | "outgoing" | "connected") {
  const connections = await prisma.connection.findMany({
    where: bucket === "incoming"
      ? { recipientId: identityId, status: CONNECTION_STATUS.pending }
      : bucket === "outgoing"
        ? { requesterId: identityId, status: CONNECTION_STATUS.pending }
        : { status: CONNECTION_STATUS.accepted, OR: [{ requesterId: identityId }, { recipientId: identityId }] },
    orderBy: { updatedAt: "desc" },
  });
  const filtered = connections.filter((connection) => bucket === "incoming"
    ? connection.recipientId === identityId && connection.status === CONNECTION_STATUS.pending
    : bucket === "outgoing"
      ? connection.requesterId === identityId && connection.status === CONNECTION_STATUS.pending
      : connection.status === CONNECTION_STATUS.accepted && (connection.requesterId === identityId || connection.recipientId === identityId));
  const otherIds = filtered.map((connection) => connection.requesterId === identityId ? connection.recipientId : connection.requesterId);
  const identities = await prisma.socialIdentity.findMany({ where: { id: { in: otherIds } } });
  const byId = new Map(identities.map((identity) => [identity.id, identity]));
  return filtered.flatMap((connection) => {
    const otherId = connection.requesterId === identityId ? connection.recipientId : connection.requesterId;
    const other = byId.get(otherId);
    return other ? [{
      id: connection.id,
      status: connection.status,
      direction: connection.requesterId === identityId ? "outgoing" : "incoming",
      note: connection.note,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
      profile: presentSocialProfile(other, relationshipFor(identityId, connection)),
    }] : [];
  });
}

export async function requestConnection(prisma: PrismaClient, requesterId: string, recipientId: string, note?: string) {
  if (requesterId === recipientId) throw conflict("You cannot connect with your own profile.");
  const recipient = await prisma.socialIdentity.findUnique({ where: { id: recipientId } });
  if (!recipient) throw notFound("Profile not found.");
  await ensureNotBlocked(prisma, requesterId, recipientId);
  const pairKey = connectionPairKey(requesterId, recipientId);
  const existing = await prisma.connection.findUnique({ where: { pairKey } });
  if (existing?.status === CONNECTION_STATUS.accepted) throw conflict("These profiles are already connected.");
  if (existing?.status === CONNECTION_STATUS.pending) throw conflict("A connection request is already pending.");
  const since = new Date(Date.now() - 86_400_000);
  const recent = await prisma.connection.count({ where: { requesterId, createdAt: { gte: since } } });
  if (recent >= DAILY_CONNECTION_REQUEST_LIMIT) throw conflict("Daily connection request limit reached.");
  const data = { requesterId, recipientId, status: CONNECTION_STATUS.pending, note: note?.trim() || null, respondedAt: null };
  return existing
    ? prisma.connection.update({ where: { id: existing.id }, data })
    : prisma.connection.create({ data: { pairKey, ...data } });
}

export async function respondToConnection(prisma: PrismaClient, identityId: string, connectionId: string, action: "accept" | "decline" | "withdraw") {
  const connection = await prisma.connection.findUnique({ where: { id: connectionId } });
  if (!connection || connection.status !== CONNECTION_STATUS.pending) throw notFound("Pending connection request not found.");
  if (action === "withdraw") {
    if (connection.requesterId !== identityId) throw notFound("Pending connection request not found.");
    return prisma.connection.update({ where: { id: connection.id }, data: { status: CONNECTION_STATUS.withdrawn, respondedAt: new Date() } });
  }
  if (connection.recipientId !== identityId) throw notFound("Pending connection request not found.");
  await ensureNotBlocked(prisma, connection.requesterId, connection.recipientId);
  return prisma.connection.update({ where: { id: connection.id }, data: { status: action === "accept" ? CONNECTION_STATUS.accepted : CONNECTION_STATUS.declined, respondedAt: new Date() } });
}

export async function removeConnection(prisma: PrismaClient, identityId: string, connectionId: string) {
  const connection = await prisma.connection.findUnique({ where: { id: connectionId } });
  if (!connection || connection.status !== CONNECTION_STATUS.accepted || (connection.requesterId !== identityId && connection.recipientId !== identityId)) throw notFound("Connection not found.");
  return prisma.connection.update({ where: { id: connection.id }, data: { status: CONNECTION_STATUS.removed, respondedAt: new Date() } });
}

export async function blockProfile(prisma: PrismaClient, blockerId: string, blockedId: string) {
  if (blockerId === blockedId) throw conflict("You cannot block your own profile.");
  const target = await prisma.socialIdentity.findUnique({ where: { id: blockedId } });
  if (!target) throw notFound("Profile not found.");
  const existingBlock = await prisma.profileBlock.findUnique({ where: { blockerId_blockedId: { blockerId, blockedId } } });
  if (existingBlock) return existingBlock;
  return prisma.$transaction(async (tx) => {
    const connection = await tx.connection.findUnique({ where: { pairKey: connectionPairKey(blockerId, blockedId) } });
    if (connection && (connection.status === CONNECTION_STATUS.accepted || connection.status === CONNECTION_STATUS.pending)) {
      await tx.connection.update({ where: { id: connection.id }, data: { status: CONNECTION_STATUS.removed, respondedAt: new Date() } });
    }
    return tx.profileBlock.create({ data: { blockerId, blockedId } });
  });
}

export async function unblockProfile(prisma: PrismaClient, blockerId: string, blockedId: string) {
  await prisma.profileBlock.deleteMany({ where: { blockerId, blockedId } });
}

export async function areConnected(prisma: PrismaClient, firstId: string, secondId: string) {
  const connection = await prisma.connection.findUnique({ where: { pairKey: connectionPairKey(firstId, secondId) } });
  return connection?.status === CONNECTION_STATUS.accepted;
}

export function presentSocialProfile(identity: SocialIdentity, relationship: string = "none") {
  return { id: identity.id, profileType: identity.profileType, profileId: identity.sponsorProfileId ?? identity.creatorProfileId!, handle: identity.handle, displayName: identity.displayName, avatarUrl: identity.avatarUrl, descriptor: identity.descriptor, relationship };
}

function relationshipFor(activeId: string, connection?: { requesterId: string; status: string }) {
  if (!connection || ![CONNECTION_STATUS.pending, CONNECTION_STATUS.accepted].includes(connection.status as typeof CONNECTION_STATUS.pending | typeof CONNECTION_STATUS.accepted)) return "none";
  if (connection.status === CONNECTION_STATUS.accepted) return "connected";
  return connection.requesterId === activeId ? "outgoing" : "incoming";
}

function connectionPairKey(firstId: string, secondId: string) {
  return [firstId, secondId].sort().join("|");
}

async function ensureNotBlocked(prisma: PrismaClient, firstId: string, secondId: string) {
  const block = await prisma.profileBlock.findFirst({ where: { OR: [{ blockerId: firstId, blockedId: secondId }, { blockerId: secondId, blockedId: firstId }] } });
  if (block) throw conflict("These profiles cannot connect.");
}
