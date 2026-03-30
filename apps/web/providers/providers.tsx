'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { SolanaProvider } from '@solana/react-hooks';
import { autoDiscover, createClient } from '@solana/client';

const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const websocketEndpoint = process.env.NEXT_PUBLIC_SOLANA_WS_URL ?? endpoint.replace('https://', 'wss://').replace('http://', 'ws://');

const solanaClient = createClient({
  endpoint,
  websocketEndpoint,
  walletConnectors: autoDiscover()
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <SolanaProvider
        client={solanaClient}
        walletPersistence={{
          autoConnect: true
        }}
      >
        {children}
      </SolanaProvider>
    </QueryClientProvider>
  );
}
