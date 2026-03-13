import type { Hub3Repo, RepoManifest } from '@hub3/shared';

export function RepoHeader({ repo, manifest }: { repo: Hub3Repo; manifest: RepoManifest | null }) {
  return (
    <section className="card rounded-[32px] p-8">
      <p className="text-xs uppercase tracking-[0.34em] text-stone-500">Published Provenance</p>
      <h1 className="display mt-4 text-5xl text-stone-900">{repo.sourceRepoFullName}</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Repo ID</p>
          <p className="mt-2 text-sm text-stone-800">{repo.id}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Commit</p>
          <p className="mt-2 text-sm text-stone-800">{repo.latestCommitSha?.slice(0, 12)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Manifest</p>
          <p className="mt-2 text-sm text-stone-800">{manifest?.rootContentId.slice(0, 16) ?? 'Pending'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Status</p>
          <p className="mt-2 text-sm text-stone-800">{repo.status}</p>
        </div>
      </div>
    </section>
  );
}