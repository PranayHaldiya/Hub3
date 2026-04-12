import Fastify from 'fastify';
import {
  createWallet,
  exportWallet,
  getWallet,
  importWalletMnemonic,
  signTransaction
} from '@open-wallet-standard/core';
import { z } from 'zod';
import { config } from './config';

type OwsWallet = ReturnType<typeof getWallet>;

const provisionWalletSchema = z.object({
  vaultId: z.string().min(3),
  mnemonic: z.string().optional()
});

const signTransactionSchema = z.object({
  vaultId: z.string().min(3),
  txHex: z.string().min(2),
  mnemonic: z.string().optional(),
  chain: z.string().default(config.HUB3_SIGNER_DEFAULT_CHAIN)
});

function requireSecret(authHeader?: string) {
  if (!config.HUB3_SIGNER_SECRET) {
    throw new Error('HUB3_SIGNER_SECRET is not configured');
  }

  return authHeader === `Bearer ${config.HUB3_SIGNER_SECRET}`;
}

function resolveSolanaAddress(wallet: OwsWallet) {
  const account = wallet.accounts.find((candidate) =>
    candidate.chainId.toLowerCase().includes('solana') ||
    candidate.chainId.includes('501') ||
    candidate.derivationPath?.includes('501')
  );

  if (!account) {
    throw new Error('No Solana account found in the OWS wallet');
  }

  return account.address;
}

function ensureWallet(vaultId: string, mnemonic?: string) {
  try {
    return getWallet(vaultId);
  } catch {
    if (mnemonic) {
      return importWalletMnemonic(vaultId, mnemonic);
    }

    return createWallet(vaultId);
  }
}

export async function buildServer() {
  const app = Fastify({ logger: true });

  app.addHook('preHandler', async (request, reply) => {
    if (request.url === '/health') {
      return;
    }

    if (!requireSecret(request.headers.authorization)) {
      return reply.code(401).send({ error: 'Unauthorized signer request' });
    }
  });

  app.get('/health', async () => ({
    ok: true,
    signerConfigured: config.hasSignerSecret
  }));

  app.post('/wallet', async (request, reply) => {
    const input = provisionWalletSchema.parse(request.body);

    try {
      const wallet = ensureWallet(input.vaultId, input.mnemonic);
      const mnemonic = exportWallet(input.vaultId);
      return {
        vaultId: input.vaultId,
        walletAddress: resolveSolanaAddress(wallet),
        mnemonic
      };
    } catch (error) {
      request.log.error(error, 'failed to provision OWS wallet');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Wallet provisioning failed'
      });
    }
  });

  app.post('/sign', async (request, reply) => {
    const input = signTransactionSchema.parse(request.body);

    try {
      ensureWallet(input.vaultId, input.mnemonic);
      const result = signTransaction(input.vaultId, input.chain, input.txHex);
      return {
        signature: result.signature
      };
    } catch (error) {
      request.log.error(error, 'failed to sign OWS transaction');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Transaction signing failed'
      });
    }
  });

  return app;
}

async function main() {
  const app = await buildServer();
  await app.listen({
    port: config.HUB3_SIGNER_PORT,
    host: config.HUB3_SIGNER_HOST
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
