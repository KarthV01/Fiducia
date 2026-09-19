import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { conflict, notFound, unauthorized } from "../http/errors.js";
import { decryptSocialSecret, encryptSocialSecret } from "./crypto.js";
import { providerAdapter } from "./providers/index.js";
import type { SocialProvider, TokenSet } from "./types.js";

export async function startConnection(prisma: PrismaClient, input: { userId: string; creatorProfileId: string; provider: SocialProvider; returnPath?: string }) {
  const adapter = providerAdapter(input.provider);
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const encrypted = encryptSocialSecret(verifier);
  await prisma.oAuthAttempt.create({ data: {
    userId: input.userId,
    creatorProfileId: input.creatorProfileId,
    provider: input.provider,
    stateHash: hash(state),
    requestedScopesJson: JSON.stringify(adapter.scopes),
    encryptedPkceVerifier: encrypted.ciphertext,
    returnPath: safeReturnPath(input.returnPath),
    expiresAt: new Date(Date.now() + 10 * 60_000),
  } });
  return { authorizationUrl: adapter.authorizationUrl({ state, codeChallenge: challenge }) };
}

export async function completeConnection(prisma: PrismaClient, input: { userId: string; provider: SocialProvider; state: string; code: string }) {
  const attempt = await prisma.oAuthAttempt.findUnique({ where: { stateHash: hash(input.state) } });
  if (!attempt || attempt.provider !== input.provider || attempt.userId !== input.userId || attempt.consumedAt || attempt.expiresAt <= new Date()) {
    throw unauthorized("The social authorization response is invalid or expired.");
  }
  const adapter = providerAdapter(input.provider);
  const verifier = decryptSocialSecret(attempt.encryptedPkceVerifier);
  const tokens = await adapter.exchangeCode(input.code, verifier);
  const identity = await adapter.identity(tokens.accessToken);
  if (!identity.accountId) throw conflict(`${input.provider} did not return an account identifier.`);
  const access = encryptSocialSecret(tokens.accessToken);
  const refresh = tokens.refreshToken ? encryptSocialSecret(tokens.refreshToken) : undefined;
  const connection = await prisma.$transaction(async (tx) => {
    const saved = await tx.socialConnection.upsert({
      where: { creatorProfileId_provider_providerAccountId: { creatorProfileId: attempt.creatorProfileId, provider: input.provider, providerAccountId: identity.accountId } },
      create: connectionData(attempt.creatorProfileId, input.provider, identity, tokens, access, refresh),
      update: {
        username: identity.username,
        displayName: identity.displayName,
        status: "active",
        grantedScopesJson: JSON.stringify(tokens.scopes),
        capabilitiesJson: JSON.stringify(identity.capabilities),
        encryptedAccessToken: access.ciphertext,
        ...(refresh ? { encryptedRefreshToken: refresh.ciphertext } : {}),
        accessTokenExpiresAt: expiry(tokens),
        tokenKeyId: access.keyId,
        connectedAt: new Date(),
        lastRefreshedAt: new Date(),
        revokedAt: null,
        errorCode: null,
      },
    });
    await tx.oAuthAttempt.update({ where: { id: attempt.id }, data: { consumedAt: new Date(), encryptedPkceVerifier: "consumed" } });
    return saved;
  });
  return { connection: publicConnection(connection), returnPath: attempt.returnPath };
}

export async function listConnections(prisma: PrismaClient, creatorProfileId: string) {
  const rows = await prisma.socialConnection.findMany({ where: { creatorProfileId }, orderBy: [{ provider: "asc" }, { connectedAt: "desc" }] });
  return rows.map(publicConnection);
}

export async function refreshConnection(prisma: PrismaClient, creatorProfileId: string, connectionId: string) {
  const connection = await ownedConnection(prisma, creatorProfileId, connectionId);
  const adapter = providerAdapter(connection.provider as SocialProvider);
  const encrypted = connection.encryptedRefreshToken ?? connection.encryptedAccessToken;
  if (!encrypted) throw conflict("This connection has no refresh credential. Reconnect the account.");
  try {
    const tokens = await adapter.refresh(decryptSocialSecret(encrypted, connection.tokenKeyId));
    const access = encryptSocialSecret(tokens.accessToken);
    const refresh = tokens.refreshToken ? encryptSocialSecret(tokens.refreshToken) : undefined;
    const updated = await prisma.socialConnection.update({ where: { id: connection.id }, data: {
      encryptedAccessToken: access.ciphertext,
      ...(refresh ? { encryptedRefreshToken: refresh.ciphertext } : {}),
      tokenKeyId: access.keyId,
      grantedScopesJson: JSON.stringify(tokens.scopes),
      accessTokenExpiresAt: expiry(tokens),
      lastRefreshedAt: new Date(),
      status: "active",
      errorCode: null,
    } });
    return publicConnection(updated);
  } catch (error) {
    await prisma.socialConnection.update({ where: { id: connection.id }, data: { status: "reauthorization_required", errorCode: "refresh_failed" } });
    throw error;
  }
}

