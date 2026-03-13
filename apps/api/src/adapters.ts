import bs58 from 'bs58';
import IrysUploader from '@irys/upload';
import Solana from '@irys/upload-solana';
import { Connection, Keypair } from '@solana/web3.js';
import {
  createRepoRegistryClient,
  type RepoRegistryClient,
  type RepoRegistryRecordAccount
} from '@hub3/repo-registry-client';
import type {
  GithubRepo,
  GithubUser,
  Hub3Repo,
  OwnershipAdapter,
  PricingConfig,
  PublishJob,
  RepoManifest,
  SourceControlAdapter,
  StorageAdapter
} from '@hub3/shared';
import { config } from './config';
import {
  makeDraftRepo,
  manifestStore,
  publishJobStore,
  repoStore
} from './data';

const DEFAULT_TOKEN_MINT = '11111111111111111111111111111111';

function githubHeaders(accessToken?: string, accept = 'application/vnd.github+json') {
  return {
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Hub3',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
  };
}

async function readGithubJson<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: githubHeaders(accessToken)
  });

  if (!response.ok) {
    throw new Error(`GitHub request failed: ${response.status} ${path}`);
  }

  return response.json() as Promise<T>;
}

function parseSecretKey(secret: string): Uint8Array {
  const trimmed = secret.trim();

  if (trimmed.startsWith('[')) {
    return Uint8Array.from(JSON.parse(trimmed) as number[]);
  }

  return bs58.decode(trimmed);
}

function normalizeIrysSecret(secret: string): string {
  const trimmed = secret.trim();
  if (trimmed.startsWith('[')) {
    return bs58.encode(Uint8Array.from(JSON.parse(trimmed) as number[]));
  }

  return trimmed;
}

function gatewayUrlFor(contentId: string) {
  return `${config.IRYS_GATEWAY_URL.replace(/\/+$/, '')}/${contentId}`;
}

function anchorEnumToString(value: unknown) {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object') {
    const key = Object.keys(value as Record<string, unknown>)[0];
    if (key) {
      return key;
    }
  }

  throw new Error('Unable to decode Anchor enum value');
}

function mapRepoStatus(value: unknown): Hub3Repo['status'] {
  switch (anchorEnumToString(value).toLowerCase()) {
    case 'draft':
      return 'draft';
    case 'published':
      return 'published';
    case 'failed':
      return 'failed';
    default:
      return 'draft';
  }
}

function mapPricingMode(value: unknown): PricingConfig['mode'] {
  return anchorEnumToString(value).toLowerCase() === 'fixed' ? 'fixed' : 'free';
}

export class GitHubSourceControlAdapter implements SourceControlAdapter {
  async getAuthorizationUrl(state: string) {
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', config.GITHUB_CLIENT_ID!);
    url.searchParams.set('redirect_uri', config.githubRedirectUri);
    url.searchParams.set('scope', 'read:user repo');
    url.searchParams.set('state', state);

    return {
      authorizationUrl: url.toString(),
      state
    };
  }

