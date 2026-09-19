import { providerConfig } from "../providerConfig.js";
import type { ProviderAdapter, ProviderMetric } from "../types.js";
import { bearer, form, providerJson } from "./http.js";

const scopes = ["instagram_business_basic", "instagram_business_manage_insights", "instagram_business_content_publish"];

export const instagramAdapter: ProviderAdapter = {
  provider: "instagram",
  scopes,
  authorizationUrl({ state }) {
    const config = providerConfig("instagram");
    return `https://www.instagram.com/oauth/authorize?${new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: scopes.join(","), state })}`;
  },
  async exchangeCode(code) {
    const config = providerConfig("instagram");
    const token = await providerJson<{ access_token: string; user_id?: string; expires_in?: number }>("instagram", "https://api.instagram.com/oauth/access_token", { method: "POST", body: form({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: "authorization_code", redirect_uri: config.redirectUri, code }) });
    const longLived = await providerJson<{ access_token: string; expires_in?: number }>("instagram", `https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: config.clientSecret, access_token: token.access_token })}`);
    return { accessToken: longLived.access_token, expiresIn: longLived.expires_in, scopes };
  },
  async refresh(accessToken) {
    const token = await providerJson<{ access_token: string; expires_in?: number }>("instagram", `https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: accessToken })}`);
    return { accessToken: token.access_token, expiresIn: token.expires_in, scopes };
  },
  async identity(accessToken) {
    const body = await providerJson<{ user_id?: string; id?: string; username?: string; name?: string }>("instagram", `https://graph.instagram.com/me?fields=user_id,username,name,account_type&access_token=${encodeURIComponent(accessToken)}`);
    return { accountId: body.user_id ?? body.id ?? "", username: body.username, displayName: body.name, capabilities: ["profile.read", "content.read", "metrics.read", "content.publish"] };
  },
  async listContent(accessToken, cursor) {
    const url = cursor ?? `https://graph.instagram.com/me/media?fields=id,caption,media_type,media_product_type,permalink,timestamp&limit=50&access_token=${encodeURIComponent(accessToken)}`;
    const body = await providerJson<{ data?: Array<{ id: string; caption?: string; media_type?: string; permalink?: string; timestamp?: string }>; paging?: { next?: string } }>("instagram", url);
    return { items: (body.data ?? []).map((item) => ({ providerContentId: item.id, canonicalUrl: item.permalink, contentType: item.media_type?.toLowerCase(), description: item.caption, visibility: "public", publishedAt: item.timestamp ? new Date(item.timestamp) : undefined })), cursor: body.paging?.next };
  },
  async metrics(accessToken, contentIds) {
    const observations: ProviderMetric[] = [];
    for (const id of contentIds) {
      const body = await providerJson<{ data?: Array<{ name: string; values?: Array<{ value: number }> }> }>("instagram", `https://graph.instagram.com/${encodeURIComponent(id)}/insights?metric=views,reach,likes,comments,saved,shares&access_token=${encodeURIComponent(accessToken)}`);
      for (const item of body.data ?? []) {
        const value = item.values?.at(-1)?.value;
        if (value == null) continue;
        observations.push({ providerContentId: id, key: `instagram.media.${item.name === "saved" ? "saves" : item.name}`, providerField: item.name, value: String(value), unit: "count", sourceEndpoint: "/insights", sourceClass: "owner_analytics", observedAt: new Date() });
      }
    }
    return observations;
  },
  async revoke(accessToken) {
    await providerJson("instagram", "https://graph.instagram.com/me/permissions", { method: "DELETE", headers: bearer(accessToken) });
  },
};
