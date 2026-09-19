# Social platform integration plan

Fiducia will support creator-authorized connections to Instagram, X, TikTok, and YouTube for publishing, publication verification, reporting, and allowlisted contract settlement.

## Product decisions

- A campaign can contain multiple platform-specific posts.
- Each platform post is approved, published, measured, and paid independently.
- Sponsor approval covers the complete platform-ready post; there is no separate ad-segment approval.
- Direct API publishing is preferred where provider approval and account capabilities permit it.
- Creator-native publishing with owned-post selection and verification is the fallback.
- Collection is limited to contract measurements plus minimal profile/content data needed for reporting and audit evidence.
- Only explicitly allowlisted metrics can automatically release escrow.

## Architecture

Replace the YouTube-specific connection boundary with provider-neutral connections, one-time PKCE OAuth attempts, owned social content, agreement/content bindings, immutable metric observations, and durable synchronization runs. Provider adapters own authorization, token refresh, identity/capability discovery, content lookup, publishing, metrics, and error normalization.

Tokens remain server-side and AES-256-GCM encrypted using a versioned, rotatable key ring. OAuth state is single-use and bound to the signed-in user, creator profile, provider, and return location. Partial consent downgrades capabilities instead of being treated as a complete connection.

Every accepted metric condition records its provider, account, content, canonical metric, source class, aggregation, threshold/formula, measurement window, reporting-lag grace period, confirmation policy, rounding, missing-data behavior, and payout cap. Settlement records the exact observation IDs and policy version used.

## Provider scope

- Instagram: professional Creator/Business accounts, owned media, insights, and content publishing. Initial metrics are views/plays, reach, likes, comments, saves, and shares when supported for the media type.
- X: OAuth 2.0 PKCE, owned Posts, Post creation, and entitlement-supported impressions and engagement. Enforce request and cost budgets.
- TikTok: Login Kit, profile/statistics, owned public videos, Direct Post where approved, and views/likes/comments/shares.
- YouTube: preserve upload and channel binding, add owner-authorized Analytics, and collect views, engaged views, watch time, average view duration, likes, comments, shares, and attributable subscriber changes where report-compatible.

Direct publication binds the approved asset to the returned provider content ID. Manual publication verifies account ownership, disclosure/caption requirements, visibility, and content fingerprint. If a provider prevents reliable fingerprinting, publication payout requires recorded sponsor/operator confirmation; metric collection may continue after ownership is proven.

## Delivery sequence

1. Provider-neutral schema, OAuth security, token encryption, adapter interface, synchronization evidence, and YouTube migration.
2. YouTube Analytics completion and metric-catalog correction.
3. TikTok connection, owned-video discovery, publishing, and measurements.
4. Instagram professional-account connection, media publishing/discovery, and insights.
5. X connection, publishing, entitlement discovery, metrics, and cost controls.
6. Creator connection UI, cross-platform contract builder, evidence timeline, production monitoring, and staged settlement enablement.

Each provider runs in evidence-only mode before its first metric is enabled for automatic settlement. Production enablement requires OAuth threat tests, revocation/deletion tests, rate-limit and schema-drift tests, Base Sepolia payout reconciliation, provider approval, operational dashboards, and a provider/metric kill switch.

## Git policy

Commit and push directly to `main` after each independently testable, semi-important increment: schemas/migrations, OAuth/security components, provider adapters, endpoint groups, complete UI workflows, settlement behavior, significant test suites, and deployment documentation.

Every pushed commit must be narrowly scoped, pass applicable builds/tests, exclude secrets and unrelated changes, and use a descriptive message. Never commit `.env`, tokens, local databases, or uploaded media. Never force-push shared `main`; if branch protection rejects a push, stop and report it.

## References

- [Instagram API with Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login)
- [X authentication](https://docs.x.com/fundamentals/authentication/overview)
- [TikTok scopes](https://developers.tiktok.com/docs/en/scopes-overview)
- [YouTube Analytics authorization](https://developers.google.com/youtube/reporting/guides/authorization)

Provider documentation, app-review requirements, API versions, entitlements, and pricing must be rechecked immediately before each provider implementation and production review.
