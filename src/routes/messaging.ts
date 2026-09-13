import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "../accounts/auth.js";
import { badRequest } from "../http/errors.js";
import { LocalDeliverableStorage } from "../services/deliverableStorage.js";
import type { RealtimePublisher } from "../services/realtimeService.js";
import { messagingCounts } from "../services/messagingService.js";
import { addGroupMembers, appendMessageAttachment, completeMessageAttachment, createGroupConversation, createProfileReport, deleteMessage, editMessage, ensureDirectConversation, getConversation, getOwnedSocialIdentityForMessaging, initializeMessageAttachment, leaveGroup, listConversations, listMessages, requireAttachmentAccess, sendMessage, toggleReaction, updateConversationState, updateGroupMember, updateGroupTitle } from "../services/messagingService.js";

const storage = new LocalDeliverableStorage();
const groupSchema = z.object({ title: z.string().min(1).max(100), participantIds: z.array(z.string().min(1)).min(1).max(49) });
const messageSchema = z.object({ clientMessageId: z.string().min(1).max(100), body: z.string().max(8000).optional(), replyToId: z.string().optional(), attachmentIds: z.array(z.string().uuid()).max(10).optional() });
const stateSchema = z.object({ read: z.boolean().optional(), readThrough: z.coerce.date().optional(), archived: z.boolean().optional(), starred: z.boolean().optional(), mutedUntil: z.coerce.date().nullable().optional(), draftText: z.string().max(8000).nullable().optional() });
const attachmentSchema = z.object({ fileName: z.string().min(1).max(255), mimeType: z.string().min(1), totalSize: z.number().int().positive() });
const inboxSchema = z.object({ bucket: z.enum(["inbox", "unread", "starred", "archived", "groups"]).optional(), q: z.string().max(100).optional(), cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(50).default(30) });

