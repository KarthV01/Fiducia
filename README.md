# YTPayouts

Backend + smart-contract MVP for creator sponsorship escrow.

This repo models sponsorships as generic agreements instead of hardcoded YouTube contracts. The backend stores the rich agreement terms and metric/payout logic; the Solidity contract stores a terms hash, escrows the full earning cap in ERC-20 USDC-style tokens, and only lets an authorized backend/operator release payouts. Local development uses mock USDC; Base runs use native Circle USDC.

## Local Stack

- TypeScript, Fastify, Prisma, SQLite
- Solidity, Foundry, Anvil
- Mock USDC for local escrow testing

## Base Sepolia/Mainnet

Base deployment uses the same `SponsorshipEscrow` contract with native Circle USDC. Rehearse on Base Sepolia before Base mainnet:

```powershell
npm run contracts:build
npm run deploy:base-sepolia
npm run check:base-sepolia
```

Mainnet commands are available as `npm run deploy:base-mainnet` and `npm run check:base-mainnet`. Read [docs/base-deployment.md](docs/base-deployment.md) before using real funds.

## Setup

```powershell
npm install
Copy-Item .env.example .env
npm run prisma:generate
npm run db:init
npm run contracts:test
```

In another terminal, start a local chain:

```powershell
npm run anvil
```

Build and deploy the local contracts:

```powershell
npm run contracts:build
npm run deploy:local
```

Set the printed `ESCROW_CONTRACT_ADDRESS` and `USDC_CONTRACT_ADDRESS` values in `.env`, or keep the generated `deployments/local.json` file. The API prefers `.env` and falls back to `deployments/local.json`. The deploy script also mints mock USDC to Anvil account #1 and approves the escrow contract for local agreement funding.

Configure Google OAuth in `.env`:

```powershell
APP_URL="http://localhost:5173"
API_URL="http://localhost:3000"
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
AUTH_COOKIE_SECRET="use-a-long-random-string"
```

In Google Cloud, the local redirect URI is:

```text
http://localhost:3000/api/auth/google/callback
```

Start the API:

```powershell
npm run dev
```

In another terminal, install and start the frontend:

```powershell
npm install --prefix web
npm run web:dev
```

Open `http://localhost:5173`. The entry page signs in with Google, then lets that email create sponsor and creator profiles. Each profile gets a generated local EVM wallet stored in SQLite. Generated-wallet funding is local Anvil only; Base/mainnet still require a future real wallet-connection flow.

## Authenticated Frontend

The UI talks to authenticated APIs:

- Auth: `/api/auth/*`
- Profiles and account picker: `/api/profiles`
- Sponsor workspaces: `/api/sponsors/:sponsorId/*`
- Creator workspaces: `/api/creators/:creatorId/*`
- Creator search: `/api/creators/search?q=...`

Sponsors create contract invitations by searching creator account names/handles. A contract remains a draft invitation until the selected creator accepts it; acceptance creates/funds escrow and locks the full cap from the sponsor's generated local wallet. The creator privately uploads immutable concept and final-cut versions. Sponsor approval anchors the artifact snapshot hash and atomically releases the 10% and 20% work tranches. Verified publication releases 60%; retention releases the final 10%.

Private files are streamed to `DELIVERABLE_STORAGE_DIR` in local development and served only to the contract's creator and sponsor with HTTP Range support. The storage service is behind a `DeliverableStorage` interface for a later S3/R2 adapter. Creator-entered metrics cannot release funds. The legacy sponsor simulation route only works when `ENABLE_SIMULATION_METRICS=true`.

## YouTube publication and monitoring

YouTube uses a separate OAuth connection with upload and channel-read scopes. Set `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REDIRECT_URI`, and a base64-encoded 32-byte `YOUTUBE_TOKEN_ENCRYPTION_KEY`. Refresh tokens are encrypted with AES-256-GCM. Service publication streams the exact approved final cut into a resumable YouTube upload session; the publication tranche is released only when the monitor observes a processed, public video.

Manual publication is disabled by default. When `ENABLE_MANUAL_FINGERPRINT=true`, `FINGERPRINT_WORKER_URL` must point to an isolated yt-dlp/FFmpeg worker. The worker reports versioned fingerprint scores to `/internal/publications/:publicationId/verification`; failures remain in `verification_required` with funds frozen.

Run trusted jobs with `Authorization: Bearer $INTERNAL_JOB_TOKEN`:

- `POST /internal/jobs/youtube-monitor`
- `POST /internal/jobs/settle-performance`
- `POST /internal/jobs/refund-expired`

The monitor requires `YOUTUBE_API_KEY`, two consecutive compliant observations before performance settlement, and never claws back released work payments. Fixed bonuses and capped per-thousand-view rules settle independently. Expiry jobs refund only unreleased escrow.

## Account API

Current signed-in user:

```bash
curl -b cookies.txt http://localhost:3000/api/auth/me
```

List profiles owned by the signed-in email:

```bash
curl -b cookies.txt http://localhost:3000/api/profiles
```

Search creator accounts:

```bash
curl -b cookies.txt "http://localhost:3000/api/creators/search?q=maker"
```

Create a contract invite:

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/sponsors/{sponsorId}/contract-invites \
  -H "Content-Type: application/json" \
  --data @examples/create-contract-invite.json
```

## API Flow

Create an agreement:

```bash
curl -X POST http://localhost:3000/agreements \
  -H "Content-Type: application/json" \
  --data @examples/create-agreement.json
```

Accept it and create the on-chain escrow:

```bash
curl -X POST http://localhost:3000/agreements/{agreementId}/accept
```

After upgrading, rebuild and redeploy the local contract before creating new escrow-backed agreements:

```powershell
npm run contracts:build
npm run deploy:local
```

In local development only, submit simulated metric data (requires `ENABLE_SIMULATION_METRICS=true`):

```bash
curl -X POST http://localhost:3000/agreements/{agreementId}/metrics \
  -H "Content-Type: application/json" \
  --data @examples/metric-update.json
```

Fetch current agreement, escrow, metric, and payout status:

```bash
curl http://localhost:3000/agreements/{agreementId}
```

## Agreement Shape

Amounts are stored as integer token units, so mock USDC uses 6 decimals:

- `2000000000` = 2,000 USDC
- `500000000` = 500 USDC

Metric thresholds are also integer strings. Inputs like `100K` or `1M` are intentionally rejected.
