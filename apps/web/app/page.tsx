import Link from 'next/link';
import { GitHubConnectButton } from '../features/auth/components/github-connect-button';
import { WalletConnectButton } from '../features/auth/components/wallet-connect-button';

const proofPoints = [
  {
    label: 'Permanent provenance',
    detail: 'Hub3 stores repo manifests in Irys and keeps a live Solana-linked pointer to the current publish state.'
  },
  {
    label: 'Paid code access',
    detail: 'Priced repos enforce x402 payment requirements and grant time-bound browser access after payment.'
  },
  {
    label: 'Agent-safe walleting',
    detail: 'A dedicated signer service provisions the Hub3 OWS wallet and keeps policy-gated agent actions behind a clear trust boundary.'
  }
];

const workflow = [
  'Connect GitHub and provision the Hub3 OWS wallet.',
  'Publish a public repository into Hub3 and inspect the generated provenance.',
  'Set policy limits, evaluate agent readiness, and run the first agent refresh flow.'
];

const demoChecklist = [
  'Dashboard shows wallet status, policy controls, recent activity, and published repos.',
  'Repo pricing can be set and x402-gated reads return unlock requirements.',
  'Agent console checks whether refresh is allowed before it runs.',
  'Activity timeline records blocked and successful agent actions.'
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-10 md:px-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link className="display text-3xl" href="/">Hub3</Link>
          <p className="mt-2 text-xs uppercase tracking-[0.28em] text-stone-500">OWS Hackathon Build</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="rounded-full border border-stone-300 px-5 py-3 text-xs uppercase tracking-[0.22em]" href="/dashboard">
            Dashboard
          </Link>
          <GitHubConnectButton />
          <WalletConnectButton />
        </div>
      </header>

      <section className="mt-16 grid gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="card rounded-[40px] p-10 md:p-14">
          <p className="text-xs uppercase tracking-[0.36em] text-stone-500">Open Wallet Standard + Code Assets</p>
          <h1 className="display mt-6 max-w-4xl text-6xl leading-[0.95] text-stone-900 md:text-8xl">
            Agents can pay for, verify, and refresh code without owning the keys.
          </h1>
          <p className="mt-8 max-w-3xl text-lg leading-8 text-stone-700">
            Hub3 turns repositories into durable, monetizable code assets. It combines Irys-backed provenance, Solana-linked ownership, x402-gated access, and an OWS-backed signer boundary so agent actions stay visible and policy controlled.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link className="rounded-full bg-[var(--accent)] px-6 py-3 text-sm uppercase tracking-[0.24em] text-white" href="/dashboard">
              Open Dashboard
            </Link>
            <a className="rounded-full border border-stone-300 px-6 py-3 text-sm uppercase tracking-[0.24em]" href="#live-flow">
              See Live Flow
            </a>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {proofPoints.map((item) => (
              <div className="rounded-[24px] border border-[var(--line)] bg-white/70 p-5" key={item.label}>
                <p className="text-xs uppercase tracking-[0.22em] text-stone-500">{item.label}</p>
                <p className="mt-3 text-sm leading-6 text-stone-700">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <aside className="grid gap-5" id="live-flow">
          <div className="card rounded-[28px] p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Live Workflow</p>
            <h2 className="mt-4 text-2xl text-stone-900">What Hub3 can do right now</h2>
            <ol className="mt-5 space-y-3 text-sm leading-7 text-stone-700">
              {workflow.map((step, index) => (
                <li key={step}>{String(index + 1).padStart(2, '0')}. {step}</li>
              ))}
            </ol>
          </div>
          <div className="card rounded-[28px] p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Judge-Friendly Proof</p>
            <div className="mt-4 space-y-3 text-sm leading-7 text-stone-700">
              {demoChecklist.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </div>
        </aside>
      </section>

      <section className="mt-12 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="card rounded-[32px] p-8 md:p-10">
          <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Trust Boundary</p>
          <h2 className="mt-4 text-3xl text-stone-900">Hub3 is opinionated about agent safety.</h2>
          <p className="mt-5 text-sm leading-7 text-stone-700">
            Browser wallets are still used for direct user actions, but Hub3 agent actions are being pushed behind a dedicated signer service. The dashboard makes that visible through wallet state, policy state, and an activity trail that shows when the system blocks or permits refresh attempts.
          </p>
          <div className="mt-6 rounded-[24px] border border-[var(--line)] bg-white/70 p-5 text-sm leading-7 text-stone-700">
            Connect GitHub. Provision the OWS wallet. Save policy limits. Publish a repo. Then use the agent console to see whether refresh is allowed before the system republishes anything.
          </div>
        </div>

        <div className="card rounded-[32px] p-8 md:p-10">
          <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Why This Matters</p>
          <div className="mt-4 space-y-5 text-sm leading-7 text-stone-700">
            <p>
              Centralized code hosting is good at collaboration, but weak at permanence, ownership, and native monetization. Hub3 keeps the familiar GitHub workflow while adding durable publish records and paid access mechanics.
            </p>
            <p>
              The OWS angle makes the project stronger for autonomous software systems: an agent can be given bounded authority instead of raw wallet control, and operators can see exactly what the system was allowed to do.
            </p>
            <p>
              For the hackathon, the point is simple and concrete: code is no longer just stored, it becomes an asset that users and agents can safely transact around.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
