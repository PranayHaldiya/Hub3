# Hub3 Project Context

Last updated: 2026-03-13

## Current Status

Hub3 is now working in live mode locally across:

- GitHub OAuth and GitHub API repo/archive fetch
- Irys upload for artifacts and manifests
- Solana devnet ownership registration against the deployed `repo_registry` program
- Postgres-backed persistence for sessions, repos, manifests, jobs, and repo files
- Next.js web app build on `15.5.12`

## What Was Completed

### 1. Real GitHub integration

- Replaced the mock GitHub adapter with a live GitHub adapter in `apps/api/src/adapters.ts`
- Added OAuth session flow in `apps/api/src/auth.ts`
- Added live routes in `apps/api/src/routes.ts`
- Frontend dashboard now fetches repos client-side using credentials

### 2. Real repo archive parsing

- Publish flow downloads the GitHub zipball and extracts readable repo files with `jszip`
- Repo browser data is stored and served from the API

### 3. Persistence

- Replaced in-memory stores and SQLite with Postgres in `apps/api/src/db.ts`
- Data/session helpers now persist publish jobs, manifests, repo records, repo files, OAuth state, and GitHub sessions
- Tests now use injected doubles plus `pg-mem` instead of a runtime mock mode
- Added Drizzle schema ownership in `apps/api/src/schema.ts` and config in `apps/api/drizzle.config.ts`
- Current production direction is managed Postgres via `DATABASE_URL` rather than a checked-in local Postgres setup
- Runtime queries currently stay on `pg` for stability, while Drizzle is present for schema/migration ownership

### 4. Irys live adapter

- Added live Irys upload support in `apps/api/src/adapters.ts`
- Added support for Solana devnet-style setup using `withRpc(...).devnet()` when `IRYS_NODE_URL` is omitted
- Added secret normalization so a Solana CLI JSON-array private key can also be used with Irys
- Added local helper script:
  - `npm run irys:status --workspace @hub3/api`
  - `npm run irys:fund --workspace @hub3/api -- <amount>`

### 5. Solana ownership live adapter

- Deployed the `repo_registry` program to Solana devnet
- Program ID:
  - `8d7FrUUG4sKQRsKpUDTimKb4c2MQqWVfkPFhM79CY6Ge`
- Updated program ID references in:
  - `programs/repo_registry/programs/repo_registry/src/lib.rs`
  - `programs/repo_registry/Anchor.toml`
  - `clients/ts/repo_registry/src/index.ts`
- Upgraded the Solana toolchain in WSL:
  - Anchor CLI `0.32.1`
  - Solana CLI `2.3.0`
  - Rust `1.89.0`
- Pinned the workspace toolchain in:
  - `programs/repo_registry/Anchor.toml`
  - `programs/repo_registry/rust-toolchain.toml`
- Upgraded the program crate to `anchor-lang 0.32.1`
- Regenerated the canonical IDL with the current toolchain and copied it to:
  - `idl/repo_registry.json`
- Simplified the shared repo registry client in `clients/ts/repo_registry/src/index.ts`
  - The client now consumes the generated modern IDL directly
  - The temporary legacy-IDL normalization shim has been removed
- `apps/api/src/adapters.ts` now talks to the program through the shared IDL client instead of hand-built buffers

### 6. Env wiring

- Added example env files:
  - `apps/api/.env.example`
  - `apps/web/.env.example`
- Added local env loading in `apps/api/src/config.ts`
- Runtime mock env toggles were removed from the API
- Local live env files currently exist:
  - `.env`
  - `apps/api/.env`
  - `apps/web/.env.local`

Important:

- Local env files contain real secrets and must not be committed
- Do not paste GitHub client secret or Solana private keys into future notes/docs

### 7. Next.js upgrade

- Upgraded web app to Next.js `15.5.12`

## Verified Results

### Build and test

- `npm test --workspace @hub3/api` passes
- `npm run build` passes

### Runtime shape

- Runtime mock adapters have been removed from the API codepath
- Tests now inject fake adapters directly into `buildServer(...)`
- Persistence is async and pool-backed
- Drizzle is available for typed schema and migration generation, but runtime data access still uses stable `pg` queries
- Solana ownership writes now go through the shared IDL client using the regenerated Anchor `0.32.1` IDL

### Irys funding

