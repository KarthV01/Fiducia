import { providerConfig } from "../providerConfig.js";
import type { ProviderAdapter, ProviderMetric } from "../types.js";
import { bearer, form, providerJson } from "./http.js";

const scopes = ["https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/yt-analytics.readonly"];

export const youtubeAdapter: ProviderAdapter = {
  provider: "youtube",
  scopes,
  authorizationUrl({ state, codeChallenge }) {
    const config = providerConfig("youtube");
    return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: scopes.join(" "), access_type: "offline", prompt: "consent", state, code_challenge: codeChallenge, code_challenge_method: "S256" })}`;
  },
  async exchangeCode(code, verifier) {
    const config = providerConfig("youtube");
    const body = await providerJson<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string }>("youtube", "https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: "authorization_code", code_verifier: verifier }) });
    return { accessToken: body.access_token, refreshToken: body.refresh_token, expiresIn: body.expires_in, scopes: body.scope?.split(" ") ?? scopes };
  },
  async refresh(refreshToken) {
    const config = providerConfig("youtube");
    const body = await providerJson<{ access_token: string; expires_in?: number; scope?: string }>("youtube", "https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form({ refresh_token: refreshToken, client_id: config.clientId, client_secret: config.clientSecret, grant_type: "refresh_token" }) });
    return { accessToken: body.access_token, refreshToken, expiresIn: body.expires_in, scopes: body.scope?.split(" ") ?? scopes };
  },
  async identity(accessToken) {
    const body = await providerJson<{ items?: Array<{ id: string; snippet?: { title?: string; customUrl?: string } }> }>("youtube", "https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true", { headers: bearer(accessToken) });
    const channel = body.items?.[0];
    if (!channel) throw new Error("The Google account does not expose a YouTube channel.");
    return { accountId: channel.id, username: channel.snippet?.customUrl, displayName: channel.snippet?.title, capabilities: ["profile.read", "content.read", "metrics.public", "metrics.owner", "content.publish"] };
  },
  async listContent(accessToken, cursor) {
    const identity = await this.identity(accessToken);
    const params = new URLSearchParams({ part: "snippet", channelId: identity.accountId, type: "video", order: "date", maxResults: "50" });
    if (cursor) params.set("pageToken", cursor);
    const body = await providerJson<{ items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string; description?: string; publishedAt?: string } }>; nextPageToken?: string }>("youtube", `https://www.googleapis.com/youtube/v3/search?${params}`, { headers: bearer(accessToken) });
    return { items: (body.items ?? []).flatMap((item) => item.id?.videoId ? [{ providerContentId: item.id.videoId, canonicalUrl: `https://www.youtube.com/watch?v=${item.id.videoId}`, contentType: "video", title: item.snippet?.title, description: item.snippet?.description, visibility: "public", publishedAt: item.snippet?.publishedAt ? new Date(item.snippet.publishedAt) : undefined }] : []), cursor: body.nextPageToken };
  },
  async metrics(accessToken, contentIds) {
    if (!contentIds.length) return [];
    const body = await providerJson<{ items?: Array<{ id: string; statistics?: Record<string, string> }> }>("youtube", `https://www.googleapis.com/youtube/v3/videos?${new URLSearchParams({ part: "statistics", id: contentIds.slice(0, 50).join(",") })}`, { headers: bearer(accessToken) });
    const map: Record<string, string> = { viewCount: "views", likeCount: "likes", commentCount: "comments" };
    const observations: ProviderMetric[] = [];
    for (const video of body.items ?? []) for (const [field, key] of Object.entries(map)) if (video.statistics?.[field] != null) observations.push({ key: `youtube.video.${key}`, providerField: field, value: video.statistics[field], unit: "count", sourceEndpoint: "/youtube/v3/videos", sourceClass: "public_api", observedAt: new Date() });
    return observations;
  },
  async revoke(accessToken) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" } });
  },
};