export async function registerMessagingRoutes(app: FastifyInstance, deps: { prisma: PrismaClient; realtime?: RealtimePublisher }) {
  const { prisma } = deps;
  app.get<{ Params: { identityId: string }; Querystring: { bucket?: string; q?: string } }>("/api/profiles/:identityId/conversations", async (request) => {
    const identity = await ownedIdentity(prisma, request, request.params.identityId);
    return listConversations(prisma, identity.id, inboxSchema.parse(request.query));
  });
  app.get<{ Params: { identityId: string } }>("/api/profiles/:identityId/messaging-counts", async (request) => {
    const identity = await ownedIdentity(prisma, request, request.params.identityId);
    return messagingCounts(prisma, identity.id);
  });
  app.post<{ Params: { identityId: string } }>("/api/profiles/:identityId/conversations/direct", async (request, reply) => {
    const identity = await ownedIdentity(prisma, request, request.params.identityId);
    const input = z.object({ recipientId: z.string().min(1) }).parse(request.body);
    const conversation = await ensureDirectConversation(prisma, identity.id, input.recipientId);
    await publishConversation(prisma, deps.realtime, conversation.id, "conversation.updated", { conversationId: conversation.id });
    return reply.code(201).send(conversation);
  });
  app.post<{ Params: { identityId: string } }>("/api/profiles/:identityId/conversations/groups", async (request, reply) => {
    const identity = await ownedIdentity(prisma, request, request.params.identityId);
    const input = groupSchema.parse(request.body);
    const conversation = await createGroupConversation(prisma, identity.id, input.title, input.participantIds);
    await publishConversation(prisma, deps.realtime, conversation.id, "conversation.created", { conversationId: conversation.id });
    return reply.code(201).send(conversation);
  });
  app.get<{ Params: { identityId: string; conversationId: string } }>("/api/profiles/:identityId/conversations/:conversationId", async (request) => {
    const identity = await ownedIdentity(prisma, request, request.params.identityId);
    return getConversation(prisma, identity.id, request.params.conversationId);
  });
  app.patch<{ Params: { identityId: string; conversationId: string } }>("/api/profiles/:identityId/conversations/:conversationId", async (request) => {
    const identity = await ownedIdentity(prisma, request, request.params.identityId);
    const conversation = await updateGroupTitle(prisma, identity.id, request.params.conversationId, z.object({ title: z.string().min(1).max(100) }).parse(request.body).title);
    await publishConversation(prisma, deps.realtime, request.params.conversationId, "membership.updated", { conversationId: request.params.conversationId, title: conversation.title });
    return conversation;
  });
  app.get<{ Params: { identityId: string; conversationId: string }; Querystring: { cursor?: string; limit?: string } }>("/api/profiles/:identityId/conversations/:conversationId/messages", async (request) => {
    const identity = await ownedIdentity(prisma, request, request.params.identityId);
    return listMessages(prisma, identity.id, request.params.conversationId, request.query.cursor, Number(request.query.limit ?? 50));
  });
  app.post<{ Params: { identityId: string; conversationId: string } }>("/api/profiles/:identityId/conversations/:conversationId/messages", async (request, reply) => {
    const identity = await ownedIdentity(prisma, request, request.params.identityId);
    const message = await sendMessage(prisma, identity.id, request.params.conversationId, messageSchema.parse(request.body));
    await publishConversation(prisma, deps.realtime, request.params.conversationId, "message.created", message);
    return reply.code(201).send(message);
  });
  app.patch<{ Params: { identityId: string; conversationId: string; messageId: string } }>("/api/profiles/:identityId/conversations/:conversationId/messages/:messageId", async (request) => {
    const identity = await ownedIdentity(prisma, request, request.params.identityId);
    const message = await editMessage(prisma, identity.id, request.params.conversationId, request.params.messageId, z.object({ body: z.string().min(1).max(8000) }).parse(request.body).body);
    await publishConversation(prisma, deps.realtime, request.params.conversationId, "message.updated", message);
    return message;
  });
  app.delete<{ Params: { identityId: string; conversationId: string; messageId: string } }>("/api/profiles/:identityId/conversations/:conversationId/messages/:messageId", async (request, reply) => {
    const identity = await ownedIdentity(prisma, request, request.params.identityId);
    await deleteMessage(prisma, identity.id, request.params.conversationId, request.params.messageId);
    await publishConversation(prisma, deps.realtime, request.params.conversationId, "message.deleted", { messageId: request.params.messageId });
    return reply.code(204).send();
  });
  app.post<{ Params: { identityId: string; conversationId: string; messageId: string } }>("/api/profiles/:identityId/conversations/:conversationId/messages/:messageId/reactions", async (request) => {
    const identity = await ownedIdentity(prisma, request, request.params.identityId);
    const result = await toggleReaction(prisma, identity.id, request.params.conversationId, request.params.messageId, z.object({ emoji: z.string().min(1).max(8) }).parse(request.body).emoji);
    await publishConversation(prisma, deps.realtime, request.params.conversationId, "reaction.updated", { messageId: request.params.messageId });
    return result;
  });
  app.patch<{ Params: { identityId: string; conversationId: string } }>("/api/profiles/:identityId/conversations/:conversationId/state", async (request) => {
    const identity = await ownedIdentity(prisma, request, request.params.identityId);
    const input = stateSchema.parse(request.body);
    const state = await updateConversationState(prisma, identity.id, request.params.conversationId, input);
    if (state.readChanged) await publishConversation(prisma, deps.realtime, request.params.conversationId, "conversation.read", { identityId: identity.id, readAt: state.lastReadAt });
    return state;
  });
  app.post<{ Params: { identityId: string; conversationId: string } }>("/api/profiles/:identityId/conversations/:conversationId/members", async (request) => {
    const identity = await ownedIdentity(prisma, request, request.params.identityId);
    const conversation = await addGroupMembers(prisma, identity.id, request.params.conversationId, z.object({ participantIds: z.array(z.string()).min(1).max(49) }).parse(request.body).participantIds);
    await publishConversation(prisma, deps.realtime, request.params.conversationId, "membership.updated", { conversationId: request.params.conversationId });
    return conversation;
  });
  app.patch<{ Params: { identityId: string; conversationId: string; targetId: string } }>("/api/profiles/:identityId/conversations/:conversationId/members/:targetId", async (request) => {
    const identity = await ownedIdentity(prisma, request, request.params.identityId);
    const action = z.object({ action: z.enum(["promote", "demote", "remove"]) }).parse(request.body).action;
    const membership = await updateGroupMember(prisma, identity.id, request.params.conversationId, request.params.targetId, action);
    await publishConversation(prisma, deps.realtime, request.params.conversationId, "membership.updated", { targetId: request.params.targetId, action });
    return membership;
  });
  app.delete<{ Params: { identityId: string; conversationId: string } }>("/api/profiles/:identityId/conversations/:conversationId/members/me", async (request, reply) => {
    const identity = await ownedIdentity(prisma, request, request.params.identityId);
    await leaveGroup(prisma, identity.id, request.params.conversationId);
    await publishConversation(prisma, deps.realtime, request.params.conversationId, "membership.updated", { targetId: identity.id, action: "leave" });
    return reply.code(204).send();
  });
  app.post<{ Params: { identityId: string; conversationId: string } }>("/api/profiles/:identityId/conversations/:conversationId/attachments", async (request, reply) => {
    const identity = await ownedIdentity(prisma, request, request.params.identityId);
    return reply.code(201).send(await initializeMessageAttachment(prisma, identity.id, request.params.conversationId, attachmentSchema.parse(request.body)));
  });
  app.patch<{ Params: { identityId: string; attachmentId: string } }>("/api/profiles/:identityId/attachments/:attachmentId", async (request, reply) => {
    const identity = await ownedIdentity(prisma, request, request.params.identityId);
    const offset = Number(request.headers["upload-offset"]);
    if (!Number.isSafeInteger(offset) || offset < 0 || !Buffer.isBuffer(request.body)) throw badRequest("A valid Upload-Offset and binary chunk are required.");
    const attachment = await appendMessageAttachment(prisma, storage, identity.id, request.params.attachmentId, offset, request.body);
    return reply.header("Upload-Offset", attachment.receivedSize).code(204).send();
  });
  app.post<{ Params: { identityId: string; attachmentId: string } }>("/api/profiles/:identityId/attachments/:attachmentId/complete", async (request) => {
    const identity = await ownedIdentity(prisma, request, request.params.identityId);
    return completeMessageAttachment(prisma, storage, identity.id, request.params.attachmentId);
  });
  app.get<{ Params: { identityId: string; attachmentId: string } }>("/api/profiles/:identityId/attachments/:attachmentId/content", async (request, reply) => {
    const identity = await ownedIdentity(prisma, request, request.params.identityId);
    const attachment = await requireAttachmentAccess(prisma, identity.id, request.params.attachmentId);
    const file = await storage.read(attachment.storageKey);
    reply.header("Content-Type", attachment.mimeType).header("Content-Length", file.size).header("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`);
    return reply.send(file.stream);
  });
  app.post<{ Params: { identityId: string; targetId: string } }>("/api/profiles/:identityId/reports/:targetId", async (request, reply) => {
    const identity = await ownedIdentity(prisma, request, request.params.identityId);
    const input = z.object({ messageId: z.string().optional(), reason: z.enum(["spam", "harassment", "fraud", "other"]), details: z.string().max(2000).optional() }).parse(request.body);
    return reply.code(201).send(await createProfileReport(prisma, identity.id, request.params.targetId, input));
  });
}

async function ownedIdentity(prisma: PrismaClient, request: Parameters<typeof requireUser>[1], identityId: string) {
  const user = await requireUser(prisma, request);
  return getOwnedSocialIdentityForMessaging(prisma, user.id, identityId);
}

async function publishConversation(prisma: PrismaClient, realtime: RealtimePublisher | undefined, conversationId: string, type: string, payload: unknown) {
  if (!realtime) return;
  const participants = await prisma.conversationParticipant.findMany({ where: { conversationId, leftAt: null } });
  realtime.publish(participants.map((item) => item.identityId), type, payload, conversationId);
}