- The uploader wallet was funded on Irys devnet for testing
- Funding helper is available through the scripts above

### Real publish smoke test

The following repo was published successfully through the real pipeline:

- Source repo:
  - `PranayM0/bd87efc3-0f73-4830-9779-2f94a78301b1_proj_0fe1f7bdbaeb_dogefather-2-0`
- Hub3 repo ID:
  - `0fd9f605c6426871e78b50a7`
- Published commit:
  - `ab0e565a79f02f22bf2d6de47cb764ab05ba1309`
- Artifact content ID:
  - `71o47EKSLgJtr27v3aLKxKQQDh7Nsw1ctU7bQVkZru2s`
- Manifest content ID:
  - `EYAHCcuUAMCs4Ey3qZiRvPL5HUTMTWmTKn1LNRUwb2Jc`
- Extracted file count:
  - `13`

Example extracted paths:

- `frontend/index.html`
- `frontend/style.css`
- `frontend/script.js`
- `frontend/app.js`
- `meta/archive-url.txt`

### Live Solana ownership validation

- Verified the IDL-driven ownership client against Solana devnet after the refactor
- Created or updated the repo record for:
  - `0fd9f605c6426871e78b50a7`
- Validation transaction signature:
  - `5a6qKd3fRr7z2QaUWqLQtg7L42EuLzgUTFu5ievwnEGVbJ8LEqY8GUh5vMWR5pjaBLNY8PSF8QV9UdX6oi5ZciA5`
- Readback confirmed:
  - manifest id `EYAHCcuUAMCs4Ey3qZiRvPL5HUTMTWmTKn1LNRUwb2Jc`
  - commit `ab0e565a79f02f22bf2d6de47cb764ab05ba1309`
  - status `published`

### Post-upgrade Solana validation

- After upgrading to Anchor `0.32.1` and regenerating the IDL, verified another real devnet ownership write
- Validation transaction signature:
  - `3JHvWjBSjW6jGSBVr2vScLbTPsXrRaqovPPeqw5ggdc7vqsmZRmrddCKYgqvGm3rCb6hVnL4sPfnZhnTDV5Kxave`

## Notable Fixes Made Along the Way

- Fixed broken frontend imports in `apps/web/components/dashboard-client.tsx`
- Removed client-side shared-package Node crypto breakage by making shared repo-id hashing browser-safe
- Fixed GitHub archive download request headers for live zipball fetches
- Removed runtime mock-mode branching from the API
- Replaced SQLite with pooled Postgres persistence and `pg-mem` tests
- Fixed env loading so root-level and workspace-level runs both resolve live config consistently
- Treated empty optional env vars as unset instead of invalid
- Normalized Solana CLI JSON-array keys for both Solana and Irys consumers
- Replaced the manual Solana serializer with an IDL-driven shared client
- Upgraded Anchor/Solana tooling and removed the temporary legacy-IDL compatibility shim

## Important Commands

### Local development

- API:
  - `npm run dev:api`
- Web:
  - `npm run dev:web`

### Validation

- `npm test --workspace @hub3/api`
- `npm run build`

### Irys utilities

- `npm run irys:status --workspace @hub3/api`
- `npm run irys:fund --workspace @hub3/api -- 0.01`

## Recommended Next Steps

1. Test the real browser flow end-to-end from `http://localhost:3000`
2. Publish via the dashboard after GitHub OAuth login
3. Verify repo detail page loads manifest/tree/file content from the live publish
4. Point `DATABASE_URL` at a managed Postgres provider like Neon or Supabase and run migrations there
5. Optionally add a proper browser E2E test for the publish flow
6. Optionally normalize the Neon SSL URL from `sslmode=require` to `sslmode=verify-full` or `uselibpqcompat=true&sslmode=require`

## Open Notes

- The deployed program is live on devnet and usable
- The backend now uses the shared repo registry IDL client at runtime instead of direct buffer encoding
- Automated IDL generation in WSL is working again under Anchor `0.32.1`
- The prebuilt `avm` Anchor `0.32.1` binary required a newer GLIBC than this distro provides, so the active `anchor` CLI was installed from source in WSL via Cargo
- Storage model:
  - Postgres is for mutable app state, sessions, repo indexing, publish jobs, and fast UI reads
  - Irys is for immutable published artifacts and manifests
  - Solana is for verifiable ownership and registry state
