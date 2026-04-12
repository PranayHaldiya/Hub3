# Hub3 Architecture

## System Summary

Hub3 is a three-service product around repositories as durable, monetizable code assets.

1. `apps/web`
- Next.js frontend
- dashboard, repo detail pages, wallet controls, agent console

2. `apps/api`
- Fastify backend
- GitHub OAuth, publish, pricing, x402 gating, dashboard APIs, agent policy evaluation

3. `apps/signer`
- dedicated signer service
- provisions and restores the Hub3 signer wallet
- intended trust boundary for agent-safe actions

## Core Data Flow

### Publish flow

1. user authenticates with GitHub
2. frontend calls `POST /repos/publish`
3. API resolves repo ref and downloads the archive from GitHub
4. API uploads artifact + manifest through the storage adapter
5. ownership adapter updates the Solana-linked repo registry pointer
6. repo and manifest metadata are stored for browsing and refresh later

### Paid access flow

1. maintainer sets pricing for a published repo
2. unauthenticated or unpaid manifest/tree/file reads return `402`
3. client pays using x402 flow
4. Hub3 stores a repo access grant
5. subsequent reads succeed until the grant expires

### Agent refresh flow

1. operator provisions the Hub3 signer wallet
2. operator saves policy controls
3. dashboard calls `GET /agent/actions/refresh/:repoId/check`
4. API evaluates wallet readiness + policy + repo allowlist match
5. dashboard calls `POST /agent/actions/refresh` only when allowed
6. API refreshes the repo and records the activity

## Main Storage Concepts

### API persistence

The API persists:
- repos
- manifests
- publish jobs
- repo files
- repo access grants
- agent wallets
- agent wallet secrets for local signer restoration
- agent policies
- agent activity logs
- payment receipts

### Shared contracts

`packages/shared` defines the contracts used by both frontend and backend.

This includes:
- publish requests and responses
- pricing contracts
- access status contracts
- dashboard summary schema
- agent wallet and policy schemas
- agent refresh readiness and execution schemas

## Security Shape

The current security posture is intentionally simple and visible:
- user actions remain explicit in the frontend
- paid reads are enforced at API routes
- signer-backed actions are separated from browser wallet actions
- policy is checked before the first live agent action
- activity is recorded so blocked and successful runs are visible

## Hackathon Framing

The architecture is optimized for one clear demo, not for full roadmap completeness.

The strongest current story is:
- code provenance on Irys + Solana
- monetized access via x402
- bounded agent action via signer + policy

Everything else is intentionally secondary for this submission.
