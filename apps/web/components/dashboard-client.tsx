'use client';

import type { Hub3AgentActionType, Hub3AgentPolicyInput } from '@hub3/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { RepoList } from '../features/github-repos/components/repo-list';
import { ApiError, api } from '../lib/api';

const policyActions: Hub3AgentActionType[] = ['unlock', 'publish', 'refresh'];

function lamportsToSol(rawAmount: string) {
  const lamports = BigInt(rawAmount || '0');
  const whole = lamports / 1_000_000_000n;
  const fraction = (lamports % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function normalizePriceLamports(rawAmount: string) {
  const trimmed = rawAmount.trim();
  if (!/^\d+(\.\d{0,9})?$/.test(trimmed)) {
    return null;
  }

  const [wholePart, fractionPart = ''] = trimmed.split('.');
  const lamports = (BigInt(wholePart) * 1_000_000_000n) + BigInt((fractionPart + '000000000').slice(0, 9));
  return lamports.toString();
}

function formatPolicy(summary: Awaited<ReturnType<typeof api.getDashboardSummary>>) {
  return {
    active: summary.policy.active,
    allowedActions: summary.policy.allowedActions,
    allowedRepoPatterns: summary.policy.allowedRepoPatterns.join(', '),
    maxSpendPerTransaction: lamportsToSol(summary.policy.maxSpendPerTransaction),
    dailySpendLimit: lamportsToSol(summary.policy.dailySpendLimit),
    requireApprovalAbove: lamportsToSol(summary.policy.requireApprovalAbove),
    notes: summary.policy.notes ?? ''
  };
}

function statusTone(allowed: boolean) {
  return allowed
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-amber-200 bg-amber-50 text-amber-700';
}

export function DashboardClient() {
  const queryClient = useQueryClient();
  const repos = useQuery({
    queryKey: ['github-repos'],
    queryFn: api.listGithubRepos
  });
  const publishedRepos = useQuery({
    queryKey: ['hub3-repos'],
    queryFn: api.listHub3Repos
  });
  const summary = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: api.getDashboardSummary
  });
  const [policyForm, setPolicyForm] = useState<ReturnType<typeof formatPolicy> | null>(null);
  const [selectedAgentRepoId, setSelectedAgentRepoId] = useState('');

  useEffect(() => {
    if (summary.data) {
      setPolicyForm(formatPolicy(summary.data));
    }
  }, [summary.data]);

  useEffect(() => {
    if (!selectedAgentRepoId && publishedRepos.data?.length) {
      setSelectedAgentRepoId(publishedRepos.data[0].id);
    }
  }, [publishedRepos.data, selectedAgentRepoId]);

  const refreshCheck = useQuery({
    queryKey: ['agent-refresh-check', selectedAgentRepoId],
    queryFn: () => api.checkAgentRefresh(selectedAgentRepoId),
    enabled: Boolean(selectedAgentRepoId)
  });

  const policyMutation = useMutation({
    mutationFn: async () => {
      if (!policyForm) {
        throw new Error('Policy settings are still loading.');
      }

      const maxSpendPerTransaction = normalizePriceLamports(policyForm.maxSpendPerTransaction);
      const dailySpendLimit = normalizePriceLamports(policyForm.dailySpendLimit);
      const requireApprovalAbove = normalizePriceLamports(policyForm.requireApprovalAbove);
      if (!maxSpendPerTransaction || !dailySpendLimit || !requireApprovalAbove) {
        throw new Error('Enter valid SOL values with up to 9 decimal places.');
      }

      const body: Hub3AgentPolicyInput = {
        active: policyForm.active,
        allowedActions: policyForm.allowedActions,
        allowedRepoPatterns: policyForm.allowedRepoPatterns
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        maxSpendPerTransaction,
        dailySpendLimit,
        requireApprovalAbove,
        notes: policyForm.notes.trim() ? policyForm.notes.trim() : null
      };

      return api.updateAgentPolicy(body);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['agent-refresh-check'] })
      ]);
    }
  });

  const walletProvisionMutation = useMutation({
    mutationFn: api.provisionAgentWallet,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['agent-refresh-check'] })
      ]);
    }
  });

  const agentRefreshMutation = useMutation({
    mutationFn: (repoId: string) => api.runAgentRefresh(repoId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['hub3-repos'] }),
        queryClient.invalidateQueries({ queryKey: ['agent-refresh-check'] })
      ]);
    }
  });

  const summaryData = summary.data;
  const publishedRepoList = publishedRepos.data ?? [];
  const selectedPublishedRepo = useMemo(
    () => publishedRepoList.find((repo) => repo.id === selectedAgentRepoId) ?? null,
    [publishedRepoList, selectedAgentRepoId]
  );

  if (repos.isLoading || publishedRepos.isLoading || summary.isLoading || !policyForm || !summaryData) {
    return <div className="card rounded-[28px] p-6">Loading Hub3 dashboard...</div>;
  }

  if (repos.isError || publishedRepos.isError || summary.isError) {
    return (
      <div className="card rounded-[28px] p-6">
        <p className="text-sm text-stone-700">Connect GitHub first to load your Hub3 repos, wallet controls, and policy dashboard.</p>
      </div>
    );
  }

  const wallet = summaryData.wallet;

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="card rounded-[28px] p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-stone-500">OWS Wallet</p>
          <h2 className="mt-3 text-2xl text-stone-900">
            {wallet.status === 'active' ? 'Signer wallet active' : 'Signer wallet not configured yet'}
          </h2>
          <p className="mt-4 text-sm leading-7 text-stone-700">
            This wallet now provisions through the dedicated Hub3 signer service and becomes the boundary for safe agent-triggered actions.
          </p>
          <div className="mt-5 rounded-[22px] border border-[var(--line)] bg-white/60 p-4 text-sm text-stone-700">
            <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Current status</p>
            <p className="mt-2">Mode: <span className="text-stone-900">{wallet.status}</span></p>
            <p className="mt-1">Signer URL: <span className="break-all text-stone-900">{wallet.signerUrl ?? 'Not configured'}</span></p>
            <p className="mt-1">Wallet address: <span className="break-all text-stone-900">{wallet.walletAddress ?? 'Pending OWS provisioning'}</span></p>
            {wallet.vaultId ? <p className="mt-1">Vault: <span className="break-all text-stone-900">{wallet.vaultId}</span></p> : null}
            {wallet.lastError ? <p className="mt-1 text-red-700">Last error: {wallet.lastError}</p> : null}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-xl text-xs leading-5 text-stone-600">
              Provisioning creates or restores the Hub3 OWS vault through the dedicated signer service and persists the vault reference for future agent-safe actions.
            </p>
            <button
              className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm uppercase tracking-[0.22em] text-white disabled:cursor-not-allowed disabled:bg-stone-400"
              disabled={walletProvisionMutation.isPending}
              onClick={() => walletProvisionMutation.mutate()}
              type="button"
            >
              {walletProvisionMutation.isPending
                ? 'Provisioning...'
                : wallet.status === 'active'
                  ? 'Resync OWS wallet'
                  : 'Provision OWS wallet'}
            </button>
          </div>

          {walletProvisionMutation.isError ? (
            <p className="mt-4 rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
              {walletProvisionMutation.error instanceof ApiError
                ? walletProvisionMutation.error.message
                : walletProvisionMutation.error instanceof Error
                  ? walletProvisionMutation.error.message
                  : 'Wallet provisioning failed.'}
            </p>
          ) : null}

          {walletProvisionMutation.isSuccess ? (
            <p className="mt-4 rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-700">
              OWS wallet ready. Hub3 can now use this signer boundary for agent-safe actions.
            </p>
          ) : null}
        </div>

        <section className="card rounded-[28px] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Agent Policy</p>
              <h2 className="mt-3 text-2xl text-stone-900">Bounded controls for code-access agents</h2>
            </div>
            <label className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/70 px-4 py-2 text-xs uppercase tracking-[0.22em] text-stone-700">
              <input
                checked={policyForm.active}
                onChange={(event) => setPolicyForm((current) => current ? { ...current, active: event.target.checked } : current)}
                type="checkbox"
              />
              Policy active
            </label>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="text-xs uppercase tracking-[0.22em] text-stone-500">Max spend / tx (SOL)</span>
              <input
                className="mt-2 w-full rounded-[18px] border border-[var(--line)] bg-white px-4 py-3 text-sm text-stone-900 outline-none"
                onChange={(event) => setPolicyForm((current) => current ? { ...current, maxSpendPerTransaction: event.target.value } : current)}
                type="text"
                value={policyForm.maxSpendPerTransaction}
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-[0.22em] text-stone-500">Daily spend limit (SOL)</span>
              <input
                className="mt-2 w-full rounded-[18px] border border-[var(--line)] bg-white px-4 py-3 text-sm text-stone-900 outline-none"
                onChange={(event) => setPolicyForm((current) => current ? { ...current, dailySpendLimit: event.target.value } : current)}
                type="text"
                value={policyForm.dailySpendLimit}
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-[0.22em] text-stone-500">Approval above (SOL)</span>
              <input
                className="mt-2 w-full rounded-[18px] border border-[var(--line)] bg-white px-4 py-3 text-sm text-stone-900 outline-none"
                onChange={(event) => setPolicyForm((current) => current ? { ...current, requireApprovalAbove: event.target.value } : current)}
                type="text"
                value={policyForm.requireApprovalAbove}
              />
            </label>
          </div>

          <div className="mt-5">
            <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Allowed actions</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {policyActions.map((action) => {
                const checked = policyForm.allowedActions.includes(action);
                return (
                  <label className={`rounded-full border px-4 py-2 text-sm ${checked ? 'border-stone-900 bg-stone-900 text-white' : 'border-[var(--line)] bg-white/70 text-stone-900'}`} key={action}>
                    <input
                      checked={checked}
                      className="sr-only"
                      onChange={() => {
                        setPolicyForm((current) => {
                          if (!current) {
                            return current;
                          }

                          return checked
                            ? { ...current, allowedActions: current.allowedActions.filter((value) => value !== action) }
                            : { ...current, allowedActions: [...current.allowedActions, action] };
                        });
                      }}
                      type="checkbox"
                    />
                    {action}
                  </label>
                );
              })}
            </div>
          </div>

          <label className="mt-5 block">
            <span className="text-xs uppercase tracking-[0.22em] text-stone-500">Allowed repos / orgs</span>
            <input
              className="mt-2 w-full rounded-[18px] border border-[var(--line)] bg-white px-4 py-3 text-sm text-stone-900 outline-none"
              onChange={(event) => setPolicyForm((current) => current ? { ...current, allowedRepoPatterns: event.target.value } : current)}
              placeholder="owner/*, openwallet/*"
              type="text"
              value={policyForm.allowedRepoPatterns}
            />
            <p className="mt-2 text-xs leading-5 text-stone-600">Comma-separated GitHub org/repo patterns used to bound autonomous actions.</p>
          </label>

          <label className="mt-5 block">
            <span className="text-xs uppercase tracking-[0.22em] text-stone-500">Operator notes</span>
            <textarea
              className="mt-2 min-h-28 w-full rounded-[18px] border border-[var(--line)] bg-white px-4 py-3 text-sm text-stone-900 outline-none"
              onChange={(event) => setPolicyForm((current) => current ? { ...current, notes: event.target.value } : current)}
              value={policyForm.notes}
            />
          </label>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-xl text-xs leading-5 text-stone-600">This policy model now gates the first Hub3 agent refresh flow.</p>
            <button
              className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm uppercase tracking-[0.22em] text-white disabled:cursor-not-allowed disabled:bg-stone-400"
              disabled={policyMutation.isPending}
              onClick={() => policyMutation.mutate()}
              type="button"
            >
              {policyMutation.isPending ? 'Saving...' : 'Save policy'}
            </button>
          </div>

          {policyMutation.isError ? (
            <p className="mt-4 rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
              {policyMutation.error instanceof ApiError
                ? policyMutation.error.message
                : policyMutation.error instanceof Error
                  ? policyMutation.error.message
                  : 'Policy update failed.'}
            </p>
          ) : null}

          {policyMutation.isSuccess ? (
            <p className="mt-4 rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-700">
              Policy saved. Hub3 will use these controls as the baseline for agent-safe OWS actions.
            </p>
          ) : null}
        </section>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="card rounded-[28px] p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Agent Console</p>
          <h2 className="mt-3 text-2xl text-stone-900">Run the first Hub3 agent refresh flow</h2>
          <p className="mt-3 text-sm leading-7 text-stone-700">
            This is the first product-shaped agent action in Hub3: choose a published repo, let policy evaluate it, and trigger a refresh through the new OWS-backed operator boundary.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
            <label className="block">
              <span className="text-xs uppercase tracking-[0.22em] text-stone-500">Published Hub3 repo</span>
              <select
                className="mt-2 w-full rounded-[18px] border border-[var(--line)] bg-white px-4 py-3 text-sm text-stone-900 outline-none"
                onChange={(event) => setSelectedAgentRepoId(event.target.value)}
                value={selectedAgentRepoId}
              >
                {publishedRepoList.length === 0 ? <option value="">No published repos yet</option> : null}
                {publishedRepoList.map((repo) => (
                  <option key={repo.id} value={repo.id}>{repo.sourceRepoFullName}</option>
                ))}
              </select>
            </label>

            <div className="rounded-[22px] border border-[var(--line)] bg-white/60 p-4 text-sm text-stone-700">
              <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Selected repo</p>
              <p className="mt-2 text-stone-900">{selectedPublishedRepo?.sourceRepoFullName ?? 'Choose a published repo'}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-stone-500">Hub3 repo id</p>
              <p className="mt-1 break-all text-stone-900">{selectedPublishedRepo?.id ?? 'Unavailable'}</p>
            </div>
          </div>

          {refreshCheck.data ? (
            <div className={`mt-5 rounded-[22px] border px-4 py-4 text-sm leading-6 ${statusTone(refreshCheck.data.allowed)}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-semibold">{refreshCheck.data.allowed ? 'Agent refresh is ready to run.' : 'Agent refresh is currently blocked.'}</p>
                <span className="text-[11px] uppercase tracking-[0.22em]">{refreshCheck.data.allowed ? 'ready' : 'blocked'}</span>
              </div>
              <p className="mt-2">Wallet ready: {refreshCheck.data.walletReady ? 'yes' : 'no'}</p>
              <p>Policy active: {refreshCheck.data.policyActive ? 'yes' : 'no'}</p>
              <p>Refresh allowed: {refreshCheck.data.actionEnabled ? 'yes' : 'no'}</p>
              <p>Matched allowlist: {refreshCheck.data.matchedPattern ?? 'none'}</p>
              {refreshCheck.data.reason ? <p className="mt-2 font-medium">Reason: {refreshCheck.data.reason}</p> : null}
            </div>
          ) : null}

          {refreshCheck.isLoading ? <p className="mt-4 text-sm text-stone-600">Evaluating wallet and policy readiness...</p> : null}

          {publishedRepoList.length === 0 ? (
            <p className="mt-5 rounded-[18px] border border-dashed border-[var(--line)] bg-white/50 px-4 py-3 text-sm leading-6 text-stone-600">
              Publish at least one repository into Hub3 before running the agent refresh flow.
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-xl text-xs leading-5 text-stone-600">Running the action republishes the repository snapshot and records the attempt in Hub3 activity.</p>
            <button
              className="rounded-full bg-stone-900 px-5 py-3 text-sm uppercase tracking-[0.22em] text-white disabled:cursor-not-allowed disabled:bg-stone-400"
              disabled={!selectedAgentRepoId || !refreshCheck.data?.allowed || agentRefreshMutation.isPending}
              onClick={() => agentRefreshMutation.mutate(selectedAgentRepoId)}
              type="button"
            >
              {agentRefreshMutation.isPending ? 'Running agent...' : 'Run agent refresh'}
            </button>
          </div>

          {agentRefreshMutation.isError ? (
            <p className="mt-4 rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
              {agentRefreshMutation.error instanceof ApiError
                ? agentRefreshMutation.error.message
                : agentRefreshMutation.error instanceof Error
                  ? agentRefreshMutation.error.message
                  : 'Agent refresh failed.'}
            </p>
          ) : null}

          {agentRefreshMutation.data ? (
            <p className="mt-4 rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-700">
              Agent refresh completed for {agentRefreshMutation.data.repoFullName}. Job {agentRefreshMutation.data.job?.jobId ?? 'pending'} finished as {agentRefreshMutation.data.status}.
            </p>
          ) : null}
        </div>

        <div className="card rounded-[28px] p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Recent activity</p>
          <div className="mt-4 space-y-3">
            {summaryData.recentActivity.length ? summaryData.recentActivity.map((activity) => (
              <div className="rounded-[20px] border border-[var(--line)] bg-white/70 p-4" key={activity.id}>
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-semibold text-stone-900">{activity.title}</p>
                  <span className="text-[11px] uppercase tracking-[0.22em] text-stone-500">{activity.status}</span>
                </div>
                {activity.detail ? <p className="mt-2 text-sm leading-6 text-stone-700">{activity.detail}</p> : null}
                <p className="mt-2 text-xs uppercase tracking-[0.18em] text-stone-500">{new Date(activity.createdAt).toLocaleString()}</p>
              </div>
            )) : (
              <div className="rounded-[20px] border border-dashed border-[var(--line)] bg-white/50 p-4 text-sm leading-6 text-stone-600">
                No agent activity yet. Publishing, refreshes, pricing changes, and future OWS-driven actions will show up here.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="card rounded-[28px] p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Published repos</p>
          <h2 className="mt-3 text-2xl text-stone-900">Repos already living inside Hub3</h2>
          <div className="mt-5 space-y-3">
            {publishedRepoList.length ? publishedRepoList.map((repo) => (
              <div className="rounded-[20px] border border-[var(--line)] bg-white/70 p-4" key={repo.id}>
                <p className="text-sm font-semibold text-stone-900">{repo.sourceRepoFullName}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.18em] text-stone-500">Latest commit</p>
                <p className="mt-1 break-all text-sm text-stone-700">{repo.latestCommitSha ?? 'Pending publish'}</p>
              </div>
            )) : (
              <div className="rounded-[20px] border border-dashed border-[var(--line)] bg-white/50 p-4 text-sm leading-6 text-stone-600">
                Publish a repository first and it will appear here for agent-safe follow-up actions.
              </div>
            )}
          </div>
        </div>

        <div className="card rounded-[28px] p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Available repos</p>
          <h2 className="mt-3 text-2xl text-stone-900">Select a repository and publish it into Hub3.</h2>
          <div className="mt-5">
            <RepoList repos={repos.data ?? []} />
          </div>
        </div>
      </section>
    </div>
  );
}

