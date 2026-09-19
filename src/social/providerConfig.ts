import type { SocialProvider } from "./types.js";

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
