import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { buildApp } from "../src/app.js";
import { FakePrisma } from "./support/fakes.js";

describe("professional network API", () => {
  it("searches profiles and completes a mutual connection lifecycle", async () => {
    const prisma = new FakePrisma();
    const app = await buildApp({ prisma: prisma.asPrisma(), logger: false });
    const sponsorUser = await signIn(prisma, "network-sponsor@example.com");
    const creatorUser = await signIn(prisma, "network-creator@example.com");
    const sponsor = await createSponsor(app, sponsorUser.cookie);
    const creator = await createCreator(app, creatorUser.cookie);
    const sponsorIdentityId = `sponsor:${sponsor.id}`;
    const creatorIdentityId = `creator:${creator.id}`;

    const search = await app.inject({ method: "GET", url: `/api/profiles/${encodeURIComponent(sponsorIdentityId)}/search?q=maker`, headers: { cookie: sponsorUser.cookie } });
    expect(search.statusCode, search.body).toBe(200);
    expect(search.json().items).toMatchObject([{ id: creatorIdentityId, relationship: "none" }]);

    const requested = await app.inject({ method: "POST", url: `/api/profiles/${encodeURIComponent(sponsorIdentityId)}/connections`, headers: { cookie: sponsorUser.cookie }, payload: { recipientId: creatorIdentityId, note: "Interested in working together." } });
    expect(requested.statusCode, requested.body).toBe(201);

    const incoming = await app.inject({ method: "GET", url: `/api/profiles/${encodeURIComponent(creatorIdentityId)}/connections?bucket=incoming`, headers: { cookie: creatorUser.cookie } });
    expect(incoming.statusCode, incoming.body).toBe(200);
    expect(incoming.json().items[0]).toMatchObject({ direction: "incoming", note: "Interested in working together." });

    const accepted = await app.inject({ method: "PATCH", url: `/api/profiles/${encodeURIComponent(creatorIdentityId)}/connections/${requested.json().id}`, headers: { cookie: creatorUser.cookie }, payload: { action: "accept" } });
    expect(accepted.statusCode, accepted.body).toBe(200);
    expect(accepted.json().status).toBe("accepted");

    const connected = await app.inject({ method: "GET", url: `/api/profiles/${encodeURIComponent(sponsorIdentityId)}/connections?bucket=connected`, headers: { cookie: sponsorUser.cookie } });
    expect(connected.json().items[0].profile).toMatchObject({ id: creatorIdentityId, relationship: "connected" });

    const wrongOwner = await app.inject({ method: "GET", url: `/api/profiles/${encodeURIComponent(sponsorIdentityId)}/connections`, headers: { cookie: creatorUser.cookie } });
    expect(wrongOwner.statusCode).toBe(404);
    await app.close();
  });
});

async function signIn(prisma: FakePrisma, email: string) {
  const user = await prisma.user.create({ data: { email, googleSub: `google-${email}`, name: email.split("@")[0], avatarUrl: null } });
  const token = `token-${email}`;
  await prisma.authSession.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  return { cookie: `ytp_session=${encodeURIComponent(token)}` };
}

async function createSponsor(app: Awaited<ReturnType<typeof buildApp>>, cookie: string) {
  const response = await app.inject({ method: "POST", url: "/api/profiles/sponsors", headers: { cookie }, payload: { name: "Northwind", handle: "@northwind", industry: "Software", monthlyBudgetAmount: "1000000" } });
  expect(response.statusCode, response.body).toBe(201);
  return response.json();
}

async function createCreator(app: Awaited<ReturnType<typeof buildApp>>, cookie: string) {
  const response = await app.inject({ method: "POST", url: "/api/profiles/creators", headers: { cookie }, payload: { displayName: "Maker Studio", handle: "@maker", category: "Technology" } });
  expect(response.statusCode, response.body).toBe(201);
  return response.json();
}
