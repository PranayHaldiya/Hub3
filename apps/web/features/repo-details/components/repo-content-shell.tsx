'use client';

import type { Hub3Repo, RepoAccessStatusResponse, RepoFileResponse, RepoManifest, RepoTreeResponse } from '@hub3/shared';
import { startTransition, useEffect, useState } from 'react';
import { useWalletSession } from '@solana/react-hooks';
import { WalletConnectButton } from '../../auth/components/wallet-connect-button';
import { FileViewer } from '../../repo-browser/components/file-viewer';
import { TreePanel } from '../../repo-browser/components/tree-panel';
import { ApiError, api } from '../../../lib/api';
import { payProtectedResource } from '../../../lib/x402';
import { ManifestCard } from './manifest-card';
import { PricingCard } from './pricing-card';
import { RepoHeader } from './repo-header';

type ProtectedState<T> = {
  data: T | null;
  error: string | null;
  locked: boolean;
};

function toMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }

  return fallback;
}

async function loadState<T>(loader: () => Promise<T>, lockedMessage: string): Promise<ProtectedState<T>> {
  try {
    return {
      data: await loader(),
      error: null,
      locked: false
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 402) {
      return {
        data: null,
        error: lockedMessage,
        locked: true
      };
    }

    return {
      data: null,
      error: toMessage(error, lockedMessage),
      locked: false
    };
  }
}

async function loadRepoContent(repoId: string) {
  const [manifest, tree, file] = await Promise.all([
    loadState(() => api.getManifest(repoId), 'Manifest is currently locked.'),
    loadState(() => api.getTree(repoId), 'Repository tree is currently locked.'),
    loadState(() => api.getFile(repoId, 'README.md'), 'README access is currently locked.')
  ]);

  return { manifest, tree, file };
}

