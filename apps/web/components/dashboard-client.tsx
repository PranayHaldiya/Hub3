'use client';

import { useQuery } from '@tanstack/react-query';
import { RepoList } from '../features/github-repos/components/repo-list';
import { api } from '../lib/api';

export function DashboardClient() {
  const repos = useQuery({
    queryKey: ['github-repos'],
    queryFn: api.listGithubRepos
  });

  if (repos.isLoading) {
    return <div className="card rounded-[28px] p-6">Loading repositories...</div>;
  }

  if (repos.isError) {
    return (
      <div className="card rounded-[28px] p-6">
        <p className="text-sm text-stone-700">Connect GitHub first to load your public repositories in Hub3.</p>
      </div>
    );
  }

  return <RepoList repos={repos.data ?? []} />;
}
