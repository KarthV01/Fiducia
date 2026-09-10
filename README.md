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

Sponsors create contract invitations by searching creator account names/handles. A contract remains a draft invitation until the selected creator accepts it; acceptance creates/funds escrow and locks the full cap from the sponsor's generated local wallet. The creator then submits an immutable deliverable URL and proof hash for sponsor review. The sponsor can request a revision or approve the latest submission; approval anchors the proof hash and releases the base payout in one transaction. Use **Record performance** on an active contract to submit integer metric values and release bonuses.

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

Submit simulated metric data and release eligible bonus payouts:

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
