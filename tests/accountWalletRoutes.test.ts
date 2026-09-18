import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { buildApp } from "../src/app.js";
import { hashSessionToken } from "../src/accounts/auth.js";
import { FakePrisma } from "./support/fakes.js";

const wallet = privateKeyToAccount("0x8b3a350cf5c34c9194ca3a545d4cabe8b238f28d870f39a5f056d7b7b84c6f1e");

describe("account wallet linking", () => {
  let prisma: FakePrisma;
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => {
    process.env.APP_URL = "http://localhost:5173";
    process.env.AUTH_COOKIE_SECRET = "test-cookie-secret-that-is-long-enough";
    prisma = new FakePrisma(); app = await buildApp({ prisma: prisma.asPrisma(), logger: false });
  });
  afterEach(async () => { await app.close(); await prisma.$disconnect(); });

  it("links a WalletConnect wallet to an existing Google account and lists it", async () => {
    const cookie = await googleSession("member@example.com");
    const challenge = await app.inject({ method: "POST", url: "/api/auth/wallets/challenges", headers: { cookie }, payload: { address: wallet.address, chainId: 8453 } });
    expect(challenge.statusCode).toBe(201);
    const issued = challenge.json();
    const signature = await wallet.signMessage({ message: issued.message });
    const linked = await app.inject({ method: "POST", url: "/api/auth/wallets", headers: { cookie }, payload: { ...issued, signature, walletClient: "walletconnect" } });
    expect(linked.statusCode).toBe(201); expect(linked.json().address).toBe(wallet.address);
    const listed = await app.inject({ method: "GET", url: "/api/auth/wallets", headers: { cookie } });
    expect(listed.statusCode).toBe(200); expect(listed.json().wallets).toHaveLength(1);
  });

  it("rejects unauthenticated linking and cross-account wallet claims", async () => {
    const anonymous = await app.inject({ method: "POST", url: "/api/auth/wallets/challenges", payload: { address: wallet.address, chainId: 1 } });
    expect(anonymous.statusCode).toBe(401);
    const first = await googleSession("first@example.com");
    const second = await googleSession("second@example.com");
    await link(first);
    const response = await link(second);
    expect(response.statusCode).toBe(409); expect(response.json().message).toContain("another account");
  });

  async function link(cookie: string) {
    const challenge = await app.inject({ method: "POST", url: "/api/auth/wallets/challenges", headers: { cookie }, payload: { address: wallet.address, chainId: 1 } });
    const issued = challenge.json(); const signature = await wallet.signMessage({ message: issued.message });
    return app.inject({ method: "POST", url: "/api/auth/wallets", headers: { cookie }, payload: { ...issued, signature, walletClient: "metamask" } });
  }

  async function googleSession(email: string) {
    const user = await prisma.user.create({ data: { email, googleSub: `google-${email}`, name: email } });
    await prisma.authIdentity.create({ data: { userId: user.id, provider: "google", providerSubject: `google-${email}`, email } });
    const token = `token-${email}`;
    await prisma.authSession.create({ data: { userId: user.id, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 60_000) } });
    return `ytp_session=${token}`;
  }
});
