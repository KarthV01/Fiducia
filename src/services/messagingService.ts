import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { conflict, forbidden, notFound } from "../http/errors.js";
import type { DeliverableStorage } from "./deliverableStorage.js";
import { areConnected, getOwnedSocialIdentity, presentSocialProfile } from "./networkService.js";

export const getOwnedSocialIdentityForMessaging = getOwnedSocialIdentity;

const MESSAGE_LIMIT_PER_MINUTE = Number(process.env.MESSAGE_LIMIT_PER_MINUTE ?? 60);
const MAX_ATTACHMENT_TOTAL = 20_000_000;
const ALLOWED_REACTIONS = new Set(["👍", "❤️", "👏", "🎉", "💡", "😂"]);
const ALLOWED_ATTACHMENTS = new Map([
  [".csv", ["text/csv", "application/vnd.ms-excel"]], [".xls", ["application/vnd.ms-excel"]],
  [".xlsx", ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]],
  [".doc", ["application/msword"]], [".docx", ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]],
  [".ppt", ["application/vnd.ms-powerpoint"]], [".pptx", ["application/vnd.openxmlformats-officedocument.presentationml.presentation"]],
  [".pdf", ["application/pdf"]], [".txt", ["text/plain"]], [".gif", ["image/gif"]],
  [".jpg", ["image/jpeg"]], [".jpeg", ["image/jpeg"]], [".png", ["image/png"]],
  [".bmp", ["image/bmp"]], [".mp4", ["video/mp4"]], [".mov", ["video/quicktime"]],
]);

export async function ensureDirectConversation(prisma: PrismaClient, firstId: string, secondId: string, initialNote?: string | null) {
  const directPairKey = pairKey(firstId, secondId);
  const existing = await prisma.conversation.findUnique({ where: { directPairKey } });
  if (existing) return existing;
  if (!await areConnected(prisma, firstId, secondId)) throw conflict("Profiles must be connected before messaging.");
  await ensureNotBlocked(prisma, firstId, secondId);
  return prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.create({
      data: { type: "direct", directPairKey, createdById: firstId, participants: { create: [{ identityId: firstId, role: "member" }, { identityId: secondId, role: "member" }] } },
    });
    if (initialNote?.trim()) {
      const createdAt = new Date();
      await tx.message.create({ data: { conversationId: conversation.id, senderId: firstId, clientMessageId: `connection:${directPairKey}`, type: "connection_note", body: initialNote.trim(), createdAt } });
      await tx.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: createdAt } });
    }
    return conversation;
  });
}

export async function createGroupConversation(prisma: PrismaClient, creatorId: string, title: string, participantIds: string[]) {
  const uniqueIds = [...new Set(participantIds)].filter((id) => id !== creatorId);
  if (uniqueIds.length < 1 || uniqueIds.length > 49) throw conflict("A group must contain between 2 and 50 profiles.");
  for (const identityId of uniqueIds) {
    if (!await areConnected(prisma, creatorId, identityId)) throw conflict("Only connections can be added to a group.");
    await ensureNotBlocked(prisma, creatorId, identityId);
  }
  return prisma.conversation.create({ data: { type: "group", title: title.trim(), createdById: creatorId, participants: { create: [{ identityId: creatorId, role: "owner" }, ...uniqueIds.map((identityId) => ({ identityId, role: "member" }))] } } });
}

