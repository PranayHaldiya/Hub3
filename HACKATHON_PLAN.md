# Hub3 OWS Hackathon Plan

## Submission Thesis

Hub3 is an OWS-powered code asset protocol where agents can safely pay for, verify, and republish repositories with policy-gated wallet access.

## What We Are Shipping

1. OWS signer service for Hub3 agent actions
2. Policy-gated agent controls
3. Paid repo access with x402 and on-chain provenance
4. Dashboard UX for wallet status, policy, activity, and receipts
5. One live agent flow: unlock, verify, refresh/republish
6. Submission-grade docs and demo assets

## What We Are Not Shipping

- NFT marketplace
- Royalties
- Token launch
- On-chain branches and pull requests
- Multi-chain support
- Enterprise features

## Build Order

1. Lock contracts, DB schema, and dashboard surfaces
2. Add OWS signer service
3. Enforce policy before agent-safe actions
4. Add the live agent console flow
5. Rewrite the landing page and docs for judges

## Definition Of Done

- A user can open the Hub3 frontend and understand the product in under a minute
- A user can review and save agent policy controls
- A priced repo can be unlocked with x402
- A repo's provenance can be inspected
- An agent-safe refresh or republish flow is visible in the product
- Activity and receipts are visible in the dashboard
- README and AGENTS docs explain the end-to-end flow
