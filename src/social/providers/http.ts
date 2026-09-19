import { ProviderApiError, type SocialProvider } from "../types.js";

export async function providerJson<T>(provider: SocialProvider, url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.text();
    const category = response.status === 401 ? "authorization" : response.status === 403 ? "permission" : response.status === 429 ? "rate_limit" : response.status >= 500 ? "unavailable" : "invalid_response";
    throw new ProviderApiError(provider, category, `${provider} API returned ${response.status}: ${body.slice(0, 300)}`, response.status);
  }
  return response.json() as Promise<T>;
}

export function form(values: Record<string, string>) {
  return new URLSearchParams(values);
}

export function bearer(accessToken: string, extra: Record<string, string> = {}) {
  return { authorization: `Bearer ${accessToken}`, ...extra };
}
