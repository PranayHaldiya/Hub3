'use client';

import { useMutation } from '@tanstack/react-query';
import type { GithubRepo } from '@hub3/shared';
import { api } from '../../../lib/api';

export function PublishButton({ repo }: { repo: GithubRepo }) {
  const publish = useMutation({
    mutationFn: async () => api.publishRepo({
      sourceRepoFullName: repo.fullName,
      walletAddress: 'Hub3Wallet1111111111111111111111111111111',
      initiatedBy: 'user'
    })
  });

  return (
    <button
      className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white shadow-lg shadow-orange-200"
      onClick={() => publish.mutate()}
      type="button"
    >
      {publish.isPending ? 'Publishing...' : publish.data ? `Published ${publish.data.hub3RepoId.slice(0, 8)}` : 'Publish to Hub3'}
    </button>
  );
}