export async function listConversations(prisma: PrismaClient, identityId: string, input: { bucket?: string; q?: string }) {
  const query = input.q?.trim().toLowerCase() ?? "";
  const matchingMessages = query ? await prisma.message.findMany({ where: { body: { contains: query } }, select: { conversationId: true } }) : [];
  const matchingConversationIds = new Set(matchingMessages.map((message) => message.conversationId));
  const memberships = await prisma.conversationParticipant.findMany({
    where: { identityId, leftAt: null },
    include: { conversation: { include: { participants: { where: { leftAt: null }, include: { identity: true } }, messages: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, include: messageInclude } } } },
    orderBy: { conversation: { lastMessageAt: "desc" } },
  });
  const filtered = memberships.filter((membership) => {
    const conversation = membership.conversation;
    if (input.bucket === "archived" && !membership.archivedAt) return false;
    if (input.bucket !== "archived" && membership.archivedAt) return false;
    if (input.bucket === "starred" && !membership.starredAt) return false;
    if (input.bucket === "groups" && conversation.type !== "group") return false;
    if (input.bucket === "unread" && (!conversation.lastMessageAt || (membership.lastReadAt && membership.lastReadAt >= conversation.lastMessageAt))) return false;
    if (!query) return true;
    return matchingConversationIds.has(conversation.id) || [conversation.title, ...conversation.participants.map((item) => item.identity.displayName)].filter(Boolean).some((value) => value!.toLowerCase().includes(query));
  });
  return Promise.all(filtered.map(async (membership) => ({
    ...presentConversation(membership.conversation, identityId),
    archived: !!membership.archivedAt,
    starred: !!membership.starredAt,
    mutedUntil: membership.mutedUntil,
    draftText: membership.draftText,
    unreadCount: await prisma.message.count({ where: { conversationId: membership.conversationId, createdAt: { gt: membership.lastReadAt ?? membership.joinedAt }, senderId: { not: identityId } } }),
  })));
}

export async function getConversation(prisma: PrismaClient, identityId: string, conversationId: string) {
  const membership = await requireParticipant(prisma, identityId, conversationId);
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, include: { participants: { where: { leftAt: null }, include: { identity: true } }, messages: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, include: messageInclude } } });
  if (!conversation) throw notFound("Conversation not found.");
  return {
    ...presentConversation(conversation, identityId),
    archived: !!membership.archivedAt,
    starred: !!membership.starredAt,
    mutedUntil: membership.mutedUntil,
    draftText: membership.draftText,
  };
}

export async function listMessages(prisma: PrismaClient, identityId: string, conversationId: string, cursor?: string, limit = 50) {
  await requireParticipant(prisma, identityId, conversationId);
  const messages = await prisma.message.findMany({ where: { conversationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: Math.min(limit, 100), ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), include: messageInclude });
  return { items: messages.reverse().map(presentMessage), nextCursor: messages.length === Math.min(limit, 100) ? messages[0]?.id ?? null : null };
}

export async function sendMessage(prisma: PrismaClient, identityId: string, conversationId: string, input: { clientMessageId: string; body?: string; replyToId?: string; attachmentIds?: string[] }) {
  const membership = await requireParticipant(prisma, identityId, conversationId);
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw notFound("Conversation not found.");
  if (conversation.type === "direct") {
    const other = await prisma.conversationParticipant.findFirst({ where: { conversationId, identityId: { not: identityId }, leftAt: null } });
    if (!other || !await areConnected(prisma, identityId, other.identityId)) throw conflict("This conversation is read-only because the profiles are no longer connected.");
    await ensureNotBlocked(prisma, identityId, other.identityId);
  }
  const body = input.body?.trim() || null;
  const attachmentIds = [...new Set(input.attachmentIds ?? [])];
  if (!body && attachmentIds.length === 0) throw conflict("A message needs text or an attachment.");
  const existing = await prisma.message.findUnique({ where: { senderId_clientMessageId: { senderId: identityId, clientMessageId: input.clientMessageId } }, include: messageInclude });
  if (existing) return presentMessage(existing);
  const since = new Date(Date.now() - 60_000);
  const recent = await prisma.message.count({ where: { senderId: identityId, createdAt: { gte: since } } });
  if (recent >= MESSAGE_LIMIT_PER_MINUTE) throw conflict("Message rate limit reached. Try again shortly.");
  if (input.replyToId) {
    const reply = await prisma.message.findUnique({ where: { id: input.replyToId } });
    if (!reply || reply.conversationId !== conversationId) throw notFound("Reply target not found.");
  }
  const attachments = attachmentIds.length ? await prisma.messageAttachment.findMany({ where: { id: { in: attachmentIds }, conversationId, uploaderId: identityId, messageId: null, status: "complete" } }) : [];
  if (attachments.length !== attachmentIds.length) throw conflict("One or more attachments are unavailable.");
  if (attachments.reduce((sum, item) => sum + item.totalSize, 0) > MAX_ATTACHMENT_TOTAL) throw conflict("Attachments cannot exceed 20 MB per message.");
  const createdAt = new Date();
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({ data: { conversationId, senderId: identityId, clientMessageId: input.clientMessageId, body, replyToId: input.replyToId } });
    if (attachmentIds.length) await tx.messageAttachment.updateMany({ where: { id: { in: attachmentIds } }, data: { messageId: created.id } });
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: createdAt } });
    await tx.conversationParticipant.update({ where: { id: membership.id }, data: { lastReadAt: createdAt, archivedAt: null, draftText: null } });
    return created;
  });
  return presentMessage((await prisma.message.findUnique({ where: { id: message.id }, include: messageInclude }))!);
}

