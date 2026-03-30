'use client';

import type { Hub3Repo } from '@hub3/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { GitHubConnectButton } from '../../auth/components/github-connect-button';
import { ApiError, api } from '../../../lib/api';

const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const SYSTEM_PROGRAM_MINT = '11111111111111111111111111111111';

function normalizePriceLamports(rawAmount: string) {
  const trimmed = rawAmount.trim();
  if (!/^\d+(\.\d{0,9})?$/.test(trimmed)) {
    return null;
  }

  const [wholePart, fractionPart = ''] = trimmed.split('.');
  const lamports = (BigInt(wholePart) * 1_000_000_000n) + BigInt((fractionPart + '000000000').slice(0, 9));
  return lamports.toString();
}

function lamportsToSol(rawAmount: string) {
  const lamports = BigInt(rawAmount || '0');
  const whole = lamports / 1_000_000_000n;
  const fraction = (lamports % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function readPriceInput(repo: Hub3Repo) {
  if (!repo.pricing.active) {
    return '0.10';
  }

  return repo.pricing.tokenMint === WSOL_MINT || repo.pricing.tokenMint === SYSTEM_PROGRAM_MINT
    ? lamportsToSol(repo.pricing.amount)
    : repo.pricing.amount;
}

export function PricingCard({ repo }: { repo: Hub3Repo }) {
  const [priceMode, setPriceMode] = useState<'free' | 'fixed'>(repo.pricing.active ? 'fixed' : 'free');
  const [priceInput, setPriceInput] = useState(() => readPriceInput(repo));
  const [savedPricing, setSavedPricing] = useState(repo.pricing);
  const viewer = useQuery({
    queryKey: ['github-me'],
    queryFn: api.getGithubMe,
    retry: false
  });

  useEffect(() => {
    setSavedPricing(repo.pricing);
    setPriceMode(repo.pricing.active ? 'fixed' : 'free');
    setPriceInput(readPriceInput(repo));
  }, [repo]);

  const pricingMutation = useMutation({
    mutationFn: async () => {
      if (priceMode === 'fixed') {
        const lamports = normalizePriceLamports(priceInput);
        if (!lamports) {
          throw new Error('Enter a valid SOL amount with up to 9 decimal places.');
        }

        return api.updateRepoPricing(repo.id, {
          mode: 'fixed',
          active: true,
          amount: lamports,
          tokenMint: WSOL_MINT
        });
      }

      return api.updateRepoPricing(repo.id, {
        mode: 'free',
        active: false,
        amount: '0',
        tokenMint: WSOL_MINT
      });
    },
    onSuccess: ({ repo: updatedRepo }) => {
      setSavedPricing(updatedRepo.pricing);
      setPriceMode(updatedRepo.pricing.active ? 'fixed' : 'free');
      setPriceInput(readPriceInput(updatedRepo));
    }
  });

  const accessMessage = viewer.isSuccess
    ? `Connected as ${viewer.data.login}. Saving requires GitHub write access on ${repo.sourceRepoFullName}.`
    : 'Connect GitHub to manage pricing for this repository.';

  return (
    <section className="card rounded-[28px] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Repository Pricing</p>
          <h2 className="mt-3 text-2xl text-stone-900">
            {savedPricing.active ? `${lamportsToSol(savedPricing.amount)} SOL access price` : 'Free public access'}
          </h2>
        </div>
        <span className="rounded-full bg-white/70 px-3 py-1 text-xs uppercase tracking-[0.24em] text-stone-600">
          {savedPricing.active ? 'Fixed price' : 'Open'}
        </span>
      </div>

      <p className="mt-4 text-sm leading-7 text-stone-700">
        This controls the on-chain pricing signal and now drives live x402 paid-read enforcement. A successful payment unlocks repo browsing for the current browser session.
      </p>

      <div className="mt-5 rounded-[22px] border border-[var(--line)] bg-white/60 p-4 text-sm text-stone-700">
        <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Current config</p>
        <p className="mt-2">
          Mode: <span className="text-stone-900">{savedPricing.active ? 'Fixed price' : 'Free'}</span>
        </p>
        <p className="mt-1">
          Settlement token: <span className="break-all text-stone-900">{savedPricing.active ? 'Wrapped SOL' : 'Not active'}</span>
        </p>
      </div>

      <div className="mt-6 space-y-4 rounded-[24px] border border-[var(--line)] bg-[var(--panel-strong)] p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            className={`rounded-[18px] border px-4 py-3 text-left transition-colors duration-200 ${
              priceMode === 'free'
                ? 'border-stone-900 bg-stone-900 text-white'
                : 'border-[var(--line)] bg-white/70 text-stone-900 hover:border-[var(--accent)]'
            }`}
            onClick={() => setPriceMode('free')}
            type="button"
          >
            <p className="text-sm font-semibold">Free</p>
            <p className={`mt-1 text-xs leading-5 ${priceMode === 'free' ? 'text-stone-200' : 'text-stone-600'}`}>
              Anyone can read the repo without a price signal.
            </p>
          </button>
          <button
            className={`rounded-[18px] border px-4 py-3 text-left transition-colors duration-200 ${
              priceMode === 'fixed'
                ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                : 'border-[var(--line)] bg-white/70 text-stone-900 hover:border-[var(--accent)]'
            }`}
            onClick={() => setPriceMode('fixed')}
            type="button"
          >
            <p className="text-sm font-semibold">Fixed price</p>
            <p className={`mt-1 text-xs leading-5 ${priceMode === 'fixed' ? 'text-orange-50' : 'text-stone-600'}`}>
              Store a paid-access price in wSOL terms for the repo.
            </p>
          </button>
        </div>

        {priceMode === 'fixed' ? (
          <label className="block">
            <span className="text-xs uppercase tracking-[0.22em] text-stone-500">Price in SOL</span>
            <input
              className="mt-2 w-full rounded-[18px] border border-[var(--line)] bg-white px-4 py-3 text-sm text-stone-900 outline-none transition-colors duration-200 focus:border-[var(--accent)]"
              inputMode="decimal"
              onChange={(event) => setPriceInput(event.target.value)}
              placeholder="0.10"
              type="text"
              value={priceInput}
            />
            <p className="mt-2 text-xs leading-5 text-stone-600">Stored on-chain as lamports against the wrapped SOL mint.</p>
          </label>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-xs leading-5 text-stone-600">{accessMessage}</p>
          {viewer.isSuccess ? (
            <button
              className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm uppercase tracking-[0.22em] text-white transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-stone-400"
              disabled={pricingMutation.isPending}
              onClick={() => pricingMutation.mutate()}
              type="button"
            >
              {pricingMutation.isPending ? 'Saving...' : 'Save pricing'}
            </button>
          ) : (
            <GitHubConnectButton />
          )}
        </div>

        {pricingMutation.isError ? (
          <p className="rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
            {pricingMutation.error instanceof ApiError
              ? pricingMutation.error.message
              : pricingMutation.error instanceof Error
                ? pricingMutation.error.message
                : 'Pricing update failed.'}
          </p>
        ) : null}

        {pricingMutation.data ? (
          <p className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-700">
            Pricing saved on-chain. Signature: {pricingMutation.data.signature.slice(0, 18)}...
          </p>
        ) : null}
      </div>
    </section>
  );
}
