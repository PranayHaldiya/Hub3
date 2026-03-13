import { deriveHub3RepoId, type GithubRepo } from '@hub3/shared';
import Link from 'next/link';
import { PublishButton } from '../../publish/components/publish-button';

export function RepoCard({ repo }: { repo: GithubRepo }) {
  return (
    <article className="card rounded-[28px] p-6 transition-transform duration-300 hover:-translate-y-1">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-stone-500">GitHub Source</p>
          <h3 className="mt-2 text-2xl font-semibold text-stone-900">{repo.name}</h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-stone-700">{repo.description ?? 'No description yet.'}</p>
        </div>
        <span className="rounded-full bg-white/70 px-3 py-1 text-xs uppercase tracking-[0.24em] text-stone-600">{repo.defaultBranch}</span>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-stone-600">
        <span>{repo.fullName}</span>
        <span className="text-stone-400">/</span>
        <span>{repo.headSha.slice(0, 10)}</span>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <PublishButton repo={repo} />
        <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm" href={`/repos/${deriveHub3RepoId(repo.fullName)}`}>
          Preview Hub View
        </Link>
      </div>
    </article>
  );
}