export async function editMessage(prisma: PrismaClient, identityId: string, conversationId: string, messageId: string, body: string) {
  await requireParticipant(prisma, identityId, conversationId);
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.conversationId !== conversationId || message.senderId !== identityId || message.deletedAt) throw notFound("Message not found.");
  return prisma.message.update({ where: { id: messageId }, data: { body: body.trim(), editedAt: new Date() }, include: messageInclude }).then(presentMessage);
}

export async function deleteMessage(prisma: PrismaClient, identityId: string, conversationId: string, messageId: string) {
  await requireParticipant(prisma, identityId, conversationId);
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.conversationId !== conversationId || message.senderId !== identityId) throw notFound("Message not found.");
  return prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
}

export async function toggleReaction(prisma: PrismaClient, identityId: string, conversationId: string, messageId: string, emoji: string) {
  await requireParticipant(prisma, identityId, conversationId);
  if (!ALLOWED_REACTIONS.has(emoji)) throw conflict("Unsupported reaction.");
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.conversationId !== conversationId || message.deletedAt) throw notFound("Message not found.");
  const existing = await prisma.messageReaction.findUnique({ where: { messageId_identityId_emoji: { messageId, identityId, emoji } } });
  if (existing) { await prisma.messageReaction.delete({ where: { id: existing.id } }); return { active: false }; }
  await prisma.messageReaction.create({ data: { messageId, identityId, emoji } });
  return { active: true };
}

export async function updateConversationState(prisma: PrismaClient, identityId: string, conversationId: string, input: { read?: boolean; archived?: boolean; starred?: boolean; mutedUntil?: Date | null; draftText?: string | null }) {
  const membership = await requireParticipant(prisma, identityId, conversationId);
  return prisma.conversationParticipant.update({ where: { id: membership.id }, data: { ...(input.read ? { lastReadAt: new Date() } : {}), ...(input.archived !== undefined ? { archivedAt: input.archived ? new Date() : null } : {}), ...(input.starred !== undefined ? { starredAt: input.starred ? new Date() : null } : {}), ...(input.mutedUntil !== undefined ? { mutedUntil: input.mutedUntil } : {}), ...(input.draftText !== undefined ? { draftText: input.draftText } : {}) } });
}

