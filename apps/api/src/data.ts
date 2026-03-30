import crypto from 'node:crypto';
import { deriveHub3RepoId } from '@hub3/shared';
import type {
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

export const repoStore = createJsonStore<Hub3Repo>('repos', 'id', 'repo_json');
export const manifestStore = createJsonStore<RepoManifest>('manifests', 'id', 'manifest_json');
export const publishJobStore = createJsonStore<PublishJob>('publish_jobs', 'id', 'job_json');
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
