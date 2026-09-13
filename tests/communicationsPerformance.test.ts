import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { buildApp } from "../src/app.js";
import { getOwnedSocialIdentity, searchSocialProfiles } from "../src/services/networkService.js";
import { listConversations, messagingCounts } from "../src/services/messagingService.js";
import { InMemoryRealtimePublisher } from "../src/services/realtimeService.js";

describe("communications performance on SQLite", () => {
  let directory: string;
  let prisma: PrismaClient;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const realtime = new InMemoryRealtimePublisher();
  const publish = vi.spyOn(realtime, "publish");
  const queries: string[] = [];
  const joinedAt = new Date("2026-01-01T00:00:00Z");
  const createdAt = new Date("2026-01-02T00:00:00Z");
  const cookie = "ytp_session=performance-token";

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "ytp-performance-"));
    const url = `file:${join(directory, "test.db").replaceAll("\\", "/")}`;
    // Initialize the SQLite file before invoking the Windows schema engine.
    const empty = new PrismaClient({ datasources: { db: { url } } });
    await empty.$connect();
    await empty.$disconnect();
    execFileSync(process.execPath, [createRequire(import.meta.url).resolve("prisma/build/index.js"), "db", "push", "--skip-generate", "--schema", resolve("prisma/schema.prisma")], {
      env: { ...process.env, DATABASE_URL: url }, stdio: "pipe", windowsHide: true,
    });
    const client = new PrismaClient({ datasources: { db: { url } }, log: [{ emit: "event", level: "query" }] });
    client.$on("query", (event) => queries.push(event.query));
    prisma = client;
    await prisma.user.create({ data: { id: "owner", email: "performance@example.com" } });
    await prisma.authSession.create({ data: { userId: "owner", tokenHash: createHash("sha256").update("performance-token").digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
    // Exercise discovery beyond the old 500-row truncation.
    await prisma.$transaction(Array.from({ length: 505 }, (_, index) => prisma.socialIdentity.create({
      data: { id: `profile-${index}`, userId: "owner", profileType: "creator", handle: `@person${index}`, displayName: `Person ${String(index).padStart(3, "0")}`, searchText: `person ${index}` },
    })));
    await prisma.profileBlock.create({ data: { blockerId: "profile-0", blockedId: "profile-504" } });
    await prisma.connection.create({ data: { pairKey: "0|1", requesterId: "profile-1", recipientId: "profile-0", status: "pending" } });
    await prisma.connection.create({ data: { pairKey: "2|3", requesterId: "profile-2", recipientId: "profile-3", status: "pending" } });
    for (let index = 0; index < 65; index++) {
      await prisma.conversation.create({ data: {
        id: `thread-${String(index).padStart(3, "0")}`, type: "group", title: `Team ${index}`, createdById: "profile-0", lastMessageAt: createdAt,
        participants: { create: [
          { identityId: "profile-0", joinedAt, ...(index === 64 ? { archivedAt: createdAt } : {}), ...(index === 63 ? { leftAt: createdAt } : {}), ...(index === 62 ? { starredAt: createdAt } : {}) },
          { identityId: "profile-1", joinedAt },
        ] },
        messages: { create: { senderId: "profile-1", clientMessageId: `message-${index}`, body: `Brief ${index}`, createdAt } },
      } });
    }
    await prisma.sponsorProfile.create({ data: { id: "legacy-brand", userId: "owner", name: "Legacy Brand", handle: "@legacy", industry: "Tech", walletAddress: "0xlegacy" } });
    app = await buildApp({ prisma, realtime, logger: false });
  }, 30_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("checks identity ownership with one query and no profile backfill", async () => {
    queries.length = 0;
    await getOwnedSocialIdentity(prisma, "owner", "profile-0");
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("SocialIdentity");
    await expect(getOwnedSocialIdentity(prisma, "another-user", "profile-0")).rejects.toThrow("Profile not found");
  });

  it("backfills existing profiles once at startup", async () => {
    expect(await prisma.socialIdentity.findUnique({ where: { id: "sponsor:legacy-brand" } })).toMatchObject({ displayName: "Legacy Brand", profileType: "sponsor" });
  });

  it("counts unread messages in three queries without loading conversation content", async () => {
    queries.length = 0;
    expect(await messagingCounts(prisma, "profile-0")).toEqual({ unread: 63, requests: 1 });
    expect(queries).toHaveLength(3);
    expect(queries.some((query) => query.includes("GROUP BY"))).toBe(true);
    expect(queries.some((query) => query.includes('"body"'))).toBe(false);
  });

  it("paginates inboxes with tied timestamps and applies filters before pagination", async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await listConversations(prisma, "profile-0", { cursor, limit: 10 });
      expect(page.items.length).toBeLessThanOrEqual(10);
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toHaveLength(63);
    expect(new Set(seen).size).toBe(63);
    expect((await listConversations(prisma, "profile-0", { bucket: "archived" })).items.map((item) => item.id)).toEqual(["thread-064"]);
    expect((await listConversations(prisma, "profile-0", { bucket: "starred" })).items.map((item) => item.id)).toEqual(["thread-062"]);
    expect((await listConversations(prisma, "profile-0", { q: "Brief 60" })).items.map((item) => item.id)).toEqual(["thread-060"]);
    expect((await listConversations(prisma, "profile-0", { q: "Brief 63" })).items).toEqual([]);
    expect((await listConversations(prisma, "profile-3", { q: "Brief" })).items).toEqual([]);
  });

  it("finds profiles beyond 500 rows and excludes blocked/self profiles", async () => {
    const result = await searchSocialProfiles(prisma, "profile-0", { q: "person 503" });
    expect(result.items.map((item) => item.id)).toEqual(["profile-503"]);
    expect((await searchSocialProfiles(prisma, "profile-0", { q: "person 504" })).items).toEqual([]);
    const first = await searchSocialProfiles(prisma, "profile-0", { limit: 2 });
    const second = await searchSocialProfiles(prisma, "profile-0", { limit: 2, cursor: first.nextCursor! });
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(4);
    expect((await searchSocialProfiles(prisma, "profile-0", { relationship: "incoming" })).items.map((item) => item.id)).toEqual(["profile-1"]);
  });

  it("broadcasts a read once; repeats, drafts, and stars cannot restart the read loop", async () => {
    publish.mockClear();
    const url = "/api/profiles/profile-0/conversations/thread-000/state";
    const patch = (payload: object) => app.inject({ method: "PATCH", url, headers: { cookie }, payload });
    expect((await patch({ read: true })).statusCode).toBe(200);
    expect((await patch({ read: true })).statusCode).toBe(200);
    expect((await patch({ draftText: "Unsent draft" })).statusCode).toBe(200);
    expect((await patch({ starred: true })).statusCode).toBe(200);
    expect(publish.mock.calls.filter((call) => call[1] === "conversation.read")).toHaveLength(1);
    expect((await messagingCounts(prisma, "profile-0")).unread).toBe(62);
    const thread = await prisma.conversationParticipant.findUnique({ where: { conversationId_identityId: { conversationId: "thread-000", identityId: "profile-0" } } });
    expect(thread?.draftText).toBe("Unsent draft");
  });

  it("does not mark a newer unseen message read with an older read position", async () => {
    await prisma.message.create({ data: { conversationId: "thread-001", senderId: "profile-1", clientMessageId: "later", body: "Later message", createdAt: new Date("2026-01-03T00:00:00Z") } });
    const response = await app.inject({ method: "PATCH", url: "/api/profiles/profile-0/conversations/thread-001/state", headers: { cookie }, payload: { read: true, readThrough: createdAt.toISOString() } });
    expect(response.statusCode).toBe(200);
    const inbox = await listConversations(prisma, "profile-0", { bucket: "unread", q: "Later message" });
    expect(inbox.items[0].unreadCount).toBe(1);
  });
});
