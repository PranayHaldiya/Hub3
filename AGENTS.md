# Hub3 Agents

This document explains the current agent-facing flow in Hub3.

## Goal

Hub3 lets operators give an agent bounded authority over code asset actions instead of raw wallet control.

The live agent action today is:
- `refresh` a published Hub3 repository when wallet state and policy allow it

## Trust Model

There are two distinct execution surfaces:

1. User-driven browser actions
- GitHub login
- wallet connection
- publish requests
- pricing changes
- x402 unlock flow

2. Agent-safe actions
- use the dedicated signer-backed Hub3 wallet
- are evaluated against saved policy first
- are logged into the dashboard activity timeline

## Current Wallet Flow

The dashboard can provision or resync the Hub3 signer wallet.

Relevant surfaces:
- `POST /agent/wallet/provision`
- `GET /agent/wallet`

The API stores wallet metadata for the operator and keeps the mnemonic reference needed to restore the signer wallet in local development. For the hackathon this gives us a clear signer boundary and repeatable demo flow.

## Policy Model

Current policy fields:
- `active`
- `allowedActions`
- `allowedRepoPatterns`
- `maxSpendPerTransaction`
- `dailySpendLimit`
- `requireApprovalAbove`
- `notes`

Relevant surfaces:
- `GET /agent/policy`
- `POST /agent/policy`

## Agent Refresh Flow

### Readiness check

The dashboard and any agent client can ask Hub3 whether a repo refresh is currently allowed.

Route:
- `GET /agent/actions/refresh/:repoId/check`

Hub3 currently checks:
- repo exists and has already been published
- signer wallet is active
- policy is active
- `refresh` is enabled in policy
- repo matches the allowlist, if one is configured

### Execute action

Route:
- `POST /agent/actions/refresh`

Request body:
```json
{
  "repoId": "<hub3 repo id>"
}
```

Behavior:
- if blocked, Hub3 returns `403` and logs a blocked agent action
- if allowed, Hub3 refreshes the repo and logs the completed action

## Related Product Flows

### Publish
- `POST /repos/publish`

### Pricing
- `POST /repos/:repoId/pricing`

### Paid content access
- `GET /repos/:repoId/access`
- `GET /repos/:repoId/manifest`
- `GET /repos/:repoId/tree`
- `GET /repos/:repoId/file?path=...`

These paid read routes use x402 enforcement and repo access grants.

## Dashboard Expectations

The dashboard should make the following understandable in under a minute:
- is the signer wallet ready?
- what actions are allowed?
- which repos are already in Hub3?
- will the current repo pass the agent readiness check?
- what happened when the action ran?

## What Is Not Live Yet

Not part of the current agent build:
- autonomous repo discovery
- MCP server exposure
- multi-step payment + verify + refresh orchestration inside one agent endpoint
- approval queues for above-threshold actions
- external agent SDK

Those can come next, but the current build already proves the core OWS-aligned thesis: bounded wallet authority for code asset actions.
