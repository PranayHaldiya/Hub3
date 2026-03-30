'use client';

import { useWalletConnection } from '@solana/react-hooks';
import { useMutation } from '@tanstack/react-query';
import type { GithubRepo } from '@hub3/shared';
import { api } from '../../../lib/api';

export function PublishButton({ repo }: { repo: GithubRepo }) {
  const { connected, wallet } = useWalletConnection();
  const walletAddress = wallet?.account.address?.toString();
  const publish = useMutation({
    mutationFn: async () => {
      if (!walletAddress) {
        throw new Error('Connect a Solana wallet before publishing.');
      }

      return api.publishRepo({
        sourceRepoFullName: repo.fullName,
        walletAddress,
        initiatedBy: 'user'
      });
    }
  });

  return (
    <div className="space-y-2">
      <button
        className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white shadow-lg shadow-orange-200 transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-stone-400 disabled:shadow-none"
        disabled={!connected || publish.isPending}
        onClick={() => publish.mutate()}
        type="button"
      >
        {publish.isPending
          ? 'Publishing...'
          : publish.data
            ? `Published ${publish.data.hub3RepoId.slice(0, 8)}`
            : connected
              ? 'Publish to Hub3'
              : 'Connect wallet to publish'}
      </button>
      {publish.isError ? (
        <p className="text-xs leading-5 text-red-700">{publish.error instanceof Error ? publish.error.message : 'Publish failed.'}</p>
      ) : !connected ? (
        <p className="text-xs leading-5 text-stone-600">Publishing uses your connected Solana wallet as the provenance owner.</p>
      ) : null}
    </div>
  );
}
