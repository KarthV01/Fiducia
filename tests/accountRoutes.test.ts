import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { buildApp } from "../src/app.js";
import { hashSessionToken } from "../src/accounts/auth.js";
import { FakeChainClient, FakePrisma } from "./support/fakes.js";

describe("email-backed account API", () => {
  let prisma: FakePrisma;
  let chain: FakeChainClient;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    prisma = new FakePrisma();
    chain = new FakeChainClient();
    app = await buildApp({
      prisma: prisma.asPrisma(),
      chain,
      logger: false,
    });
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("creates real sponsor and creator profiles scoped to the signed-in email", async () => {
    const first = await signIn(prisma, "first@example.com");
    const second = await signIn(prisma, "second@example.com");

    const sponsor = await app.inject({
      method: "POST",
      url: "/api/profiles/sponsors",
      headers: { cookie: first.cookie },
      payload: {
        name: "First Brand",
        handle: "@firstbrand",
        industry: "Food",
        monthlyBudgetAmount: "0",
      },
    });
    expect(sponsor.statusCode).toBe(201);

    const creator = await app.inject({
      method: "POST",
      url: "/api/profiles/creators",
      headers: { cookie: first.cookie },
      payload: {
        displayName: "First Creator",
        handle: "@firstcreator",
        category: "Food reviews",
      },
    });
    expect(creator.statusCode).toBe(201);

    const firstProfiles = await app.inject({
      method: "GET",
      url: "/api/profiles",
      headers: { cookie: first.cookie },
    });
    expect(firstProfiles.statusCode).toBe(200);
    expect(firstProfiles.json().sponsors).toHaveLength(1);
    expect(firstProfiles.json().creators).toHaveLength(1);

    const secondProfiles = await app.inject({
      method: "GET",
      url: "/api/profiles",
      headers: { cookie: second.cookie },
    });
    expect(secondProfiles.statusCode).toBe(200);
    expect(secondProfiles.json().sponsors).toHaveLength(0);
    expect(secondProfiles.json().creators).toHaveLength(0);

    const blocked = await app.inject({
      method: "GET",
      url: `/api/sponsors/${sponsor.json().id}/dashboard`,
      headers: { cookie: second.cookie },
    });
    expect(blocked.statusCode).toBe(404);
  });

  it("searches creator accounts and creates an invite by creator profile id", async () => {
    const sponsorUser = await signIn(prisma, "sponsor@example.com");
    const creatorUser = await signIn(prisma, "creator@example.com");

    const sponsor = await createSponsor(app, sponsorUser.cookie);
    const creator = await createCreator(app, creatorUser.cookie);

    const search = await app.inject({
      method: "GET",
      url: "/api/creators/search?q=maker",
      headers: { cookie: sponsorUser.cookie },
    });
    expect(search.statusCode).toBe(200);
    expect(search.json().creators[0].id).toBe(creator.id);

    const invite = await app.inject({
      method: "POST",
      url: `/api/sponsors/${sponsor.id}/contract-invites`,
      headers: { cookie: sponsorUser.cookie },
      payload: contractPayload(creator.id),
    });
    expect(invite.statusCode).toBe(201);
    expect(invite.json().status).toBe("pending");
    expect(invite.json().agreement.status).toBe("draft");
    expect(invite.json().creatorProfile.handle).toBe("@maker");
  });

  it("lets the targeted creator accept an invite and funds escrow on local Anvil", async () => {
    const sponsorUser = await signIn(prisma, "sponsor@example.com");
    const creatorUser = await signIn(prisma, "creator@example.com");

    const sponsor = await createSponsor(app, sponsorUser.cookie);
    const creator = await createCreator(app, creatorUser.cookie);

    const invite = await app.inject({
      method: "POST",
      url: `/api/sponsors/${sponsor.id}/contract-invites`,
      headers: { cookie: sponsorUser.cookie },
      payload: contractPayload(creator.id),
    });
    const inviteId = invite.json().id;

    const wrongUser = await app.inject({
      method: "POST",
      url: `/api/creators/${creator.id}/invites/${inviteId}/accept`,
      headers: { cookie: sponsorUser.cookie },
    });
    expect(wrongUser.statusCode).toBe(404);

    const accepted = await app.inject({
      method: "POST",
      url: `/api/creators/${creator.id}/invites/${inviteId}/accept`,
      headers: { cookie: creatorUser.cookie },
    });

    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().invite.status).toBe("accepted");
    expect(accepted.json().agreement.status).toBe("active");
    expect(chain.createdEscrows).toHaveLength(1);
    expect(chain.createdEscrows[0].brand.toLowerCase()).toBe(sponsor.walletAddress.toLowerCase());
    expect(chain.createdEscrows[0].creator.toLowerCase()).toBe(creator.walletAddress.toLowerCase());
    expect(chain.preparedSponsorWallets.some((wallet) => wallet.minimumTokenAmount === "2000000")).toBe(true);
  });

  it("uploads, revises, approves, anchors private artifacts, and releases checkpoint payouts", async () => {
    const sponsorUser = await signIn(prisma, "sponsor@example.com");
    const creatorUser = await signIn(prisma, "creator@example.com");
    const sponsor = await createSponsor(app, sponsorUser.cookie);
    const creator = await createCreator(app, creatorUser.cookie);
    const invite = await app.inject({
      method: "POST",
      url: `/api/sponsors/${sponsor.id}/contract-invites`,
      headers: { cookie: sponsorUser.cookie },
      payload: contractPayload(creator.id),
    });
    await app.inject({
      method: "POST",
      url: `/api/creators/${creator.id}/invites/${invite.json().id}/accept`,
      headers: { cookie: creatorUser.cookie },
    });
    const agreementId = invite.json().agreement.id;

    const first = await uploadCheckpoint(app, creatorUser.cookie, creator.id, agreementId, "promo", "first concept");
    expect(first.statusCode).toBe(201);
    const unauthenticatedPreview = await app.inject({ method: "GET", url: `/api/contracts/${agreementId}/artifacts/${first.json().id}/content` });
    expect(unauthenticatedPreview.statusCode).toBe(401);
    const sponsorPreview = await app.inject({ method: "GET", url: `/api/contracts/${agreementId}/artifacts/${first.json().id}/content`, headers: { cookie: sponsorUser.cookie, range: "bytes=0-4" } });
    expect(sponsorPreview.statusCode, sponsorPreview.body).toBe(206);
    expect(sponsorPreview.headers["content-range"]).toBe("bytes 0-4/13");

    const changes = await app.inject({
      method: "POST",
      url: `/api/sponsors/${sponsor.id}/contracts/${agreementId}/submissions/${first.json().id}/review`,
      headers: { cookie: sponsorUser.cookie },
      payload: { decision: "changes_requested", comment: "Add the disclosure.", failedCriteria: ["Required disclosure"] },
    });
    expect(changes.statusCode).toBe(200);
    expect(changes.json().agreement.workflow.currentStep).toBe("revise_promo");

    const revision = await uploadCheckpoint(app, creatorUser.cookie, creator.id, agreementId, "promo", "revised concept");
    expect(revision.statusCode).toBe(201);
    expect(revision.json().version).toBe(2);

    const approval = await app.inject({
      method: "POST",
      url: `/api/sponsors/${sponsor.id}/contracts/${agreementId}/submissions/${revision.json().id}/review`,
      headers: { cookie: sponsorUser.cookie },
      payload: { decision: "approved", comment: "Approved.", failedCriteria: [] },
    });
    expect(approval.statusCode).toBe(200);
    expect(approval.json().releasedPayoutIds).toHaveLength(1);
    expect(approval.json().agreement.workflow.currentStep).toBe("submit_final_cut");
    expect(chain.approvedDeliveries).toHaveLength(1);
    expect(chain.approvedDeliveries[0].artifactHash).toBe(revision.json().contentHash);

    const invalidFinalCut = await app.inject({
      method: "POST",
      url: `/api/creators/${creator.id}/contracts/${agreementId}/uploads`,
      headers: { cookie: creatorUser.cookie },
      payload: { checkpoint: "final_cut", fileName: "final-cut.pdf", mimeType: "application/pdf", totalSize: "100" },
    });
    expect(invalidFinalCut.statusCode).toBe(409);
    expect(invalidFinalCut.json().message).toContain("must be an MP4, MOV, or WebM video");

    const validFinalCut = await app.inject({
      method: "POST",
      url: `/api/creators/${creator.id}/contracts/${agreementId}/uploads`,
      headers: { cookie: creatorUser.cookie },
      payload: { checkpoint: "final_cut", fileName: "final-cut.mp4", mimeType: "video/mp4", totalSize: "100" },
    });
    expect(validFinalCut.statusCode).toBe(201);
  });
});

