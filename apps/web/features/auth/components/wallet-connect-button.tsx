'use client';

import { useBalance, useWalletConnection } from '@solana/react-hooks';
import { useEffect, useRef, useState } from 'react';

function formatAddress(address?: string) {
  if (!address) {
    return 'No wallet connected';
  }

  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function formatSolBalance(lamports: bigint | null | undefined) {
  if (lamports === null || lamports === undefined) {
    return '...';
  }

  return `${(Number(lamports) / 1_000_000_000).toFixed(3)} SOL`;
}

export function WalletConnectButton() {
  const [open, setOpen] = useState(false);
  const {
    connect,
    connected,
    connecting,
    connectors,
    currentConnector,
    disconnect,
    error,
    isReady,
    wallet
  } = useWalletConnection();
  const address = wallet?.account.address?.toString();
  const { lamports, fetching } = useBalance(wallet?.account.address);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (connected) {
      setOpen(false);
    }
  }, [connected]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        className="card rounded-full border px-5 py-3 text-sm uppercase tracking-[0.24em] transition-transform duration-200 hover:-translate-y-0.5"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {isReady ? (connected ? formatAddress(address) : connecting ? 'Connecting...' : 'Connect Solana Wallet') : 'Loading Wallets...'}
      </button>

      {open ? (
        <div className="card absolute right-0 top-[calc(100%+0.75rem)] z-20 w-[22rem] rounded-[28px] border border-[var(--line)] bg-[var(--panel-strong)] p-5 shadow-2xl">
          {!isReady ? (
            <p className="text-sm text-stone-700">Preparing wallet connectors...</p>
          ) : connected ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-stone-500">Wallet Live</p>
                  <p className="mt-2 text-lg font-semibold text-stone-900">{currentConnector?.name ?? 'Connected wallet'}</p>
                </div>
                <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-stone-800">
                  Devnet
                </span>
              </div>

              <div className="rounded-[22px] border border-[var(--line)] bg-white/60 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Address</p>
                <p className="mt-2 break-all text-sm text-stone-900">{address}</p>
              </div>

              <div className="rounded-[22px] border border-[var(--line)] bg-white/60 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Balance</p>
                <p className="mt-2 text-sm text-stone-900">{fetching ? 'Refreshing...' : formatSolBalance(lamports)}</p>
              </div>

              <button
                className="w-full rounded-full border border-stone-300 px-4 py-3 text-sm uppercase tracking-[0.22em] text-stone-800 transition-colors duration-200 hover:bg-stone-900 hover:text-white"
                onClick={() => disconnect()}
                type="button"
              >
                Disconnect Wallet
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-stone-500">Wallet Standard</p>
                <p className="mt-2 text-sm leading-6 text-stone-700">
                  Connect a wallet to publish repositories with a real Solana address.
                </p>
              </div>

              {connectors.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-[var(--line)] bg-white/50 p-4 text-sm leading-6 text-stone-700">
                  No wallet connector was detected. Install a Wallet Standard wallet such as Phantom, Solflare, or Backpack, then refresh.
                </div>
              ) : (
                <div className="grid gap-3">
                  {connectors.map((connector) => (
                    <button
                      className="flex items-center justify-between rounded-[20px] border border-[var(--line)] bg-white/70 px-4 py-3 text-left transition-colors duration-200 hover:border-[var(--accent)] hover:bg-white"
                      disabled={connecting}
                      key={connector.id}
                      onClick={async () => {
                        await connect(connector.id, {
                          autoConnect: true,
                          allowInteractiveFallback: true
                        });
                      }}
                      type="button"
                    >
                      <span className="text-sm font-medium text-stone-900">{connector.name}</span>
                      <span className="text-[11px] uppercase tracking-[0.24em] text-stone-500">
                        {connecting ? 'Opening' : 'Connect'}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {error ? (
                <p className="rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
                  {String(error)}
                </p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
