import { deriveHub3RepoId } from '@hub3/shared';
import type {
  Hub3Repo,
  PricingConfig,
  PublishJob,
  PublishJobStatus,
  RepoManifest
} from '@hub3/shared';
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