async function uploadCheckpoint(app: Awaited<ReturnType<typeof buildApp>>, cookie: string, creatorId: string, agreementId: string, checkpoint: "promo" | "final_cut", contents: string) {
  const bytes = Buffer.from(contents);
  const initialized = await app.inject({ method: "POST", url: `/api/creators/${creatorId}/contracts/${agreementId}/uploads`, headers: { cookie }, payload: { checkpoint, fileName: `${checkpoint}.txt`, mimeType: "text/plain", totalSize: String(bytes.length) } });
  expect(initialized.statusCode).toBe(201);
  const uploadId = initialized.json().id;
  const chunk = await app.inject({ method: "PATCH", url: `/api/creators/${creatorId}/contracts/${agreementId}/uploads/${uploadId}`, headers: { cookie, "content-type": "application/octet-stream", "upload-offset": "0" }, payload: bytes });
  expect(chunk.statusCode).toBe(204);
  const completed = await app.inject({ method: "POST", url: `/api/creators/${creatorId}/contracts/${agreementId}/uploads/${uploadId}/complete`, headers: { cookie } });
  expect(completed.statusCode).toBe(200);
  return app.inject({ method: "POST", url: `/api/creators/${creatorId}/contracts/${agreementId}/checkpoints/${checkpoint}/submissions`, headers: { cookie }, payload: { uploadId, notes: "Private review", attested: true } });
}

