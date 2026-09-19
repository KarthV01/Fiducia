# Social platform setup and rollout

The codebase is ready to accept provider credentials through environment secrets. Do not paste credentials into source files, issues, screenshots, chat logs, or committed `.env` files.

## Shared configuration

1. Copy only the missing variable names from `.env.example` into the untracked deployment environment.
2. Generate a 32-byte base64 token-encryption key and configure `SOCIAL_TOKEN_ENCRYPTION_KEYS` plus `SOCIAL_TOKEN_ACTIVE_KEY_ID`.
3. Configure a strong `INTERNAL_JOB_TOKEN`; the scheduler sends it as `Authorization: Bearer <token>` to `POST /internal/jobs/social-monitor`.
4. Apply the Prisma schema with `npm run prisma:push` and generate the client with `npm run prisma:generate` while the backend process is stopped on Windows.
5. Leave Instagram, X, and TikTok publish-scope request flags disabled until their provider reviews and required publishing UX are complete. The YouTube upload scope remains requested by default for the existing upload workflow.
6. Run `npm run check:social`. It reports only presence/shape and never prints credential values.

Production callbacks must be exact HTTPS URLs. Localhost HTTP callbacks are accepted only for development.

## Provider applications

### Instagram

- Create a Meta business app and add Instagram API with Instagram Login.
- Configure the exact value of `INSTAGRAM_REDIRECT_URI`.
- Request Advanced Access for `instagram_business_basic` and `instagram_business_manage_insights`. Request `instagram_business_content_publish` before enabling `REQUEST_INSTAGRAM_PUBLISH_SCOPE`.
- Test both Creator and Business professional accounts. Personal accounts are intentionally unsupported.
- Complete Meta deauthorization/data-deletion configuration before production review.

### X

- Create a Project/App and enable OAuth 2.0 Authorization Code with PKCE.
- Configure the exact `X_REDIRECT_URI` and request `users.read tweet.read offline.access`. Add `tweet.write` before enabling `REQUEST_X_PUBLISH_SCOPE`.
- Confirm that the purchased tier returns the intended Post fields. Owner-only fields are capability-dependent; Fiducia automatically falls back to public metrics.
- Set `X_MONTHLY_REQUEST_BUDGET` to a positive operational allowance chosen from the purchased tier. Enforce the same ceiling at the scheduler or gateway and keep automatic settlement disabled operationally until usage alerts exist.

### TikTok

- Add Login Kit, Display API, and Content Posting API products.
- Configure `TIKTOK_REDIRECT_URI` and request approval for profile/statistics and `video.list`. Request `video.publish` and `video.upload` before enabling `REQUEST_TIKTOK_PUBLISH_SCOPE`.
- Verify the production asset URL/domain before using Content Posting API pull-from-URL.
- Complete TikTok's audit before public Direct Post. Unaudited clients are restricted to private posts.
- The current Fiducia production workflow uses creator-native publishing plus owned-video selection; this remains the safe fallback when Direct Post is unavailable.

### YouTube

- Enable YouTube Data API v3 and YouTube Analytics API in the Google Cloud project.
- Configure `YOUTUBE_SOCIAL_REDIRECT_URI` separately from the legacy YouTube callback during migration.
- Add `youtube.readonly`, `youtube.upload`, and `yt-analytics.readonly` to the OAuth consent screen and complete Google verification for external production users. Set `REQUEST_YOUTUBE_UPLOAD_SCOPE=false` if upload should be disabled.
- Restrict `YOUTUBE_API_KEY` to the required APIs and deployment network/application constraints.

## Verification sequence

For each provider:

1. Connect a provider-owned test creator through Creator → Platforms.
2. Verify the returned immutable account ID and granted-capability display.
3. Create a contract selecting that platform and an allowlisted provider metric.
4. Submit and approve the platform-ready final cut.
5. Publish natively (or use the existing YouTube service upload), load owned posts, and attach the correct post.
6. Run the social monitor twice at least 30 minutes apart.
7. Confirm two idempotent observations, evidence hashes, and no payout below threshold.
8. On Base Sepolia, confirm exactly one release after both observations satisfy the condition.
9. Revoke the provider grant and confirm the connection requires reauthorization and collection stops.

Keep new providers and metrics in evidence-only mode until these checks pass. Provider review approval, production credentials, real creator authorization, and scheduler infrastructure are external prerequisites and cannot be completed by repository code alone.

## Current activation status

- YouTube retains the existing direct-upload path and now also supports provider-neutral OAuth, owned-content discovery, and public plus owner analytics.
- Instagram, X, and TikTok support OAuth, owned-content discovery, metric ingestion, contract attachment, evidence hashing, and creator-native publishing fallback.
- Publish-scope requests for Instagram, X, and TikTok are feature-gated. Direct publishing is not represented as an active capability until the corresponding provider approval and publishing implementation are complete.
