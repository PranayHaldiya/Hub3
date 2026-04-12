# Hub3

Hub3 is an OWS-powered code asset protocol for publishing, monetizing, and refreshing repositories with verifiable provenance.

It combines four primitives into one product flow:
- Irys-backed repository manifests and snapshots
- Solana-linked repository ownership and pricing
- x402-gated paid access to repo content
- OWS-backed signer boundaries for policy-gated agent actions

## What Is Live

Hub3 currently supports:
- GitHub OAuth and public repository discovery
- Solana wallet connection in the web app
- Publishing repositories into Hub3 with durable manifests
- Repo pricing updates and x402 enforcement for paid reads
- Repo access grants after payment
- Dashboard views for OWS wallet state, policy controls, activity, and receipts
- Provisioning a dedicated signer-backed Hub3 wallet
- A first policy-aware agent flow: refresh a published repo only when wallet and policy allow it

## Workspace

- `apps/web` - Next.js frontend
- `apps/api` - Fastify backend
- `apps/signer` - dedicated signer service for OWS-style wallet boundaries
- `packages/shared` - shared schemas and contracts
- `programs/repo_registry` - Anchor Solana program
- `clients/ts/repo_registry` - generated client stub

## Product Thesis

Hub3 is being positioned for the Open Wallet Standard hackathon around one clear idea:

Agents can pay for, verify, and refresh code without receiving raw wallet control.

That means the product is not just “store repos on-chain.” It is:
- durable code provenance
- paid code access
- visible operator policy
- bounded agent execution

## Local Setup

1. Install dependencies:
   `npm install`
2. Copy environment values into `.env` and `apps/web/.env.local` as needed.
3. Start the services you need:
   - API: `npm run dev --workspace @hub3/api`
   - Web: `npm run dev --workspace @hub3/web`
   - Signer: `npm run dev:signer`

If you want the full local product flow, run all three.

## Environment Notes

Key values used by the current build:
- `HUB3_API_URL`
- `HUB3_WEB_URL`
- `HUB3_SIGNER_URL`
- `HUB3_SIGNER_SECRET`
- GitHub OAuth variables
- database connection variables
- Irys and Solana ownership variables
- x402 configuration values

See [.env.example](E:/Hub3/.env.example) for the current local template.

## How To Test Hub3

### Automated checks

Run:
- `npm test`
- `npm run build`

These currently cover the API flows for:
- publish
- pricing permissions
- x402 gating
- repo access grants
- agent refresh blocked state
- agent refresh allowed state

### Manual product test

1. Open the homepage and sign in with GitHub.
2. Open the dashboard.
3. Provision the Hub3 OWS wallet.
4. Save a policy that allows `refresh` and either leaves allowlists empty or includes your repo.
5. Publish a public GitHub repository.
6. Confirm it appears in the Published Repos panel.
7. In the Agent Console, select that repo and verify the readiness check.
8. Run agent refresh and confirm the activity timeline updates.
9. Optionally set repo pricing and verify that unauthenticated manifest reads return `402` until access is granted.

## Demo Flow For Judges

Use this order in a live demo:
1. Show the landing page thesis.
2. Open dashboard and point out wallet state + policy state.
3. Publish a repo or use an existing published repo.
4. Show the agent readiness check failing if wallet/policy is not ready.
5. Fix the prerequisite.
6. Run the agent refresh.
7. Show the resulting activity log.
8. Show a priced repo route returning payment-gated access requirements.

## Key Docs

- [HACKATHON_PLAN.md](E:/Hub3/HACKATHON_PLAN.md)
- [AGENTS.md](E:/Hub3/AGENTS.md)
- [ARCHITECTURE.md](E:/Hub3/ARCHITECTURE.md)
- [PROJECT_CONTEXT.md](E:/Hub3/PROJECT_CONTEXT.md)

## Current Boundaries

Hub3 is intentionally not trying to ship the full Git3 roadmap yet. The following are out of scope for this submission build:
- NFT marketplace
- royalties
- token launch
- on-chain branches and pull requests
- multi-chain support
- enterprise features

The current goal is a tight, memorable, working product story.
