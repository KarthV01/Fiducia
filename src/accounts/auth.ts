import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient, User } from "@prisma/client";
import { badRequest, unauthorized } from "../http/errors.js";

const SESSION_COOKIE = "ytp_session";
const OAUTH_STATE_COOKIE = "ytp_oauth_state";
const SESSION_DAYS = 30;

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
};

type GoogleUserInfo = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

export type AuthenticatedUser = Pick<User, "id" | "email" | "name" | "avatarUrl">;

export function authConfig() {
  return {
    clientId: requireEnv("GOOGLE_CLIENT_ID"),
    clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
    appUrl: applicationUrl(),
    apiUrl: process.env.API_URL?.trim() || "http://localhost:3000",
    cookieSecret: requireEnv("AUTH_COOKIE_SECRET"),
  };
}

export function buildGoogleAuthUrl(reply: FastifyReply): string {
  const config = authConfig();
  const state = randomToken();
  setCookie(reply, OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: 600,
    sameSite: "Lax",
    secure: isHttps(config.appUrl),
  });

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: `${config.apiUrl}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function handleGoogleCallback(prisma: PrismaClient, request: FastifyRequest, reply: FastifyReply) {
  const config = authConfig();
  const query = request.query as { code?: string; state?: string; error?: string };
  if (query.error) {
    throw badRequest(`Google sign-in failed: ${query.error}`);
  }

  if (!query.code || !query.state) {
    throw badRequest("Missing Google OAuth code or state.");
  }

  const cookies = parseCookies(request);
  if (!constantTimeEqual(cookies[OAUTH_STATE_COOKIE], query.state)) {
    throw badRequest("Invalid Google OAuth state.");
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: query.code,
      grant_type: "authorization_code",
      redirect_uri: `${config.apiUrl}/api/auth/google/callback`,
    }),
  });

  const tokenBody = (await tokenResponse.json()) as GoogleTokenResponse;
  if (!tokenResponse.ok || !tokenBody.access_token) {
    throw badRequest(tokenBody.error ?? "Google token exchange failed.");
  }

  const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokenBody.access_token}` },
  });
  const profile = (await profileResponse.json()) as GoogleUserInfo;
  if (!profileResponse.ok || !profile.email || !profile.sub) {
    throw badRequest("Unable to load Google profile.");
  }

  if (profile.email_verified === false) {
    throw badRequest("Google email must be verified.");
  }

  const user = await upsertGoogleUser(prisma, profile);
  await createAuthSession(prisma, reply, user.id);
  clearCookie(reply, OAUTH_STATE_COOKIE, isHttps(config.appUrl));

  return config.appUrl;
}

export async function upsertGoogleUser(prisma: PrismaClient, profile: GoogleUserInfo): Promise<User> {
  const existingByGoogle = await prisma.user.findUnique({
    where: { googleSub: profile.sub },
  });

  if (existingByGoogle) {
    const user = await prisma.user.update({
      where: { id: existingByGoogle.id },
      data: {
        email: profile.email.toLowerCase(),
        name: profile.name ?? existingByGoogle.name,
        avatarUrl: profile.picture ?? existingByGoogle.avatarUrl,
      },
    });
    await recordGoogleIdentity(prisma, user.id, profile);
    return user;
  }

  const existingByEmail = await prisma.user.findUnique({
    where: { email: profile.email.toLowerCase() },
  });

  if (existingByEmail) {
    const user = await prisma.user.update({
      where: { id: existingByEmail.id },
      data: {
        googleSub: profile.sub,
        name: profile.name ?? existingByEmail.name,
        avatarUrl: profile.picture ?? existingByEmail.avatarUrl,
      },
    });
    await recordGoogleIdentity(prisma, user.id, profile);
    return user;
  }

  const user = await prisma.user.create({
    data: {
      email: profile.email.toLowerCase(),
      googleSub: profile.sub,
      name: profile.name ?? null,
      avatarUrl: profile.picture ?? null,
    },
  });
  await recordGoogleIdentity(prisma, user.id, profile);
  return user;
}

