import crypto from 'node:crypto';
import { deriveHub3RepoId } from '@hub3/shared';
import type {
  Hub3AgentActivity,
  Hub3AgentPolicy,
  Hub3AgentPolicyInput,
  Hub3AgentWallet,
  Hub3PaymentReceipt,
  Hub3Repo,
  PricingConfig,
  PublishJob,
  PublishJobStatus,
  RepoManifest
} from '@hub3/shared';
import { config } from './config';
import { parseJson, query, stringifyJson, withTransaction } from './db';

const now = () => new Date().toISOString();

const defaultPricing: PricingConfig = {
  mode: 'free',
  amount: '0',
  tokenMint: 'So11111111111111111111111111111111111111112',
  active: false
};

function defaultAgentWallet(ownerId: string): Hub3AgentWallet {
  const timestamp = now();
  return {
    ownerId,
    status: 'not_configured',
    walletAddress: null,
    vaultId: null,
    signerUrl: config.HUB3_SIGNER_URL ?? null,
    lastError: null,
    lastSyncedAt: null,
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function defaultAgentPolicy(ownerId: string): Hub3AgentPolicy {
  const timestamp = now();
  return {
    ownerId,
    active: true,
    allowedActions: ['unlock', 'publish', 'refresh'],
    allowedRepoPatterns: [],
    maxSpendPerTransaction: '1000000000',
    dailySpendLimit: '5000000000',
    requireApprovalAbove: '500000000',
    notes: 'Default hackathon policy. Restrict this before enabling autonomous actions.',
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function createJsonStore<T>(table: string, keyColumn: string, valueColumn: string) {
  return {
    async get(id: string) {
      const result = await query<{ value: T | string }>(`SELECT ${valueColumn} AS value FROM ${table} WHERE ${keyColumn} = $1`, [id]);
      const row = result.rows[0];
      return row ? parseJson<T>(row.value) : null;
    },
    async set(id: string, value: T) {
      await query(
        `
          INSERT INTO ${table} (${keyColumn}, ${valueColumn})
          VALUES ($1, $2::jsonb)
          ON CONFLICT(${keyColumn}) DO UPDATE SET ${valueColumn} = excluded.${valueColumn}
        `,
        [id, stringifyJson(value)]
      );
      return this;
    }
  };
}

const rawRepoStore = createJsonStore<Hub3Repo>('repos', 'id', 'repo_json');

export const repoStore = {
  async get(id: string) {
    return rawRepoStore.get(id);
  },
  async set(id: string, value: Hub3Repo) {
    await rawRepoStore.set(id, value);
    return this;
  },
  async list() {
    const result = await query<{ repo: Hub3Repo | string }>('SELECT repo_json AS repo FROM repos ORDER BY id ASC');
    return result.rows.map((row) => parseJson<Hub3Repo>(row.repo));
  }
};
export const manifestStore = createJsonStore<RepoManifest>('manifests', 'id', 'manifest_json');
export const publishJobStore = createJsonStore<PublishJob>('publish_jobs', 'id', 'job_json');
const rawAgentWalletStore = createJsonStore<Hub3AgentWallet>('agent_wallets', 'owner_id', 'wallet_json');
const rawAgentPolicyStore = createJsonStore<Hub3AgentPolicy>('agent_policies', 'owner_id', 'policy_json');

export const agentWalletSecretStore = {
  async get(ownerId: string) {
    const result = await query<{ mnemonic: string }>('SELECT mnemonic FROM agent_wallet_secrets WHERE owner_id = $1', [ownerId]);
    return result.rows[0]?.mnemonic ?? null;
  },
  async set(ownerId: string, mnemonic: string) {
    await query(
      'INSERT INTO agent_wallet_secrets (owner_id, mnemonic, updated_at) VALUES ($1, $2, $3) ON CONFLICT(owner_id) DO UPDATE SET mnemonic = excluded.mnemonic, updated_at = excluded.updated_at',
      [ownerId, mnemonic, now()]
    );
    return mnemonic;
  }
};

export const agentWalletStore = {
  async get(ownerId: string) {
    return (await rawAgentWalletStore.get(ownerId)) ?? defaultAgentWallet(ownerId);
  },
  async set(ownerId: string, wallet: Hub3AgentWallet) {
    await rawAgentWalletStore.set(ownerId, {
      ...wallet,
      ownerId,
      updatedAt: now(),
      signerUrl: wallet.signerUrl ?? config.HUB3_SIGNER_URL ?? null
    });
    return this.get(ownerId);
  }
};

export const agentPolicyStore = {
  async get(ownerId: string) {
    return (await rawAgentPolicyStore.get(ownerId)) ?? defaultAgentPolicy(ownerId);
  },
  async set(ownerId: string, policy: Hub3AgentPolicyInput) {
    const current = await this.get(ownerId);
    const next: Hub3AgentPolicy = {
      ...current,
      ...policy,
      ownerId,
      updatedAt: now()
    };
    await rawAgentPolicyStore.set(ownerId, next);
    return next;
  }
};

export const agentActivityStore = {
  async list(ownerId: string, limit = 10) {
    const result = await query<{ activity: Hub3AgentActivity | string }>(
      `
        SELECT activity_json AS activity
        FROM agent_activity_logs
        WHERE owner_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [ownerId, limit]
    );

    return result.rows.map((row) => parseJson<Hub3AgentActivity>(row.activity));
  },
  async log(entry: Omit<Hub3AgentActivity, 'id' | 'createdAt'> & { id?: string; createdAt?: string }) {
    const activity: Hub3AgentActivity = {
      ...entry,
      id: entry.id ?? crypto.randomUUID(),
      createdAt: entry.createdAt ?? now()
    };

    await query(
      `
        INSERT INTO agent_activity_logs (id, owner_id, created_at, activity_json)
        VALUES ($1, $2, $3, $4::jsonb)
      `,
      [activity.id, activity.ownerId, activity.createdAt, stringifyJson(activity)]
    );

    return activity;
  }
};

export const paymentReceiptStore = {
  async list(ownerId: string, limit = 10) {
    const result = await query<{ receipt: Hub3PaymentReceipt | string }>(
      `
        SELECT receipt_json AS receipt
        FROM payment_receipts
        WHERE owner_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [ownerId, limit]
    );

    return result.rows.map((row) => parseJson<Hub3PaymentReceipt>(row.receipt));
  },
  async record(receipt: Omit<Hub3PaymentReceipt, 'id' | 'createdAt'> & { id?: string; createdAt?: string }) {
    const next: Hub3PaymentReceipt = {
      ...receipt,
      id: receipt.id ?? crypto.randomUUID(),
      createdAt: receipt.createdAt ?? now()
    };

    await query(
      `
        INSERT INTO payment_receipts (id, owner_id, created_at, receipt_json)
        VALUES ($1, $2, $3, $4::jsonb)
      `,
      [next.id, next.ownerId, next.createdAt, stringifyJson(next)]
    );

    return next;
  }
};

export type RepoAccessGrant = {
  grantId: string;
  repoId: string;
  payerWallet: string | null;
  createdAt: string;
  expiresAt: string;
};

async function pruneRepoAccessGrants() {
  await query('DELETE FROM repo_access_grants WHERE expires_at <= $1', [new Date().toISOString()]);
}

export const repoAccessGrantStore = {
  async get(repoId: string, grantId?: string) {
    if (!grantId) {
      return null;
    }

    await pruneRepoAccessGrants();
    const result = await query<RepoAccessGrant>(
      `
        SELECT grant_id AS "grantId", repo_id AS "repoId", payer_wallet AS "payerWallet", created_at AS "createdAt", expires_at AS "expiresAt"
        FROM repo_access_grants
        WHERE grant_id = $1 AND repo_id = $2
      `,
      [grantId, repoId]
    );

    return result.rows[0] ?? null;
  },
  async create(repoId: string, payerWallet: string | null) {
    await pruneRepoAccessGrants();

    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + (config.HUB3_REPO_ACCESS_TTL_SECONDS * 1000));
    const grant: RepoAccessGrant = {
      grantId: crypto.randomUUID(),
      repoId,
      payerWallet,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString()
    };

    await query(
      `
        INSERT INTO repo_access_grants (grant_id, repo_id, payer_wallet, created_at, expires_at)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [grant.grantId, grant.repoId, grant.payerWallet, grant.createdAt, grant.expiresAt]
    );

    return grant;
  }
};

export const repoFilesStore = {
  async get(repoId: string) {
    const result = await query<{ path: string; contents: string }>(
      `
        SELECT path, contents
        FROM repo_files
        WHERE repo_id = $1
        ORDER BY path ASC
      `,
      [repoId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return Object.fromEntries(result.rows.map((row: { path: string; contents: string }) => [row.path, row.contents]));
  },
  async set(repoId: string, files: Record<string, string>) {
    await withTransaction(async (client) => {
      await client.query('DELETE FROM repo_files WHERE repo_id = $1', [repoId]);

      for (const [path, contents] of Object.entries(files)) {
        await client.query(
          `
            INSERT INTO repo_files (repo_id, path, contents)
            VALUES ($1, $2, $3)
          `,
          [repoId, path, contents]
        );
      }
    });

    return this;
  }
};

export async function setPublishJobStatus(jobId: string, status: PublishJobStatus, updates: Partial<PublishJob> = {}) {
  const current = await publishJobStore.get(jobId);
  if (!current) {
    return;
  }

  await publishJobStore.set(jobId, {
    ...current,
    ...updates,
    status,
    finishedAt: status === 'complete' || status === 'failed' ? now() : current.finishedAt
  });
}

export async function storeRepoFiles(repoId: string, files: Record<string, string>) {
  await repoFilesStore.set(repoId, files);
}

export async function makeDraftRepo(fullName: string, commitSha: string): Promise<Hub3Repo> {
  const id = deriveHub3RepoId(fullName);
  const existing = await repoStore.get(id);
  if (existing) {
    return existing;
  }

  const repo: Hub3Repo = {
    id,
    sourceProvider: 'github',
    sourceRepoFullName: fullName,
    defaultBranch: 'main',
    ownerGithubLogin: fullName.split('/')[0] ?? 'unknown',
    latestPublishedManifestId: null,
    latestCommitSha: commitSha,
    status: 'draft',
    pricing: defaultPricing,
    createdAt: now(),
    updatedAt: now()
  };

  await repoStore.set(id, repo);
  return repo;
}