async function signIn(prisma: FakePrisma, email: string) {
  const user = await prisma.user.create({
    data: {
      email,
      googleSub: `google-${email}`,
      name: email.split("@")[0],
      avatarUrl: null,
    },
  });
  const token = `token-${email}`;
  await prisma.authSession.create({
    data: {
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return { user, cookie: `ytp_session=${encodeURIComponent(token)}` };
}

async function createSponsor(app: Awaited<ReturnType<typeof buildApp>>, cookie: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/profiles/sponsors",
    headers: { cookie },
    payload: {
      name: "Stellar Snacks",
      handle: "@stellar",
      industry: "Food",
      monthlyBudgetAmount: "0",
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

async function createCreator(app: Awaited<ReturnType<typeof buildApp>>, cookie: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/profiles/creators",
    headers: { cookie },
    payload: {
      displayName: "Maker Studio",
      handle: "@maker",
      category: "Tech",
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

function contractPayload(creatorProfileId: string) {
  return {
    creatorProfileId,
    title: "Launch review",
    deliverableDescription: "One long-form sponsored review.",
    deadline: "2026-09-30T00:00:00.000Z",
    measurementWindowDays: 30,
    basePayoutAmount: "1000000",
    totalCapAmount: "2000000",
    viewMilestones: [{ views: "100000", bonusAmount: "1000000" }],
    metricBonuses: [],
  };
}
