import Link from 'next/link';
import { GitHubConnectButton } from '../features/auth/components/github-connect-button';
import { WalletConnectButton } from '../features/auth/components/wallet-connect-button';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-10 md:px-10">
      <header className="flex items-center justify-between">
        <Link className="display text-3xl" href="/">Hub3</Link>
        <div className="flex gap-3">
          <GitHubConnectButton />
          <WalletConnectButton />
        </div>
      </header>

      <section className="mt-16 grid gap-10 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="card rounded-[40px] p-10 md:p-14">
          <p className="text-xs uppercase tracking-[0.36em] text-stone-500">Public Repo Publishing Infrastructure</p>
          <h1 className="display mt-6 max-w-4xl text-6xl leading-[0.95] text-stone-900 md:text-8xl">
            Publish GitHub repositories into permanent, readable provenance.
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-8 text-stone-700">
            Hub3 turns public repositories into durable publish records with Irys-backed manifests, Solana-linked ownership, and agent-friendly read APIs.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link className="rounded-full bg-[var(--accent)] px-6 py-3 text-sm uppercase tracking-[0.24em] text-white" href="/dashboard">
              Open Dashboard
            </Link>
            <a className="rounded-full border border-stone-300 px-6 py-3 text-sm uppercase tracking-[0.24em]" href="#overview">
              Read the Flow
            </a>
          </div>
        </div>

        <aside className="grid gap-5" id="overview">
          <div className="card rounded-[28px] p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Phase 1</p>
            <h2 className="mt-4 text-2xl text-stone-900">Hub3 API-driven publish flow</h2>
            <ol className="mt-5 space-y-3 text-sm leading-7 text-stone-700">
              <li>01. Connect GitHub and a Solana wallet</li>
              <li>02. Select a public repo and trigger publish</li>
              <li>03. Hub3 creates artifact + manifest in Irys</li>
              <li>04. Solana registry stores current provenance pointer</li>
            </ol>
          </div>
          <div className="card rounded-[28px] p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Later-ready</p>
            <p className="mt-4 text-sm leading-7 text-stone-700">The same contracts are ready for GitHub Actions, x402 payment gates, and agent-triggered republishing once the core publish-and-browse loop is stable.</p>
          </div>
        </aside>
      </section>
    </main>
  );
}