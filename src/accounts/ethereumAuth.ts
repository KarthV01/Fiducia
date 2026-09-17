import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { getAddress, verifyMessage, type Address, type Hex } from "viem";
import { createSiweMessage, parseSiweMessage } from "viem/siwe";
import { badRequest, conflict, HttpError, unauthorized } from "../http/errors.js";

const CHALLENGE_TTL_MS = 5 * 60_000;
const CHALLENGE_WINDOW_MS = 15 * 60_000;
const MAX_CHALLENGES_PER_ADDRESS = 10;
const MAX_VERIFY_ATTEMPTS = 5;

export type EthereumChallenge = { challengeId: string; message: string; expiresAt: string };
export type WalletChallengePurpose = "sign_in" | "link_account" | "link_creator";

export async function createEthereumChallenge(prisma: PrismaClient, input: { address: string; chainId: number }): Promise<EthereumChallenge> {
  return issueEthereumChallenge(prisma, { ...input, purpose: "sign_in" });
}

export async function issueEthereumChallenge(
  prisma: PrismaClient,
  input: { address: string; chainId: number; purpose: WalletChallengePurpose; userId?: string; profileId?: string },
): Promise<EthereumChallenge> {
  let address: Address;
  try { address = getAddress(input.address); } catch { throw badRequest("Enter a valid Ethereum wallet address."); }
  if (!Number.isSafeInteger(input.chainId) || input.chainId <= 0) throw badRequest("Enter a valid EVM chain ID.");
  const recent = await prisma.walletChallenge.count({ where: { address: address.toLowerCase(), createdAt: { gte: new Date(Date.now() - CHALLENGE_WINDOW_MS) } } });
  if (recent >= MAX_CHALLENGES_PER_ADDRESS) throw new HttpError(429, "Too many wallet sign-in attempts. Try again later.");
  const appUrl = new URL(process.env.APP_URL?.trim() || "http://localhost:5173");
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  const message = createSiweMessage({
    address, chainId: input.chainId, domain: appUrl.host, uri: appUrl.origin, version: "1", nonce,
    issuedAt: new Date(), expirationTime: expiresAt,
    statement: "Sign in to Fiducia. This request does not send a transaction or cost gas.",
  });
  const challenge = await prisma.walletChallenge.create({ data: { purpose: input.purpose, address: address.toLowerCase(), chainId: input.chainId, nonce, messageHash: hash(message), expiresAt, userId: input.userId, profileId: input.profileId } });
  return { challengeId: challenge.id, message, expiresAt: expiresAt.toISOString() };
}

export async function verifyEthereumSession(prisma: PrismaClient, input: { challengeId: string; message: string; signature: string; walletClient: string }) {
  const challenge = await verifyEthereumChallenge(prisma, input, { purpose: "sign_in" });
  const subject = challenge.address;
  return prisma.$transaction(async (tx) => {
    const identity = await tx.authIdentity.findUnique({ where: { provider_providerSubject: { provider: "ethereum", providerSubject: subject } }, include: { user: true } });
    if (identity?.revokedAt) throw unauthorized("This wallet sign-in has been disconnected.");
    if (identity) return identity.user;
    const displayAddress = getAddress(challenge.address);
    const user = await tx.user.create({ data: { email: null, name: `${displayAddress.slice(0, 6)}...${displayAddress.slice(-4)}` } });
    await tx.authIdentity.create({ data: { userId: user.id, provider: "ethereum", providerSubject: subject, walletAddress: displayAddress, lastChainId: challenge.chainId } });
    return user;
  });
}

export async function verifyEthereumChallenge(
  prisma: PrismaClient,
  input: { challengeId: string; message: string; signature: string; walletClient: string },
  expected: { purpose: WalletChallengePurpose; userId?: string; profileId?: string },
) {
  const challenge = await prisma.walletChallenge.findUnique({ where: { id: input.challengeId } });
  if (!challenge || challenge.purpose !== expected.purpose || (challenge.userId ?? undefined) !== expected.userId || (challenge.profileId ?? undefined) !== expected.profileId) throw unauthorized("Wallet challenge is invalid.");
  if (challenge.usedAt) throw conflict("This wallet challenge has already been used.");
  if (challenge.expiresAt <= new Date()) throw unauthorized("Wallet challenge expired. Please try again.");
  if (challenge.attempts >= MAX_VERIFY_ATTEMPTS) throw unauthorized("Too many invalid signature attempts. Please start again.");
  await prisma.walletChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
  if (hash(input.message) !== challenge.messageHash) throw unauthorized("The signed wallet message was changed.");
  const appUrl = new URL(process.env.APP_URL?.trim() || "http://localhost:5173");
  let parsed: ReturnType<typeof parseSiweMessage>;
  try { parsed = parseSiweMessage(input.message); } catch { throw unauthorized("Wallet sign-in message is malformed."); }
  if (parsed.domain !== appUrl.host || parsed.uri !== appUrl.origin || parsed.nonce !== challenge.nonce || parsed.chainId !== challenge.chainId || parsed.address?.toLowerCase() !== challenge.address) throw unauthorized("Wallet sign-in message does not match this application.");
  let valid = false;
  try { valid = await verifyMessage({ address: getAddress(challenge.address), message: input.message, signature: input.signature as Hex }); } catch { valid = false; }
  if (!valid) throw unauthorized("Wallet signature could not be verified.");
  const consumed = await prisma.walletChallenge.updateMany({ where: { id: challenge.id, usedAt: null }, data: { usedAt: new Date() } });
  if (consumed.count !== 1) throw conflict("This wallet challenge has already been used.");
  return challenge;
}

function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
