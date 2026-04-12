import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

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

for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), 'apps/signer/.env')]) {
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

const envSchema = z.object({
  NODE_ENV: z.string().optional(),
  HUB3_SIGNER_PORT: z.coerce.number().int().positive().default(4100),
  HUB3_SIGNER_HOST: z.string().default('0.0.0.0'),
  HUB3_SIGNER_SECRET: optionalString,
  HUB3_SIGNER_DEFAULT_CHAIN: z.string().default('solana')
});

const parsed = envSchema.parse(process.env);

export const config = {
  ...parsed,
  hasSignerSecret: Boolean(parsed.HUB3_SIGNER_SECRET)
};
