import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { LocalDeliverableStorage } from "../src/services/deliverableStorage.js";
import { appendMessageAttachment, completeMessageAttachment, initializeMessageAttachment, sendMessage } from "../src/services/messagingService.js";
import { FakePrisma } from "./support/fakes.js";

describe("professional messaging API", () => {
  it("opens a conversation on connection acceptance and supports idempotent rich messages", async () => {
    const prisma = new FakePrisma();
    const app = await buildApp({ prisma: prisma.asPrisma(), logger: false });
    const sponsorUser = await signIn(prisma, "chat-sponsor@example.com");
    const creatorUser = await signIn(prisma, "chat-creator@example.com");
    const sponsor = await createSponsor(app, sponsorUser.cookie, "Chat Brand", "@chatbrand");
    const creator = await createCreator(app, creatorUser.cookie, "Chat Maker", "@chatmaker");
    const sponsorIdentity = `sponsor:${sponsor.id}`;
    const creatorIdentity = `creator:${creator.id}`;

    const requested = await app.inject({ method: "POST", url: `/api/profiles/${encodeURIComponent(sponsorIdentity)}/connections`, headers: { cookie: sponsorUser.cookie }, payload: { recipientId: creatorIdentity, note: "Let's discuss a campaign." } });
    const accepted = await app.inject({ method: "PATCH", url: `/api/profiles/${encodeURIComponent(creatorIdentity)}/connections/${requested.json().id}`, headers: { cookie: creatorUser.cookie }, payload: { action: "accept" } });
    expect(accepted.statusCode, accepted.body).toBe(200);

    const inbox = await app.inject({ method: "GET", url: `/api/profiles/${encodeURIComponent(creatorIdentity)}/conversations`, headers: { cookie: creatorUser.cookie } });
    expect(inbox.statusCode, inbox.body).toBe(200);
    expect(inbox.json().items[0].latestMessage.body).toBe("Let's discuss a campaign.");
    const conversationId = inbox.json().items[0].id;

    const clientMessageId = randomUUID();
    const first = await app.inject({ method: "POST", url: `/api/profiles/${encodeURIComponent(creatorIdentity)}/conversations/${conversationId}/messages`, headers: { cookie: creatorUser.cookie }, payload: { clientMessageId, body: "Sounds good." } });
    const retry = await app.inject({ method: "POST", url: `/api/profiles/${encodeURIComponent(creatorIdentity)}/conversations/${conversationId}/messages`, headers: { cookie: creatorUser.cookie }, payload: { clientMessageId, body: "Sounds good." } });
    expect(first.statusCode, first.body).toBe(201);
    expect(retry.json().id).toBe(first.json().id);

    const reply = await app.inject({ method: "POST", url: `/api/profiles/${encodeURIComponent(sponsorIdentity)}/conversations/${conversationId}/messages`, headers: { cookie: sponsorUser.cookie }, payload: { clientMessageId: randomUUID(), body: "Great—I'll draft it.", replyToId: first.json().id } });
    expect(reply.json().replyTo.body).toBe("Sounds good.");
    const reaction = await app.inject({ method: "POST", url: `/api/profiles/${encodeURIComponent(creatorIdentity)}/conversations/${conversationId}/messages/${reply.json().id}/reactions`, headers: { cookie: creatorUser.cookie }, payload: { emoji: "👍" } });
    expect(reaction.json()).toEqual({ active: true });

    const edited = await app.inject({ method: "PATCH", url: `/api/profiles/${encodeURIComponent(sponsorIdentity)}/conversations/${conversationId}/messages/${reply.json().id}`, headers: { cookie: sponsorUser.cookie }, payload: { body: "Great—I'll draft the terms." } });
    expect(edited.json().body).toContain("terms");
    const messages = await app.inject({ method: "GET", url: `/api/profiles/${encodeURIComponent(creatorIdentity)}/conversations/${conversationId}/messages`, headers: { cookie: creatorUser.cookie } });
    expect(messages.json().items).toHaveLength(3);
  });

  it("requires connections for direct and group conversations", async () => {
    const prisma = new FakePrisma();
    const app = await buildApp({ prisma: prisma.asPrisma(), logger: false });
    const firstUser = await signIn(prisma, "group-one@example.com");
    const secondUser = await signIn(prisma, "group-two@example.com");
    const first = await createCreator(app, firstUser.cookie, "One", "@groupone");
    const second = await createCreator(app, secondUser.cookie, "Two", "@grouptwo");
    const firstIdentity = `creator:${first.id}`;
    const secondIdentity = `creator:${second.id}`;
    const denied = await app.inject({ method: "POST", url: `/api/profiles/${encodeURIComponent(firstIdentity)}/conversations/groups`, headers: { cookie: firstUser.cookie }, payload: { title: "Campaign team", participantIds: [secondIdentity] } });
    expect(denied.statusCode).toBe(409);
  });

  it("validates, resumes, completes, and attaches private professional files", async () => {
    const prisma = new FakePrisma();
    const app = await buildApp({ prisma: prisma.asPrisma(), logger: false });
    const sponsorUser = await signIn(prisma, "files-sponsor@example.com");
    const creatorUser = await signIn(prisma, "files-creator@example.com");
    const sponsor = await createSponsor(app, sponsorUser.cookie, "Files Brand", "@filesbrand");
    const creator = await createCreator(app, creatorUser.cookie, "Files Maker", "@filesmaker");
    const sponsorIdentity = `sponsor:${sponsor.id}`;
    const creatorIdentity = `creator:${creator.id}`;
    const requested = await app.inject({ method: "POST", url: `/api/profiles/${encodeURIComponent(sponsorIdentity)}/connections`, headers: { cookie: sponsorUser.cookie }, payload: { recipientId: creatorIdentity } });
    await app.inject({ method: "PATCH", url: `/api/profiles/${encodeURIComponent(creatorIdentity)}/connections/${requested.json().id}`, headers: { cookie: creatorUser.cookie }, payload: { action: "accept" } });
    const inbox = await app.inject({ method: "GET", url: `/api/profiles/${encodeURIComponent(sponsorIdentity)}/conversations`, headers: { cookie: sponsorUser.cookie } });
    const conversationId = inbox.json().items[0].id;
    await expect(initializeMessageAttachment(prisma.asPrisma(), sponsorIdentity, conversationId, { fileName: "malware.exe", mimeType: "application/octet-stream", totalSize: 4 })).rejects.toThrow("not supported");

    const directory = await mkdtemp(join(tmpdir(), "ytp-chat-"));
    try {
      const storage = new LocalDeliverableStorage(directory);
      const bytes = Buffer.from("campaign brief");
      const attachment = await initializeMessageAttachment(prisma.asPrisma(), sponsorIdentity, conversationId, { fileName: "brief.pdf", mimeType: "application/pdf", totalSize: bytes.length });
      await appendMessageAttachment(prisma.asPrisma(), storage, sponsorIdentity, attachment.id, 0, bytes.subarray(0, 5));
      await appendMessageAttachment(prisma.asPrisma(), storage, sponsorIdentity, attachment.id, 5, bytes.subarray(5));
      await completeMessageAttachment(prisma.asPrisma(), storage, sponsorIdentity, attachment.id);
      const message = await sendMessage(prisma.asPrisma(), sponsorIdentity, conversationId, { clientMessageId: randomUUID(), attachmentIds: [attachment.id] });
      expect(message.attachments[0]).toMatchObject({ fileName: "brief.pdf", status: "complete" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

async function signIn(prisma: FakePrisma, email: string) {
  const user = await prisma.user.create({ data: { email, googleSub: `google-${email}`, name: email.split("@")[0], avatarUrl: null } });
  const token = `token-${email}`;
  await prisma.authSession.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  return { cookie: `ytp_session=${encodeURIComponent(token)}` };
}

async function createSponsor(app: Awaited<ReturnType<typeof buildApp>>, cookie: string, name: string, handle: string) {
  const response = await app.inject({ method: "POST", url: "/api/profiles/sponsors", headers: { cookie }, payload: { name, handle, industry: "Software", monthlyBudgetAmount: "1000000" } });
  expect(response.statusCode, response.body).toBe(201);
  return response.json();
}

async function createCreator(app: Awaited<ReturnType<typeof buildApp>>, cookie: string, displayName: string, handle: string) {
  const response = await app.inject({ method: "POST", url: "/api/profiles/creators", headers: { cookie }, payload: { displayName, handle, category: "Technology" } });
  expect(response.statusCode, response.body).toBe(201);
  return response.json();
}
