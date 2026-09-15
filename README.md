# Fiducia

Fiducia is a sponsorship operations and escrow platform for creators and brands. It turns an informal campaign agreement into a traceable workflow where terms are accepted, funds are reserved, creative work is reviewed, publication is verified, performance is measured, and each payout is released only when its milestone has been satisfied.

## The problem

Creator sponsorships combine relationship management, private files, approval cycles, public-platform data, and outcome-based compensation. Traditional contracts describe these obligations but do not enforce the operational sequence. Creators face payment uncertainty, while sponsors must trust that deliverables, publication, and performance claims match what was agreed.

Fiducia connects those stages without placing the entire agreement on-chain. Rich terms, files, metrics, and workflow state remain in the application; a Solidity escrow stores a hash of the accepted terms, locks the campaign's maximum payout in USDC-style tokens, and permits releases only through an authorized operator.

## Platform scope

The application supports:

- authenticated sponsor and creator profiles;
- a professional directory, mutual connections, direct messaging, and groups;
- structured agreement invitations with fixed and performance-based compensation;
- fully funded escrow at acceptance;
- private, immutable concept and final-cut versions;
- sponsor approval tied to artifact snapshot hashes;
- staged payouts for concept approval, final-cut approval, publication, performance, and retention;
- YouTube OAuth, resumable uploads, publication monitoring, and channel-aware verification;
- fixed bonuses and capped per-thousand-view rules;
- creator earnings, sponsor campaign, contract, wallet, and messaging workspaces;
- authenticated realtime updates across both sides of the relationship.

The current payout model assigns 10% to concept approval, 20% to final-cut approval, 60% to verified publication, and 10% to retention. Performance rules settle independently, and expired campaigns return only the unreleased portion of escrow.

## Integrity model

Creator-entered metrics cannot release funds. Publication and performance depend on trusted monitoring, with repeated compliant observations before settlement. Approved deliverables are anchored to immutable snapshots so later file changes cannot redefine what a sponsor accepted. OAuth refresh tokens are encrypted, files remain private to the agreement parties, and external storage is abstracted behind a service boundary.

The contract is intentionally generic: it escrows value against a terms hash rather than encoding YouTube-specific business logic forever. That keeps the financial guarantee small and auditable while allowing the application workflow to evolve.

## Goal and current boundaries

The goal is to give creators confidence that approved work is backed by reserved funds and give sponsors evidence that releases correspond to real milestones. The repository contains a full-stack MVP with a TypeScript/Fastify API, React workspace, Prisma persistence, Solidity contracts, local-chain support, and Base deployment paths.

Local generated wallets support end-to-end development, but a production release still requires a mature wallet-connection and custody model, hardened monitoring infrastructure, durable object storage, operational key management, dispute handling, and legal review. The project establishes the technical lifecycle for programmable, evidence-backed creator payments.