async function recordGoogleIdentity(prisma: PrismaClient, userId: string, profile: GoogleUserInfo) {
  // Older test adapters do not expose additive Prisma models.
  const model = (prisma as PrismaClient & { authIdentity?: PrismaClient["authIdentity"] }).authIdentity;
  if (!model) return;
  await model.upsert({
    where: { provider_providerSubject: { provider: "google", providerSubject: profile.sub } },
    create: { userId, provider: "google", providerSubject: profile.sub, email: profile.email.toLowerCase() },
    update: { userId, email: profile.email.toLowerCase(), revokedAt: null, verifiedAt: new Date() },
  });
}

export async function ensureAuthIdentities(prisma: PrismaClient) {
  const model = (prisma as PrismaClient & { authIdentity?: PrismaClient["authIdentity"] }).authIdentity;
  if (!model) return;
  const users = await prisma.user.findMany({ where: { googleSub: { not: null } } });
  for (const user of users) {
    await model.upsert({
      where: { provider_providerSubject: { provider: "google", providerSubject: user.googleSub! } },
      create: { userId: user.id, provider: "google", providerSubject: user.googleSub!, email: user.email },
      update: { email: user.email },
    });
  }
}

export async function createAuthSession(prisma: PrismaClient, reply: FastifyReply, userId: string) {
  const appUrl = applicationUrl();
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.authSession.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
    },
  });

  setCookie(reply, SESSION_COOKIE, token, {
    httpOnly: true,
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    sameSite: "Lax",
    secure: isHttps(appUrl),
  });
}

export async function getCurrentUser(prisma: PrismaClient, request: FastifyRequest): Promise<AuthenticatedUser | null> {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) {
    return null;
  }

  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true },
  });

  if (!session || session.expiresAt <= new Date()) {
    return null;
  }

  return publicUser(session.user);
}

export async function requireUser(prisma: PrismaClient, request: FastifyRequest): Promise<AuthenticatedUser> {
  const user = await getCurrentUser(prisma, request);
  if (!user) {
    throw unauthorized("Sign in required.");
  }
  return user;
}

export async function logout(prisma: PrismaClient, request: FastifyRequest, reply: FastifyReply) {
  const appUrl = applicationUrl();
  const token = parseCookies(request)[SESSION_COOKIE];
  if (token) {
    await prisma.authSession.deleteMany({
      where: { tokenHash: hashSessionToken(token) },
    });
  }
  clearCookie(reply, SESSION_COOKIE, isHttps(appUrl));
}

export function publicUser(user: User): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
  };
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function parseCookies(request: FastifyRequest): Record<string, string> {
  const header = request.headers.cookie;
  if (!header) {
    return {};
  }

  return Object.fromEntries(
    header.split(";").flatMap((part) => {
      const [rawKey, ...rawValue] = part.trim().split("=");
      if (!rawKey || rawValue.length === 0) {
        return [];
      }
      return [[rawKey, decodeURIComponent(rawValue.join("="))]];
    }),
  );
}

function setCookie(
  reply: FastifyReply,
  name: string,
  value: string,
  options: { httpOnly: boolean; maxAge: number; sameSite: "Lax"; secure: boolean },
) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${options.maxAge}`,
    `SameSite=${options.sameSite}`,
  ];
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  appendSetCookie(reply, parts.join("; "));
}

function clearCookie(reply: FastifyReply, name: string, secure: boolean) {
  const parts = [`${name}=`, "Path=/", "Max-Age=0", "SameSite=Lax", "HttpOnly"];
  if (secure) parts.push("Secure");
  appendSetCookie(reply, parts.join("; "));
}

function appendSetCookie(reply: FastifyReply, value: string) {
  const existing = reply.getHeader("Set-Cookie");
  if (!existing) {
    reply.header("Set-Cookie", value);
    return;
  }

  reply.header("Set-Cookie", Array.isArray(existing) ? [...existing, value] : [String(existing), value]);
}

function constantTimeEqual(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function isHttps(url: string): boolean {
  return url.startsWith("https://");
}

function applicationUrl(): string {
  return process.env.APP_URL?.trim() || "http://localhost:5173";
}

function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw badRequest(`${key} is required for Google authentication.`);
  }
  return value;
}
