import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { decryptSocialSecret, encryptSocialSecret } from "../src/social/crypto.js";
import { providerPublishScopeEnabled } from "../src/social/providerConfig.js";
import { providerAdapter } from "../src/social/providers/index.js";

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe("social connection foundation", () => {
  it("encrypts with the active key and decrypts after key rotation", () => {
    const first = randomBytes(32).toString("base64");
    const second = randomBytes(32).toString("base64");
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEYS = `old:${first},new:${second}`;
    process.env.SOCIAL_TOKEN_ACTIVE_KEY_ID = "old";
    const encrypted = encryptSocialSecret("refresh-secret");
    process.env.SOCIAL_TOKEN_ACTIVE_KEY_ID = "new";
    expect(encrypted.keyId).toBe("old");
    expect(decryptSocialSecret(encrypted.ciphertext)).toBe("refresh-secret");
  });

  it("builds PKCE authorization requests without embedding client secrets", () => {
    process.env.X_CLIENT_ID = "x-client";
    process.env.X_CLIENT_SECRET = "do-not-leak";
    process.env.X_REDIRECT_URI = "https://fiducia.example/api/oauth/x/callback";
    const url = new URL(providerAdapter("x").authorizationUrl({ state: "state", codeChallenge: "challenge" }));
    expect(url.origin).toBe("https://x.com");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toContain("offline.access");
    expect(url.toString()).not.toContain("do-not-leak");
  });

  it("uses the separate provider-neutral YouTube callback during migration", () => {
    process.env.YOUTUBE_CLIENT_ID = "youtube-client";
    process.env.YOUTUBE_CLIENT_SECRET = "youtube-secret";
    process.env.YOUTUBE_REDIRECT_URI = "https://fiducia.example/api/youtube/callback";
    process.env.YOUTUBE_SOCIAL_REDIRECT_URI = "https://fiducia.example/api/oauth/youtube/callback";
    const url = new URL(providerAdapter("youtube").authorizationUrl({ state: "state", codeChallenge: "challenge" }));
    expect(url.searchParams.get("redirect_uri")).toBe(process.env.YOUTUBE_SOCIAL_REDIRECT_URI);
    expect(url.searchParams.get("scope")).toContain("yt-analytics.readonly");
  });

  it("keeps unreviewed publishing disabled while preserving the existing YouTube upload default", () => {
    delete process.env.REQUEST_INSTAGRAM_PUBLISH_SCOPE;
    delete process.env.REQUEST_YOUTUBE_UPLOAD_SCOPE;
    expect(providerPublishScopeEnabled("instagram")).toBe(false);
    expect(providerPublishScopeEnabled("youtube")).toBe(true);
    process.env.REQUEST_INSTAGRAM_PUBLISH_SCOPE = "true";
    process.env.REQUEST_YOUTUBE_UPLOAD_SCOPE = "false";
    expect(providerPublishScopeEnabled("instagram")).toBe(true);
    expect(providerPublishScopeEnabled("youtube")).toBe(false);
  });
});
