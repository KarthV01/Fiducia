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

  it("submits, revises, approves, anchors proof, and releases the base payout", async () => {
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

    const first = await app.inject({
      method: "POST",
      url: `/api/creators/${creator.id}/contracts/${agreementId}/deliverables`,
      headers: { cookie: creatorUser.cookie },
      payload: { proofUrl: "https://youtube.com/watch?v=first", notes: "First cut", evidence: [], attested: true },
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().agreement.workflow.currentStep).toBe("review_deliverable");

    const changes = await app.inject({
      method: "POST",
      url: `/api/sponsors/${sponsor.id}/contracts/${agreementId}/deliverables/${first.json().submission.id}/review`,
      headers: { cookie: sponsorUser.cookie },
      payload: { decision: "changes_requested", comment: "Add the disclosure." },
    });
    expect(changes.statusCode).toBe(200);
    expect(changes.json().agreement.workflow.currentStep).toBe("revise_deliverable");

    const revision = await app.inject({
      method: "POST",
      url: `/api/creators/${creator.id}/contracts/${agreementId}/deliverables`,
      headers: { cookie: creatorUser.cookie },
      payload: { proofUrl: "https://youtube.com/watch?v=final", notes: "Disclosure added", evidence: [], attested: true },
    });
    expect(revision.statusCode).toBe(201);
    expect(revision.json().submission.version).toBe(2);

    const approval = await app.inject({
      method: "POST",
      url: `/api/sponsors/${sponsor.id}/contracts/${agreementId}/deliverables/${revision.json().submission.id}/review`,
      headers: { cookie: sponsorUser.cookie },
      payload: { decision: "approved", comment: "Approved." },
    });
    expect(approval.statusCode).toBe(200);
    expect(approval.json().releasedPayoutIds).toHaveLength(1);
    expect(approval.json().agreement.workflow.deliveryStatus).toBe("approved");
    expect(chain.approvedDeliveries).toHaveLength(1);
    expect(chain.approvedDeliveries[0].submissionHash).toBe(revision.json().submission.contentHash);
  });
});

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