  async exchangeCodeForSession(code: string): Promise<{ accessToken: string; user: GithubUser }> {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Hub3'
      },
      body: JSON.stringify({
        client_id: config.GITHUB_CLIENT_ID,
        client_secret: config.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: config.githubRedirectUri
      })
    });

    if (!response.ok) {
      throw new Error(`GitHub token exchange failed with ${response.status}`);
    }

    const payload = (await response.json()) as { access_token?: string; error?: string };
    if (!payload.access_token) {
      throw new Error(`GitHub token exchange failed: ${payload.error ?? 'missing access_token'}`);
    }

    const user = await this.getCurrentUser(payload.access_token);
    return { accessToken: payload.access_token, user };
  }

  async getCurrentUser(accessToken: string): Promise<GithubUser> {
    const user = await readGithubJson<{ id: number; login: string; avatar_url: string; name: string | null }>('/user', accessToken);
    return {
      id: user.id,
      login: user.login,
      avatarUrl: user.avatar_url,
      name: user.name
    };
  }

  async listPublicRepos(accessToken: string): Promise<GithubRepo[]> {
    const repos = await readGithubJson<Array<{
      id: number;
      name: string;
      full_name: string;
      description: string | null;
      default_branch: string;
      private: boolean;
      html_url: string;
      updated_at: string;
    }>>('/user/repos?visibility=public&affiliation=owner,collaborator,organization_member&sort=updated&per_page=100', accessToken);

    return repos
      .filter((repo) => !repo.private)
      .map((repo) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        defaultBranch: repo.default_branch,
        headSha: '',
        isPrivate: repo.private,
        htmlUrl: repo.html_url,
        updatedAt: repo.updated_at
      }));
  }

  async resolveRepoRef(accessToken: string, fullName: string, ref?: string) {
    const repo = await readGithubJson<{ default_branch: string }>(`/repos/${fullName}`, accessToken);
    const resolvedRef = ref ?? repo.default_branch;
    const commit = await readGithubJson<{ sha: string }>(`/repos/${fullName}/commits/${resolvedRef}`, accessToken);

    return {
      defaultBranch: repo.default_branch,
      commitSha: commit.sha
    };
  }

  async downloadRepoSnapshot(accessToken: string, fullName: string, ref?: string) {
    const response = await fetch(`https://api.github.com/repos/${fullName}/zipball/${ref ?? 'HEAD'}`, {
      headers: githubHeaders(accessToken),
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`GitHub archive download failed: ${response.status} ${fullName}`);
    }

    return {
      archiveUrl: response.url,
      buffer: Buffer.from(await response.arrayBuffer())
    };
  }
}

export class IrysStorageAdapter implements StorageAdapter {
  private irysPromise?: Promise<any>;

  private async getClient() {
    if (!this.irysPromise) {
      const builder = IrysUploader(Solana)
        .withWallet(normalizeIrysSecret(config.IRYS_PRIVATE_KEY!))
        .withRpc(config.irysRpcUrl!);

      const networkConfigured = config.IRYS_NODE_URL
        ? builder.bundlerUrl(config.IRYS_NODE_URL)
        : /devnet/i.test(config.irysRpcUrl!)
          ? builder.devnet()
          : builder.mainnet();

      this.irysPromise = Promise.resolve(networkConfigured.timeout(60_000) as any);
    }

    return this.irysPromise;
  }

  async uploadArtifact(input: { repoId: string; fileName: string; contents: Buffer }) {
    const irys = await this.getClient();
    const result = await irys.upload(input.contents, {
      tags: [
        { name: 'App-Name', value: 'Hub3' },
        { name: 'Content-Type', value: 'application/zip' },
        { name: 'Hub3-Repo-Id', value: input.repoId },
        { name: 'Hub3-File-Name', value: input.fileName }
      ]
    });

    return {
      contentId: result.id,
      gatewayUrl: gatewayUrlFor(result.id)
    };
  }

  async uploadManifest(manifest: RepoManifest) {
    const irys = await this.getClient();
    const payload = JSON.stringify(manifest);
    const result = await irys.upload(payload, {
      tags: [
        { name: 'App-Name', value: 'Hub3' },
        { name: 'Content-Type', value: 'application/json' },
        { name: 'Hub3-Kind', value: 'manifest' },
        { name: 'Hub3-Repo-Id', value: manifest.hub3RepoId }
      ]
    });

    await manifestStore.set(result.id, manifest);

    return {
      contentId: result.id,
      gatewayUrl: gatewayUrlFor(result.id)
    };
  }

  async getManifest(contentId: string) {
    const cached = await manifestStore.get(contentId);
    if (cached) {
      return cached;
    }

    const response = await fetch(gatewayUrlFor(contentId));
    if (!response.ok) {
      throw new Error(`Manifest ${contentId} not found`);
    }

    const manifest = (await response.json()) as RepoManifest;
    await manifestStore.set(contentId, manifest);
    return manifest;
  }
}

export class SolanaOwnershipAdapter implements OwnershipAdapter {
  private connection?: Connection;
  private payer?: Keypair;
  private client?: RepoRegistryClient;

  private getConnection() {
    if (!this.connection) {
      this.connection = new Connection(config.SOLANA_RPC_URL!, config.SOLANA_COMMITMENT);
    }

    return this.connection;
  }

  private getPayer() {
    if (!this.payer) {
      this.payer = Keypair.fromSecretKey(parseSecretKey(config.SOLANA_PRIVATE_KEY!));
    }

    return this.payer;
  }