export async function addGroupMembers(prisma: PrismaClient, identityId: string, conversationId: string, participantIds: string[]) {
  const actor = await requireParticipant(prisma, identityId, conversationId);
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, include: { participants: true } });
  if (!conversation || conversation.type !== "group" || !["owner", "admin"].includes(actor.role)) throw forbidden("Only group admins can add members.");
  const activeCount = conversation.participants.filter((item) => !item.leftAt).length;
  const uniqueIds = [...new Set(participantIds)].filter((id) => !conversation.participants.some((item) => item.identityId === id && !item.leftAt));
  if (activeCount + uniqueIds.length > 50) throw conflict("Groups can contain at most 50 profiles.");
  for (const targetId of uniqueIds) if (!await areConnected(prisma, identityId, targetId)) throw conflict("Only connections can be added to a group.");
  for (const targetId of uniqueIds) await prisma.conversationParticipant.upsert({ where: { conversationId_identityId: { conversationId, identityId: targetId } }, create: { conversationId, identityId: targetId }, update: { leftAt: null, joinedAt: new Date() } });
  return getConversation(prisma, identityId, conversationId);
}

export async function updateGroupTitle(prisma: PrismaClient, identityId: string, conversationId: string, title: string) {
  const actor = await requireParticipant(prisma, identityId, conversationId);
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.type !== "group" || !["owner", "admin"].includes(actor.role)) throw forbidden("Only group admins can rename this conversation.");
  return prisma.conversation.update({ where: { id: conversationId }, data: { title: title.trim() } });
}

export async function updateGroupMember(prisma: PrismaClient, identityId: string, conversationId: string, targetId: string, action: "promote" | "demote" | "remove") {
  const actor = await requireParticipant(prisma, identityId, conversationId);
  const target = await prisma.conversationParticipant.findUnique({ where: { conversationId_identityId: { conversationId, identityId: targetId } } });
  if (!target || target.leftAt) throw notFound("Group member not found.");
  if (target.role === "owner" || target.identityId === identityId) throw conflict("Use the leave action for your own membership.");
  if (action === "remove") {
    if (!["owner", "admin"].includes(actor.role)) throw forbidden("Only group admins can remove members.");
    return prisma.conversationParticipant.update({ where: { id: target.id }, data: { leftAt: new Date() } });
  }
  if (actor.role !== "owner") throw forbidden("Only the group owner can manage admins.");
  return prisma.conversationParticipant.update({ where: { id: target.id }, data: { role: action === "promote" ? "admin" : "member" } });
}

export async function leaveGroup(prisma: PrismaClient, identityId: string, conversationId: string) {
  const membership = await requireParticipant(prisma, identityId, conversationId);
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.type !== "group") throw conflict("Direct conversations cannot be left.");
  if (membership.role === "owner") {
    const successor = await prisma.conversationParticipant.findFirst({ where: { conversationId, identityId: { not: identityId }, leftAt: null }, orderBy: [{ role: "asc" }, { joinedAt: "asc" }] });
    if (successor) await prisma.conversationParticipant.update({ where: { id: successor.id }, data: { role: "owner" } });
  }
  return prisma.conversationParticipant.update({ where: { id: membership.id }, data: { leftAt: new Date() } });
}

export async function initializeMessageAttachment(prisma: PrismaClient, identityId: string, conversationId: string, input: { fileName: string; mimeType: string; totalSize: number }) {
  await requireParticipant(prisma, identityId, conversationId);
  const extension = input.fileName.slice(input.fileName.lastIndexOf(".")).toLowerCase();
  const allowedMimes = ALLOWED_ATTACHMENTS.get(extension);
  if (!allowedMimes?.includes(input.mimeType)) throw conflict("This attachment type is not supported.");
  if (input.totalSize < 1 || input.totalSize > MAX_ATTACHMENT_TOTAL) throw conflict("Attachments must be between 1 byte and 20 MB.");
  const id = randomUUID();
  return prisma.messageAttachment.create({ data: { id, conversationId, uploaderId: identityId, fileName: input.fileName, mimeType: input.mimeType, totalSize: input.totalSize, storageKey: id } });
}

export async function appendMessageAttachment(prisma: PrismaClient, storage: DeliverableStorage, identityId: string, attachmentId: string, offset: number, chunk: Buffer) {
  const attachment = await prisma.messageAttachment.findUnique({ where: { id: attachmentId } });
  if (!attachment || attachment.uploaderId !== identityId) throw notFound("Attachment not found.");
  if (attachment.status !== "uploading" || offset !== attachment.receivedSize || offset + chunk.length > attachment.totalSize) throw conflict("Invalid attachment upload offset.");
  const receivedSize = await storage.append(attachment.storageKey, offset, chunk);
  return prisma.messageAttachment.update({ where: { id: attachment.id }, data: { receivedSize } });
}