function lamportsToSol(rawAmount: string) {
  const lamports = BigInt(rawAmount || '0');
  const whole = lamports / 1_000_000_000n;
  const fraction = (lamports % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function RepoContentShell({
  repo,
  initialFile,
  initialManifest,
  initialTree
}: {
  repo: Hub3Repo;
  initialFile: ProtectedState<RepoFileResponse>;
  initialManifest: ProtectedState<RepoManifest>;
  initialTree: ProtectedState<RepoTreeResponse>;
}) {
  const walletSession = useWalletSession();
  const [manifestState, setManifestState] = useState(initialManifest);
  const [treeState, setTreeState] = useState(initialTree);
  const [fileState, setFileState] = useState(initialFile);
  const [accessStatus, setAccessStatus] = useState<RepoAccessStatusResponse | null>(null);
  const [accessStatusLoading, setAccessStatusLoading] = useState(repo.pricing.active);
  const [refreshing, setRefreshing] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const hasLockedContent = manifestState.locked || treeState.locked || fileState.locked;

  async function refreshAccessStatus() {
    if (!repo.pricing.active) {
      setAccessStatus(null);
      setAccessStatusLoading(false);
      return;
    }

    setAccessStatusLoading(true);
    try {
      const next = await api.getRepoAccessStatus(repo.id);
      startTransition(() => {
        setAccessStatus(next);
      });
    } catch {
      startTransition(() => {
        setAccessStatus(null);
      });
    } finally {
      setAccessStatusLoading(false);
    }
  }

  async function refreshContent() {
    setRefreshing(true);
    setUnlockError(null);

    try {
      const next = await loadRepoContent(repo.id);
      await refreshAccessStatus();
      startTransition(() => {
        setManifestState(next.manifest);
        setTreeState(next.tree);
        setFileState(next.file);
      });
    } finally {
      setRefreshing(false);
    }
  }

  async function unlockRepo() {
    if (!walletSession) {
      setUnlockError('Connect a Solana wallet before attempting paid access.');
      return;
    }

    setUnlocking(true);
    setUnlockError(null);

    try {
      const manifestResponse = await payProtectedResource(`/repos/${repo.id}/manifest`, walletSession);
      const manifest = await manifestResponse.json() as RepoManifest;
      const next = await loadRepoContent(repo.id);
      await refreshAccessStatus();

      startTransition(() => {
        setManifestState({
          data: manifest,
          error: null,
          locked: false
        });
        setTreeState(next.tree);
        setFileState(next.file);
      });
    } catch (error) {
      setUnlockError(toMessage(error, 'Paid unlock failed.'));
    } finally {
      setUnlocking(false);
    }
  }

  useEffect(() => {
    void refreshAccessStatus();
  }, [repo.id]);

  useEffect(() => {
    if (!hasLockedContent) {
      return;
    }

    void refreshContent();
  }, [hasLockedContent, repo.id]);

  return (
    <>
      <RepoHeader repo={repo} manifest={manifestState.data} />

      {repo.pricing.active ? (
        <section className="card rounded-[28px] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Paid Access</p>
              <h2 className="mt-3 text-2xl text-stone-900">
                {accessStatus?.accessMode === 'payment'
                  ? 'Repository unlocked for this browser session'
                  : accessStatus?.accessMode === 'maintainer'
                    ? 'Maintainer access active'
                    : hasLockedContent
                      ? `${lamportsToSol(repo.pricing.amount)} SOL to unlock this repository`
                      : 'Repository unlocked'}
              </h2>
            </div>
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs uppercase tracking-[0.24em] text-stone-600">
              x402 live
            </span>
          </div>

          <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-700">
            Priced repositories now enforce paid reads through x402. One successful payment unlocks the repo browser for a short session in this browser.
          </p>

          {accessStatus ? (
            <div className="mt-4 rounded-[22px] border border-[var(--line)] bg-white/60 p-4 text-sm text-stone-700">
              <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Access status</p>
              <p className="mt-2">
                Mode: <span className="text-stone-900">{accessStatus.accessMode}</span>
              </p>
              <p className="mt-1">
                Payment required right now: <span className="text-stone-900">{accessStatus.requiresPayment ? 'Yes' : 'No'}</span>
              </p>
              {accessStatus.expiresAt ? (
                <p className="mt-1">
                  Unlock expires: <span className="text-stone-900">{new Date(accessStatus.expiresAt).toLocaleString()}</span>
                </p>
              ) : null}
              {accessStatus.payerWallet ? (
                <p className="mt-1">
                  Paid by: <span className="break-all text-stone-900">{accessStatus.payerWallet}</span>
                </p>
              ) : null}
            </div>
          ) : accessStatusLoading ? (
            <div className="mt-4 rounded-[22px] border border-[var(--line)] bg-white/60 p-4 text-sm text-stone-600">
              Checking repo access status...
            </div>
          ) : null}

          {hasLockedContent ? (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-[22px] border border-[var(--line)] bg-[var(--panel-strong)] p-5">
              <div className="max-w-2xl space-y-2 text-sm text-stone-700">
                <p>{walletSession ? 'Use your connected wallet to sign the x402 payment payload and unlock access.' : 'Connect a Solana wallet to unlock this priced repository.'}</p>
                <p className="text-xs leading-5 text-stone-500">
                  {refreshing || accessStatusLoading ? 'Checking whether this browser already has an active access grant...' : 'Maintainers with GitHub write access can still browse without payment.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {walletSession ? (
                  <button
                    className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm uppercase tracking-[0.22em] text-white transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-stone-400"
                    disabled={unlocking || refreshing}
                    onClick={() => void unlockRepo()}
                    type="button"
                  >
                    {unlocking ? 'Unlocking...' : 'Pay & unlock'}
                  </button>
                ) : (
                  <WalletConnectButton />
                )}

                <button
                  className="rounded-full border border-stone-300 px-5 py-3 text-sm uppercase tracking-[0.22em] text-stone-800 transition-colors duration-200 hover:bg-stone-900 hover:text-white"
                  disabled={refreshing}
                  onClick={() => void refreshContent()}
                  type="button"
                >
                  {refreshing ? 'Checking...' : 'Refresh access'}
                </button>
              </div>
            </div>
          ) : null}

          {unlockError ? (
            <p className="mt-4 rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
              {unlockError}
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-6">
          <ManifestCard locked={manifestState.locked} manifest={manifestState.data} />
          <PricingCard repo={repo} />
        </div>
        <TreePanel locked={treeState.locked} tree={treeState.data} />
      </div>
      <FileViewer file={fileState.data} locked={fileState.locked} />
    </>
  );
}