  private getClient() {
    if (!this.client) {
      this.client = createRepoRegistryClient({
        connection: this.getConnection(),
        payer: this.getPayer(),
        commitment: config.SOLANA_COMMITMENT,
        programId: config.REPO_REGISTRY_PROGRAM_ID!
      });
    }

    return this.client;
  }

  private async fetchRepoRecord(repoId: string) {
    return this.getClient().fetchRepoRecord(repoId);
  }

  private mapRecordToRepo(repoId: string, record: RepoRegistryRecordAccount, existing: Hub3Repo | null): Hub3Repo {
    return {
      id: repoId,
      sourceProvider: 'github',
      sourceRepoFullName: record.sourceRepoFullName,
      defaultBranch: existing?.defaultBranch ?? 'main',
      ownerGithubLogin: existing?.ownerGithubLogin ?? record.sourceRepoFullName.split('/')[0] ?? 'unknown',
      latestPublishedManifestId: record.currentManifestId,
      latestCommitSha: record.latestCommitSha,
      status: mapRepoStatus(record.status),
      pricing: {
        mode: mapPricingMode(record.pricingMode),
        amount: record.priceAmount.toString(),
        tokenMint: record.paymentTokenMint.toBase58(),
        active: mapPricingMode(record.pricingMode) === 'fixed'
      },
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  async createOrUpdateRepo(input: { repo: Hub3Repo; manifestId: string; commitSha: string; walletAddress: string }) {
    const existing = await this.fetchRepoRecord(input.repo.id);
    const signature = await (
      existing
        ? this.getClient().updateManifest({
            repoId: input.repo.id,
            currentManifestId: input.manifestId,
            latestCommitSha: input.commitSha,
            status: 'published'
          })
        : this.getClient().createRepo({
            repoId: input.repo.id,
            sourceRepoFullName: input.repo.sourceRepoFullName,
            currentManifestId: input.manifestId,
            latestCommitSha: input.commitSha
          })
    );

    const record = await this.fetchRepoRecord(input.repo.id);
    if (!record) {
      throw new Error(`Repo record ${input.repo.id} was not found after transaction`);
    }

    await repoStore.set(input.repo.id, this.mapRecordToRepo(input.repo.id, record, input.repo));

    return { signature };
  }

  async setPricing(repoId: string, pricing: PricingConfig) {
    const signature = await this.getClient().setPricing({
      repoId,
      pricingMode: pricing.active && pricing.mode === 'fixed' ? 'fixed' : 'free',
      paymentTokenMint: pricing.active ? pricing.tokenMint : DEFAULT_TOKEN_MINT,
      priceAmount: pricing.active ? pricing.amount : '0'
    });
    const existing = await repoStore.get(repoId);
    const record = await this.fetchRepoRecord(repoId);
    if (!record) {
      throw new Error(`Repo record ${repoId} was not found after pricing update`);
    }

    await repoStore.set(repoId, this.mapRecordToRepo(repoId, record, existing));

    return { signature };
  }

  async getRepo(repoId: string) {
    try {
      const existing = await repoStore.get(repoId);
      const record = await this.fetchRepoRecord(repoId);

      if (!record) {
        return existing ?? null;
      }

      const repo = this.mapRecordToRepo(repoId, record, existing);
      await repoStore.set(repoId, repo);
      return repo;
    } catch {
      return (await repoStore.get(repoId)) ?? null;
    }
  }

  async getPublishJob(jobId: string): Promise<PublishJob | null> {
    return (await publishJobStore.get(jobId)) ?? null;
  }
}

export function createSourceControlAdapter() {
  if (!config.hasGithubConfig) {
    throw new Error('Missing GitHub OAuth configuration');
  }

  return new GitHubSourceControlAdapter();
}

export function createStorageAdapter() {
  if (!config.hasIrysConfig) {
    throw new Error('Missing Irys configuration');
  }

  return new IrysStorageAdapter();
}

export function createOwnershipAdapter() {
  if (!config.hasOwnershipConfig) {
    throw new Error('Missing Solana ownership configuration');
  }

  return new SolanaOwnershipAdapter();
}

export { makeDraftRepo };