export async function completeMessageAttachment(prisma: PrismaClient, storage: DeliverableStorage, identityId: string, attachmentId: string) {
  const attachment = await prisma.messageAttachment.findUnique({ where: { id: attachmentId } });
  if (!attachment || attachment.uploaderId !== identityId) throw notFound("Attachment not found.");
  if (attachment.status === "complete") return attachment;
  if (attachment.receivedSize !== attachment.totalSize) throw conflict("Attachment upload is incomplete.");
  const completed = await storage.complete(attachment.storageKey);
  return prisma.messageAttachment.update({ where: { id: attachment.id }, data: { status: "complete", sha256: completed.sha256 } });
}

export async function requireAttachmentAccess(prisma: PrismaClient, identityId: string, attachmentId: string) {
  const attachment = await prisma.messageAttachment.findUnique({ where: { id: attachmentId } });
  if (!attachment || attachment.status !== "complete" || !attachment.messageId) throw notFound("Attachment not found.");
  await requireParticipant(prisma, identityId, attachment.conversationId);
  return attachment;
}

export async function createProfileReport(prisma: PrismaClient, reporterId: string, targetId: string, input: { messageId?: string; reason: string; details?: string }) {
  if (reporterId === targetId) throw conflict("You cannot report your own profile.");
  return prisma.profileReport.create({ data: { reporterId, targetId, messageId: input.messageId, reason: input.reason, details: input.details } });
}

async function requireParticipant(prisma: PrismaClient, identityId: string, conversationId: string) {
  const membership = await prisma.conversationParticipant.findUnique({ where: { conversationId_identityId: { conversationId, identityId } } });
  if (!membership || membership.leftAt) throw notFound("Conversation not found.");
  return membership;
}

async function ensureNotBlocked(prisma: PrismaClient, firstId: string, secondId: string) {
  const block = await prisma.profileBlock.findFirst({ where: { OR: [{ blockerId: firstId, blockedId: secondId }, { blockerId: secondId, blockedId: firstId }] } });
  if (block) throw conflict("This conversation is unavailable.");
}

function pairKey(firstId: string, secondId: string) { return [firstId, secondId].sort().join("|"); }

const messageInclude = { sender: true, attachments: true, reactions: true, replyTo: { include: { sender: true } } } as const;

function presentMessage(message: any) {
  return { id: message.id, conversationId: message.conversationId, clientMessageId: message.clientMessageId, type: message.type, body: message.deletedAt ? null : message.body, sender: presentSocialProfile(message.sender), replyTo: message.replyTo ? { id: message.replyTo.id, body: message.replyTo.deletedAt ? null : message.replyTo.body, sender: presentSocialProfile(message.replyTo.sender) } : null, attachments: message.deletedAt ? [] : message.attachments, reactions: message.reactions, editedAt: message.editedAt, deletedAt: message.deletedAt, createdAt: message.createdAt };
}

function presentConversation(conversation: any, identityId: string) {
  const others = conversation.participants.filter((item: any) => item.identityId !== identityId).map((item: any) => presentSocialProfile(item.identity));
  return { id: conversation.id, type: conversation.type, title: conversation.type === "direct" ? others[0]?.displayName ?? "Conversation" : conversation.title, participants: conversation.participants.map((item: any) => ({ ...presentSocialProfile(item.identity), role: item.role, joinedAt: item.joinedAt, lastReadAt: item.lastReadAt })), latestMessage: conversation.messages[0] ? presentMessage(conversation.messages[0]) : null, lastMessageAt: conversation.lastMessageAt, createdAt: conversation.createdAt };
}
