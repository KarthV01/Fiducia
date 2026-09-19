import { providerConfig } from "../providerConfig.js";
import type { ProviderAdapter, ProviderMetric } from "../types.js";
import { bearer, form, providerJson } from "./http.js";

const scopes = ["users.read", "tweet.read", "tweet.write", "offline.access"];
const tweetFields = "id,text,created_at,author_id,public_metrics,non_public_metrics,organic_metrics";

export const xAdapter: ProviderAdapter = {
  provider: "x",
  scopes,
  authorizationUrl({ state, codeChallenge }) {
    const config = providerConfig("x");
    return `https://x.com/i/oauth2/authorize?${new URLSearchParams({ response_type: "code", client_id: config.clientId, redirect_uri: config.redirectUri, scope: scopes.join(" "), state, code_challenge: codeChallenge, code_challenge_method: "S256" })}`;
  },
  async exchangeCode(code, verifier) {
    const config = providerConfig("x");
    const body = await providerJson<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string }>("x", "https://api.x.com/2/oauth2/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}` }, body: form({ code, grant_type: "authorization_code", redirect_uri: config.redirectUri, code_verifier: verifier }) });
    return { accessToken: body.access_token, refreshToken: body.refresh_token, expiresIn: body.expires_in, scopes: body.scope?.split(" ") ?? scopes };
  },
  async refresh(refreshToken) {
    const config = providerConfig("x");
    const body = await providerJson<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string }>("x", "https://api.x.com/2/oauth2/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}` }, body: form({ refresh_token: refreshToken, grant_type: "refresh_token" }) });
    return { accessToken: body.access_token, refreshToken: body.refresh_token, expiresIn: body.expires_in, scopes: body.scope?.split(" ") ?? scopes };
  },
  async identity(accessToken) {
    const body = await providerJson<{ data: { id: string; username?: string; name?: string } }>("x", "https://api.x.com/2/users/me?user.fields=id,name,username,public_metrics", { headers: bearer(accessToken) });
    return { accountId: body.data.id, username: body.data.username, displayName: body.data.name, capabilities: ["profile.read", "content.read", "metrics.public", "content.publish"] };
  },
  async listContent(accessToken, cursor) {
    const identity = await this.identity(accessToken);
    const params = new URLSearchParams({ max_results: "100", "tweet.fields": tweetFields, exclude: "retweets,replies" });
    if (cursor) params.set("pagination_token", cursor);
    const body = await providerJson<{ data?: Array<{ id: string; text?: string; created_at?: string }>; meta?: { next_token?: string } }>("x", `https://api.x.com/2/users/${identity.accountId}/tweets?${params}`, { headers: bearer(accessToken) });
    return { items: (body.data ?? []).map((item) => ({ providerContentId: item.id, canonicalUrl: identity.username ? `https://x.com/${identity.username}/status/${item.id}` : undefined, contentType: "post", description: item.text, visibility: "public", publishedAt: item.created_at ? new Date(item.created_at) : undefined })), cursor: body.meta?.next_token };
  },
  async metrics(accessToken, contentIds) {
    if (!contentIds.length) return [];
    const body = await providerJson<{ data?: Array<Record<string, unknown> & { id: string; public_metrics?: Record<string, number>; non_public_metrics?: Record<string, number>; organic_metrics?: Record<string, number> }> }>("x", `https://api.x.com/2/tweets?${new URLSearchParams({ ids: contentIds.slice(0, 100).join(","), "tweet.fields": tweetFields })}`, { headers: bearer(accessToken) });
    const observations: ProviderMetric[] = [];
    for (const post of body.data ?? []) {
      for (const [sourceClass, metrics] of [["public_api", post.public_metrics], ["owner_analytics", post.non_public_metrics], ["owner_analytics", post.organic_metrics]] as const) {
        for (const [field, value] of Object.entries(metrics ?? {})) observations.push({ key: `x.post.${field.replace(/_count$/, "")}`, providerField: field, value: String(value), unit: "count", sourceEndpoint: "/2/tweets", sourceClass, observedAt: new Date() });
      }
    }
    return observations;
  },
};
