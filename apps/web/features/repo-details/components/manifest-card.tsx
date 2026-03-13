import type { RepoManifest } from '@hub3/shared';

export function ManifestCard({ manifest }: { manifest: RepoManifest | null }) {
  if (!manifest) {
    return <section className="card rounded-[28px] p-6">Manifest pending. Publish a repository to populate this record.</section>;
  }

  return (
    <section className="card rounded-[28px] p-6">
      <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Current Manifest</p>
      <dl className="mt-4 grid gap-4 text-sm text-stone-700 md:grid-cols-2">
        <div>
          <dt className="text-stone-500">Root Content ID</dt>
          <dd className="mt-1 break-all text-stone-900">{manifest.rootContentId}</dd>
        </div>
        <div>
          <dt className="text-stone-500">Published At</dt>
          <dd className="mt-1 text-stone-900">{manifest.publishedAt}</dd>
        </div>
        <div>
          <dt className="text-stone-500">Wallet</dt>
          <dd className="mt-1 break-all text-stone-900">{manifest.publisherWallet}</dd>
        </div>
        <div>
          <dt className="text-stone-500">Integrity</dt>
          <dd className="mt-1 break-all text-stone-900">{manifest.integrity.sha256}</dd>
        </div>
      </dl>
    </section>
  );
}