export async function disconnectConnection(prisma: PrismaClient, creatorProfileId: string, connectionId: string) {
  const connection = await ownedConnection(prisma, creatorProfileId, connectionId);
  const adapter = providerAdapter(connection.provider as SocialProvider);
  if (adapter.revoke && connection.encryptedAccessToken) {
    try { await adapter.revoke(decryptSocialSecret(connection.encryptedAccessToken, connection.tokenKeyId)); } catch { /* Local revocation still wins. */ }
  }
  const updated = await prisma.socialConnection.update({ where: { id: connection.id }, data: {
    status: "revoked",
    revokedAt: new Date(),
    encryptedAccessToken: null,
    encryptedRefreshToken: null,
    accessTokenExpiresAt: null,
  } });
  return publicConnection(updated);
}

export async function syncOwnedContent(prisma: PrismaClient, creatorProfileId: string, connectionId: string, cursor?: string) {
  const connection = await ownedConnection(prisma, creatorProfileId, connectionId);
  const accessToken = await accessTokenForConnection(prisma, connection);
  const adapter = providerAdapter(connection.provider as SocialProvider);
  const result = await adapter.listContent(accessToken, cursor);
  const items = [];
  for (const content of result.items) {
    items.push(await prisma.socialContent.upsert({
      where: { provider_providerContentId: { provider: connection.provider, providerContentId: content.providerContentId } },
      create: { socialConnectionId: connection.id, provider: connection.provider, ...content, lastSeenAt: new Date() },
      update: { socialConnectionId: connection.id, ...content, lastSeenAt: new Date() },
    }));
  }
  await prisma.socialConnection.update({ where: { id: connection.id }, data: { lastSyncedAt: new Date() } });
  return { items, cursor: result.cursor };
}

export async function accessTokenForConnection(prisma: PrismaClient, connection: Awaited<ReturnType<typeof ownedConnection>>) {
  if (!connection.encryptedAccessToken) throw conflict("Reconnect this account before accessing provider data.");
  if (connection.accessTokenExpiresAt && connection.accessTokenExpiresAt.getTime() <= Date.now() + 5 * 60_000) {
    await refreshConnection(prisma, connection.creatorProfileId, connection.id);
    const refreshed = await ownedConnection(prisma, connection.creatorProfileId, connection.id);
    if (!refreshed.encryptedAccessToken) throw conflict("Token refresh did not return an access token.");
    return decryptSocialSecret(refreshed.encryptedAccessToken, refreshed.tokenKeyId);
  }
  return decryptSocialSecret(connection.encryptedAccessToken, connection.tokenKeyId);
}

async function ownedConnection(prisma: PrismaClient, creatorProfileId: string, connectionId: string) {
  const connection = await prisma.socialConnection.findUnique({ where: { id: connectionId } });
  if (!connection || connection.creatorProfileId !== creatorProfileId) throw notFound("Social connection not found.");
  return connection;
}

function connectionData(creatorProfileId: string, provider: SocialProvider, identity: { accountId: string; username?: string; displayName?: string; capabilities: string[] }, tokens: TokenSet, access: { ciphertext: string; keyId: string }, refresh?: { ciphertext: string }) {
  return { creatorProfileId, provider, providerAccountId: identity.accountId, username: identity.username, displayName: identity.displayName, status: "active", grantedScopesJson: JSON.stringify(tokens.scopes), capabilitiesJson: JSON.stringify(identity.capabilities), encryptedAccessToken: access.ciphertext, encryptedRefreshToken: refresh?.ciphertext, accessTokenExpiresAt: expiry(tokens), tokenKeyId: access.keyId, lastRefreshedAt: new Date() };
}

function expiry(tokens: TokenSet) { return tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null; }
function hash(value: string) { return createHash("sha256").update(value).digest("base64url"); }
function safeReturnPath(value?: string) { return value?.startsWith("/") && !value.startsWith("//") ? value : undefined; }
function parseList(value: string) { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
function publicConnection(connection: { id: string; provider: string; providerAccountId: string; username: string | null; displayName: string | null; status: string; grantedScopesJson: string; capabilitiesJson: string; accessTokenExpiresAt: Date | null; connectedAt: Date; lastSyncedAt: Date | null; revokedAt: Date | null; errorCode: string | null }) {
  return { id: connection.id, provider: connection.provider, providerAccountId: connection.providerAccountId, username: connection.username, displayName: connection.displayName, status: connection.status, grantedScopes: parseList(connection.grantedScopesJson), capabilities: parseList(connection.capabilitiesJson), accessTokenExpiresAt: connection.accessTokenExpiresAt, connectedAt: connection.connectedAt, lastSyncedAt: connection.lastSyncedAt, revokedAt: connection.revokedAt, errorCode: connection.errorCode };
}
