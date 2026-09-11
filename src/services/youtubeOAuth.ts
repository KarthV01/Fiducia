import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { decryptSecret, encryptSecret } from "./tokenEncryption.js";

const scopes = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];

export async function beginYouTubeConnection(prisma: PrismaClient, creatorProfileId: string) {
  const clientId = required("YOUTUBE_CLIENT_ID");
  const redirectUri = required("YOUTUBE_REDIRECT_URI");
  const state = randomBytes(32).toString("base64url");
  await prisma.youTubeConnection.upsert({
    where: { creatorProfileId },
    create: { creatorProfileId, oauthState: state, oauthStateExpiresAt: new Date(Date.now() + 10 * 60_000) },
    update: { oauthState: state, oauthStateExpiresAt: new Date(Date.now() + 10 * 60_000) },
  });
  const query = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: scopes.join(" "), access_type: "offline", prompt: "consent", state });
  return { authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${query}` };
}

export async function finishYouTubeConnection(prisma: PrismaClient, state: string, code: string) {
  const connection = await prisma.youTubeConnection.findUnique({ where: { oauthState: state } });
  if (!connection || connection.oauthStateExpiresAt < new Date()) throw new Error("YouTube connection state is invalid or expired.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: required("YOUTUBE_CLIENT_ID"), client_secret: required("YOUTUBE_CLIENT_SECRET"), redirect_uri: required("YOUTUBE_REDIRECT_URI"), grant_type: "authorization_code" }),
  });
  if (!response.ok) throw new Error(`YouTube token exchange failed (${response.status}).`);
  const tokens = await response.json() as { access_token: string; refresh_token?: string };
  if (!tokens.refresh_token) throw new Error("YouTube did not return an offline refresh token. Reconnect with consent.");
  const channelResponse = await fetch("https://www.googleapis.com/youtube/v3/channels?part=id&mine=true", { headers: { authorization: `Bearer ${tokens.access_token}` } });
  if (!channelResponse.ok) throw new Error("Unable to read the connected YouTube channel.");
  const channel = await channelResponse.json() as { items?: Array<{ id: string }> };
  return prisma.youTubeConnection.update({ where: { id: connection.id }, data: { encryptedRefreshToken: encryptSecret(tokens.refresh_token), channelId: channel.items?.[0]?.id, connectedAt: new Date(), oauthState: randomBytes(32).toString("base64url") } });
}

export async function getYouTubeAccessToken(encryptedRefreshToken: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: decryptSecret(encryptedRefreshToken), client_id: required("YOUTUBE_CLIENT_ID"), client_secret: required("YOUTUBE_CLIENT_SECRET"), grant_type: "refresh_token" }),
  });
  if (!response.ok) throw new Error(`YouTube token refresh failed (${response.status}).`);
  return ((await response.json()) as { access_token: string }).access_token;
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
