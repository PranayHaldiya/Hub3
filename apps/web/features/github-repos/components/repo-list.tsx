import type { GithubRepo } from '@hub3/shared';
import { RepoCard } from './repo-card';

export function RepoList({ repos }: { repos: GithubRepo[] }) {
  return (
    <div className="grid gap-5">
      {repos.map((repo) => (
        <RepoCard key={repo.id} repo={repo} />
      ))}
    </div>
  );
}