import type { ProviderAdapter, SocialProvider } from "../types.js";
import { instagramAdapter } from "./instagram.js";
import { tiktokAdapter } from "./tiktok.js";
import { xAdapter } from "./x.js";
import { youtubeAdapter } from "./youtube.js";

const adapters: Record<SocialProvider, ProviderAdapter> = {
  instagram: instagramAdapter,
  x: xAdapter,
  tiktok: tiktokAdapter,
  youtube: youtubeAdapter,
};

export function providerAdapter(provider: SocialProvider) {
  return adapters[provider];
}
