import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { buildApp } from "../src/app.js";
import { hashSessionToken } from "../src/accounts/auth.js";
import { FakePrisma } from "./support/fakes.js";

const firstWallet = privateKeyToAccount("0x8b3a350cf5c34c9194ca3a545d4cabe8b238f28d870f39a5f056d7b7b84c6f1e");
const secondWallet = privateKeyToAccount("0x0dbbe8e4feebd600f738ce379c34f3bf3d497bc3f571ab4130b22fe67c9f642f");

describe("creator wallet API", () => {
  let prisma: FakePrisma;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    process.env.APP_URL = "http://localhost:5173";
    process.env.AUTH_COOKIE_SECRET = "test-cookie-secret-that-is-long-enough";
    prisma = new FakePrisma();
    app = await buildApp({ prisma: prisma.asPrisma(), logger: false });
  });
  afterEach(async () => { await app.close(); await prisma.$disconnect(); });

  it("links wallets, keeps one primary, and revokes them without deleting history", async () => {
    const cookie = await googleSession("creator@example.com");
    const creator = await createCreator(cookie, "@wallettester");
    expect(creator.walletAddress).toBeNull();
    const first = await link(cookie, creator.id, firstWallet);
    expect(first.isPrimary).toBe(true);
    const second = await link(cookie, creator.id, secondWallet);
    expect(second.isPrimary).toBe(false);

    const promoted = await app.inject({ method: "PATCH", url: `/api/creators/${creator.id}/wallets/${second.id}`, headers: { cookie }, payload: { isPrimary: true } });
    expect(promoted.statusCode).toBe(200); expect(promoted.json().isPrimary).toBe(true);
    const disconnected = await app.inject({ method: "DELETE", url: `/api/creators/${creator.id}/wallets/${first.id}`, headers: { cookie } });
    expect(disconnected.statusCode).toBe(200); expect(disconnected.json().revokedAt).not.toBeNull();
    const listed = await app.inject({ method: "GET", url: `/api/creators/${creator.id}/wallets`, headers: { cookie } });
    expect(listed.json().wallets).toHaveLength(2);
  });

  it("attaches a wallet-only login to a new creator and prevents account lockout", async () => {
    const issued = await app.inject({ method: "POST", url: "/api/auth/ethereum/challenges", payload: { address: firstWallet.address, chainId: 1 } });
    const body = issued.json(); const signature = await firstWallet.signMessage({ message: body.message });
    const session = await app.inject({ method: "POST", url: "/api/auth/ethereum/sessions", payload: { ...body, signature, walletClient: "metamask" } });
    const cookie = String(session.headers["set-cookie"]).split(";")[0];
    const creator = await createCreator(cookie, "@walletonly");
    expect(creator.walletAddress).toBe(firstWallet.address);
    const wallets = await app.inject({ method: "GET", url: `/api/creators/${creator.id}/wallets`, headers: { cookie } });
    const primary = wallets.json().wallets[0]; expect(primary.isPrimary).toBe(true);
    const blocked = await app.inject({ method: "DELETE", url: `/api/creators/${creator.id}/wallets/${primary.id}`, headers: { cookie } });
    expect(blocked.statusCode).toBe(409); expect(blocked.json().message).toContain("another verified sign-in");
    const sponsor = await app.inject({ method: "POST", url: "/api/profiles/sponsors", headers: { cookie }, payload: { name: "No Email", handle: "@noemail", industry: "Web3" } });
    expect(sponsor.statusCode).toBe(403);
  });

  it("does not let the same wallet cross account ownership boundaries", async () => {
    const firstCookie = await googleSession("one@example.com");
    const secondCookie = await googleSession("two@example.com");
    const firstCreator = await createCreator(firstCookie, "@onewallet");
    const secondCreator = await createCreator(secondCookie, "@twowallet");
    await link(firstCookie, firstCreator.id, firstWallet);
    const challenge = await walletChallenge(secondCookie, secondCreator.id, firstWallet.address);
    const signature = await firstWallet.signMessage({ message: challenge.message });
    const response = await app.inject({ method: "POST", url: `/api/creators/${secondCreator.id}/wallets`, headers: { cookie: secondCookie }, payload: { ...challenge, signature, walletClient: "metamask" } });
    expect(response.statusCode).toBe(409);
  });

  async function googleSession(email: string) {
    const user = await prisma.user.create({ data: { email, googleSub: `google-${email}`, name: email } });
    await prisma.authIdentity.create({ data: { userId: user.id, provider: "google", providerSubject: `google-${email}`, email } });
    const token = `token-${email}`;
    await prisma.authSession.create({ data: { userId: user.id, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 60_000) } });
    return `ytp_session=${token}`;
  }

  async function createCreator(cookie: string, handle: string) {
    const response = await app.inject({ method: "POST", url: "/api/profiles/creators", headers: { cookie }, payload: { displayName: handle.slice(1), handle, category: "Technology" } });
    expect(response.statusCode).toBe(201); return response.json();
  }

  async function walletChallenge(cookie: string, creatorId: string, address: string) {
    const response = await app.inject({ method: "POST", url: `/api/creators/${creatorId}/wallets/challenges`, headers: { cookie }, payload: { address, chainId: 1 } });
    expect(response.statusCode).toBe(201); return response.json();
  }

  async function link(cookie: string, creatorId: string, wallet: typeof firstWallet) {
    const challenge = await walletChallenge(cookie, creatorId, wallet.address);
    const signature = await wallet.signMessage({ message: challenge.message });
    const response = await app.inject({ method: "POST", url: `/api/creators/${creatorId}/wallets`, headers: { cookie }, payload: { ...challenge, signature, walletClient: "metamask" } });
    expect(response.statusCode).toBe(201); return response.json();
  }
});
