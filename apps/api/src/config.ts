import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { Network } from '@x402/core/types';
import { SOLANA_DEVNET_CAIP2, SOLANA_MAINNET_CAIP2, SOLANA_TESTNET_CAIP2 } from '@x402/svm';

function applyEnvFile(filePath: string) {
  const source = readFileSync(filePath, 'utf-8');

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key] || process.env[key]?.trim() === '') {
      process.env[key] = value;
    }
  }
}

for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), 'apps/api/.env')]) {
  if (existsSync(candidate)) {
    applyEnvFile(candidate);
    break;
  }
}

const optionalString = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }

  return value;
}, z.string().optional());

const optionalUrl = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }

  return value;
}, z.string().url().optional());

const envSchema = z.object({
  NODE_ENV: z.string().optional(),
  HUB3_API_URL: z.string().url().default('http://localhost:4000'),
  HUB3_WEB_URL: z.string().url().default('http://localhost:3000'),
  HUB3_SESSION_COOKIE_NAME: z.string().default('hub3_session'),
  HUB3_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
  HUB3_REPO_ACCESS_COOKIE_NAME: z.string().default('hub3_repo_access'),
  HUB3_REPO_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 10),
  HUB3_OAUTH_STATE_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 10),
  DATABASE_URL: optionalString,
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_SSL: z.enum(['true', 'false']).optional(),
  GITHUB_CLIENT_ID: optionalString,
  GITHUB_CLIENT_SECRET: optionalString,
  GITHUB_REDIRECT_URI: optionalUrl,
  IRYS_NODE_URL: optionalUrl,
  IRYS_GATEWAY_URL: z.string().url().default('https://gateway.irys.xyz'),
  IRYS_PRIVATE_KEY: optionalString,
  IRYS_SOLANA_RPC_URL: optionalUrl,
  SOLANA_RPC_URL: optionalUrl,
  SOLANA_PRIVATE_KEY: optionalString,
  SOLANA_COMMITMENT: z.enum(['processed', 'confirmed', 'finalized']).default('confirmed'),
  REPO_REGISTRY_PROGRAM_ID: optionalString,
  X402_FACILITATOR_URL: z.string().url().default('https://facilitator.x402.org'),
  X402_NETWORK: optionalString,
  X402_MAX_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(300)
});

const parsed = envSchema.parse(process.env);
const irysRpcUrl = parsed.IRYS_SOLANA_RPC_URL ?? parsed.SOLANA_RPC_URL ?? null;

function inferX402Network(rpcUrl?: string | null) {
  const normalized = (rpcUrl ?? '').toLowerCase();
  if (normalized.includes('devnet')) {
    return SOLANA_DEVNET_CAIP2;
  }
  if (normalized.includes('testnet')) {
    return SOLANA_TESTNET_CAIP2;
  }
  return SOLANA_MAINNET_CAIP2;
}

export const config = {
  ...parsed,
  githubRedirectUri: parsed.GITHUB_REDIRECT_URI ?? `${parsed.HUB3_API_URL}/auth/github/callback`,
  irysRpcUrl,
  x402Network: (parsed.X402_NETWORK ?? inferX402Network(parsed.SOLANA_RPC_URL)) as Network,
  dbSsl: parsed.DB_SSL === 'true',
  hasGithubConfig: Boolean(parsed.GITHUB_CLIENT_ID && parsed.GITHUB_CLIENT_SECRET),
  hasDatabaseConfig: parsed.NODE_ENV === 'test' ? true : Boolean(parsed.DATABASE_URL),
  hasIrysConfig: Boolean(parsed.IRYS_PRIVATE_KEY && irysRpcUrl),
  hasOwnershipConfig: Boolean(parsed.SOLANA_RPC_URL && parsed.SOLANA_PRIVATE_KEY && parsed.REPO_REGISTRY_PROGRAM_ID)
};
