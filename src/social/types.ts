export const SOCIAL_PROVIDERS = ["instagram", "x", "tiktok", "youtube"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export type TokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scopes: string[];
};

export type ProviderIdentity = {
  accountId: string;
  username?: string;
  displayName?: string;
  capabilities: string[];
};

export type ProviderContent = {
  providerContentId: string;
  canonicalUrl?: string;
  contentType?: string;
  title?: string;
  description?: string;
  visibility?: string;
  publishedAt?: Date;
};

export type ProviderMetric = {
  providerContentId: string;
  key: string;
  providerField: string;
  value: string;
  unit: string;
  sourceEndpoint: string;
  sourceClass: "public_api" | "owner_analytics";
  observedAt: Date;
  intervalStart?: Date;
  intervalEnd?: Date;
};

export type ProviderAdapter = {
  provider: SocialProvider;
  scopes: string[];
  authorizationUrl(input: { state: string; codeChallenge: string }): string;
  exchangeCode(code: string, codeVerifier: string): Promise<TokenSet>;
  refresh(refreshToken: string): Promise<TokenSet>;
  identity(accessToken: string): Promise<ProviderIdentity>;
  listContent(accessToken: string, cursor?: string): Promise<{ items: ProviderContent[]; cursor?: string }>;
  metrics(accessToken: string, contentIds: string[]): Promise<ProviderMetric[]>;
  revoke?(accessToken: string): Promise<void>;
};

export class ProviderApiError extends Error {
  constructor(
    public readonly provider: SocialProvider,
    public readonly category: "authorization" | "permission" | "rate_limit" | "unavailable" | "invalid_response",
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderApiError";
  }
}
