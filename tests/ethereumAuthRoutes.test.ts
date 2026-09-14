import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { buildApp } from "../src/app.js";
import { FakePrisma } from "./support/fakes.js";

const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const account = privateKeyToAccount(KEY);

describe("ethereum authentication API", () => {
  let prisma: FakePrisma;
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => {
    process.env.APP_URL = "http://localhost:5173";
    process.env.AUTH_COOKIE_SECRET = "test-cookie-secret-that-is-long-enough";
    prisma = new FakePrisma(); app = await buildApp({ prisma: prisma.asPrisma(), logger: false });
  });
  afterEach(async () => { await app.close(); await prisma.$disconnect(); });

  async function challenge(address: string = account.address, chainId = 1) {
    return app.inject({ method: "POST", url: "/api/auth/ethereum/challenges", payload: { address, chainId } });
  }
  async function verify(challengeBody: { challengeId: string; message: string }, message = challengeBody.message, signature?: `0x${string}`) {
    return app.inject({ method: "POST", url: "/api/auth/ethereum/sessions", payload: { ...challengeBody, message, signature: signature ?? await account.signMessage({ message }), walletClient: "metamask" } });
  }

  it("creates a wallet-only user, secure session, and reuses the identity", async () => {
    const issued = await challenge(); expect(issued.statusCode).toBe(201);
    const signed = await verify(issued.json());
    expect(signed.statusCode).toBe(200); expect(signed.json().user.email).toBeNull();
    expect(signed.headers["set-cookie"]).toContain("HttpOnly"); expect(signed.headers["set-cookie"]).toContain("SameSite=Lax");
    const second = await challenge(); const returning = await verify(second.json());
    expect(returning.json().user.id).toBe(signed.json().user.id);
  });

  it("rejects altered, invalid, expired, and replayed challenges", async () => {
    const altered = await challenge(); expect((await verify(altered.json(), `${altered.json().message} changed`)).statusCode).toBe(401);
    const invalid = await challenge(); expect((await verify(invalid.json(), invalid.json().message, `0x${"00".repeat(65)}`)).statusCode).toBe(401);
    const expired = await challenge(); prisma.expireWalletChallenge(expired.json().challengeId); expect((await verify(expired.json())).statusCode).toBe(401);
    const replay = await challenge(); expect((await verify(replay.json())).statusCode).toBe(200); expect((await verify(replay.json())).statusCode).toBe(409);
  });

  it("validates addresses and chain IDs and rate limits challenge issuance", async () => {
    expect((await challenge("not-an-address")).statusCode).toBe(400);
    expect((await challenge(account.address, 0)).statusCode).toBe(400);
    for (let i = 0; i < 10; i++) expect((await challenge()).statusCode).toBe(201);
    expect((await challenge()).statusCode).toBe(429);
  });
});
