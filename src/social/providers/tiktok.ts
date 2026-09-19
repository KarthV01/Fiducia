import { providerConfig } from "../providerConfig.js";
import type { ProviderAdapter, ProviderMetric } from "../types.js";
import { bearer, form, providerJson } from "./http.js";

const scopes = ["user.info.basic", "user.info.profile", "user.info.stats", "video.list", "video.publish", "video.upload"];
const videoFields = "id,title,video_description,create_time,share_url,duration,view_count,like_count,comment_count,share_count";

export const tiktokAdapter: ProviderAdapter = {
  provider: "tiktok",
  scopes,
  authorizationUrl({ state, codeChallenge }) {
    const config = providerConfig("tiktok");
    return `https://www.tiktok.com/v2/auth/authorize/?${new URLSearchParams({ client_key: config.clientId, response_type: "code", scope: scopes.join(","), redirect_uri: config.redirectUri, state, code_challenge: codeChallenge, code_challenge_method: "S256" })}`;
  },
  async exchangeCode(code, verifier) {
    const config = providerConfig("tiktok");
    const body = await providerJson<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string }>("tiktok", "https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form({ client_key: config.clientId, client_secret: config.clientSecret, code, grant_type: "authorization_code", redirect_uri: config.redirectUri, code_verifier: verifier }) });
    return { accessToken: body.access_token, refreshToken: body.refresh_token, expiresIn: body.expires_in, scopes: body.scope?.split(",") ?? scopes };
  },
  async refresh(refreshToken) {
    const config = providerConfig("tiktok");
    const body = await providerJson<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string }>("tiktok", "https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form({ client_key: config.clientId, client_secret: config.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }) });
    return { accessToken: body.access_token, refreshToken: body.refresh_token, expiresIn: body.expires_in, scopes: body.scope?.split(",") ?? scopes };
  },
  async identity(accessToken) {
    const body = await providerJson<{ data: { user: { open_id: string; username?: string; display_name?: string } } }>("tiktok", "https://open.tiktokapis.com/v2/user/info/?fields=open_id,username,display_name,avatar_url,profile_deep_link,is_verified,follower_count,following_count,likes_count,video_count", { headers: bearer(accessToken) });
    return { accountId: body.data.user.open_id, username: body.data.user.username, displayName: body.data.user.display_name, capabilities: ["profile.read", "content.read", "metrics.public", "content.publish"] };
  },
  async listContent(accessToken, cursor) {
    const body = await providerJson<{ data?: { videos?: Array<{ id: string; title?: string; video_description?: string; share_url?: string; create_time?: number }>; cursor?: number; has_more?: boolean } }>("tiktok", `https://open.tiktokapis.com/v2/video/list/?fields=${videoFields}`, { method: "POST", headers: bearer(accessToken, { "content-type": "application/json" }), body: JSON.stringify({ max_count: 20, ...(cursor ? { cursor: Number(cursor) } : {}) }) });
    return { items: (body.data?.videos ?? []).map((item) => ({ providerContentId: item.id, canonicalUrl: item.share_url, contentType: "video", title: item.title, description: item.video_description, visibility: "public", publishedAt: item.create_time ? new Date(item.create_time * 1000) : undefined })), cursor: body.data?.has_more ? String(body.data.cursor) : undefined };
  },
  async metrics(accessToken, contentIds) {
    const observations: ProviderMetric[] = [];
    for (let start = 0; start < contentIds.length; start += 20) {
      const body = await providerJson<{ data?: { videos?: Array<Record<string, number | string> & { id: string }> } }>("tiktok", `https://open.tiktokapis.com/v2/video/query/?fields=${videoFields}`, { method: "POST", headers: bearer(accessToken, { "content-type": "application/json" }), body: JSON.stringify({ filters: { video_ids: contentIds.slice(start, start + 20) } }) });
      for (const video of body.data?.videos ?? []) {
        for (const field of ["view_count", "like_count", "comment_count", "share_count"] as const) if (video[field] != null) observations.push({ key: `tiktok.video.${field.replace("_count", "s")}`, providerField: field, value: String(video[field]), unit: "count", sourceEndpoint: "/v2/video/query/", sourceClass: "public_api", observedAt: new Date() });
      }
    }
    return observations;
  },
};
