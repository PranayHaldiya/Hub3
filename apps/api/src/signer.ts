import { config } from './config';

type ProvisionWalletResponse = {
  vaultId: string;
  walletAddress: string;
  mnemonic: string;
};

async function signerFetch<T>(path: string, body: object): Promise<T> {
  if (!config.HUB3_SIGNER_URL) {
    throw new Error('HUB3_SIGNER_URL is not configured');
  }

  if (!config.HUB3_SIGNER_SECRET) {
    throw new Error('HUB3_SIGNER_SECRET is not configured');
  }

  const response = await fetch(`${config.HUB3_SIGNER_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.HUB3_SIGNER_SECRET}`
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) as T & { error?: string } : {} as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? `Signer request failed for ${path}`);
  }

  return data as T;
}

export type AgentSignerClient = {
  provisionWallet(input: { vaultId: string; mnemonic?: string | null }): Promise<ProvisionWalletResponse>;
};

export function createAgentSignerClient(): AgentSignerClient {
  return {
    async provisionWallet(input) {
      return signerFetch<ProvisionWalletResponse>('/wallet', {
        vaultId: input.vaultId,
        mnemonic: input.mnemonic ?? undefined
      });
    }
  };
}
