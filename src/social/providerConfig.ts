import type { SocialProvider } from "./types.js";

const PUBLISH_SCOPE_ENV: Record<SocialProvider, string> = {
  instagram: "REQUEST_INSTAGRAM_PUBLISH_SCOPE",
  x: "REQUEST_X_PUBLISH_SCOPE",
  tiktok: "REQUEST_TIKTOK_PUBLISH_SCOPE",
  youtube: "REQUEST_YOUTUBE_UPLOAD_SCOPE",
};

export function providerConfig(provider: SocialProvider) {
  const prefix = provider === "x" ? "X" : provider.toUpperCase();
  const clientId = required(provider === "tiktok" ? "TIKTOK_CLIENT_KEY" : `${prefix}_CLIENT_ID`);
  return {
    clientId,
    clientSecret: required(provider === "tiktok" ? "TIKTOK_CLIENT_SECRET" : `${prefix}_CLIENT_SECRET`),
    redirectUri: required(provider === "youtube" && process.env.YOUTUBE_SOCIAL_REDIRECT_URI?.trim() ? "YOUTUBE_SOCIAL_REDIRECT_URI" : `${prefix}_REDIRECT_URI`),
    apiVersion: process.env[`${prefix}_API_VERSION`]?.trim(),
  };
}

export function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function providerPublishScopeEnabled(provider: SocialProvider) {
  const value = process.env[PUBLISH_SCOPE_ENV[provider]]?.trim().toLowerCase();
  if (value === undefined || value === "") return provider === "youtube";
  return value === "true" || value === "1";
}
